"""Permission tier: own-write (Tier 1), with a mandatory human REVIEW step.
The PRIMARY school path for Purdue (no student Brightspace API): the user
drag-drops syllabus PDFs; the LLM extracts course name, meeting days/times,
instructor, and all dated items; the user confirms/edits on a review screen;
only then do we commit — class meetings become recurring 'school' calendar
events, dated items land in the unified `deadlines` table."""
import json
import logging
from datetime import datetime, timezone

from config import UPLOAD_DIR
from db.models import CalendarEvent, Deadline
from db.session import db_session

logger = logging.getLogger("jarvis.syllabus")

EXTRACT_PROMPT = """You are parsing a course syllabus. Extract a single JSON object with:
{
  "course_name": "e.g. CHM 25500 — Organic Chemistry",
  "instructor": "name or empty string",
  "meetings": [
    {"days": ["MO","WE","FR"], "start_time": "HH:MM", "end_time": "HH:MM",
     "location": "room/building or empty", "type": "lecture|lab|recitation",
     "first_date": "YYYY-MM-DD or empty", "last_date": "YYYY-MM-DD or empty"}
  ],
  "dated_items": [
    {"title": "Exam 1", "type": "exam|quiz|assignment|project|other",
     "date": "YYYY-MM-DD", "time": "HH:MM or empty"}
  ]
}
Use 24-hour times. Day codes: MO TU WE TH FR SA SU. If the syllabus gives only
week numbers, skip those items. Output ONLY the JSON object, no prose.

SYLLABUS TEXT:
"""


def extract_pdf_text(pdf_path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(pdf_path)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def parse_syllabus(pdf_path: str) -> dict:
    """PDF -> extracted structure for the review screen. Nothing is committed
    until the user confirms."""
    text = extract_pdf_text(pdf_path)
    if not text.strip():
        return {"error": "Could not read any text from that PDF — is it a scan? "
                         "Try a text-based PDF."}
    from agent.brain import quick_summarize
    raw = quick_summarize(EXTRACT_PROMPT + text[:60000])
    if not raw:
        return {"error": "The parser (Gemini) isn't configured or is rate-limited."}
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        raw = raw.rsplit("```", 1)[0] if "```" in raw else raw
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("syllabus JSON parse failed: %s", raw[:500])
        return {"error": "Couldn't parse the syllabus into structured data — try again."}
    data.setdefault("meetings", [])
    data.setdefault("dated_items", [])
    return data


def commit_syllabus(reviewed: dict) -> dict:
    """Commit the user-confirmed extraction: recurring class meetings ->
    calendar (category 'school'), dated items -> deadlines."""
    course = reviewed.get("course_name", "Course")
    meetings_added, deadlines_added = 0, 0

    with db_session() as db:
        for m in reviewed.get("meetings", []):
            days = [d for d in (m.get("days") or []) if d]
            start_time = m.get("start_time") or "09:00"
            end_time = m.get("end_time") or start_time
            first = m.get("first_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
            last = m.get("last_date") or ""
            try:
                sh, sm = (int(x) for x in start_time.split(":"))
                eh, em = (int(x) for x in end_time.split(":"))
                start_dt = datetime.fromisoformat(first).replace(
                    hour=sh, minute=sm, tzinfo=timezone.utc)
                end_dt = start_dt.replace(hour=eh, minute=em)
            except (ValueError, TypeError):
                continue
            recurrence = "weekly:" + ",".join(days)
            if last:
                recurrence += f" until:{last}"
            db.add(CalendarEvent(
                title=f"{course} {m.get('type', 'class')}".strip(),
                start_at=start_dt, end_at=end_dt,
                location=m.get("location", ""), category="school",
                source="syllabus", recurrence=recurrence, created_by="agent"))
            meetings_added += 1

        for item in reviewed.get("dated_items", []):
            date = item.get("date")
            if not date:
                continue
            time_part = item.get("time") or "23:59"
            try:
                h, mi = (int(x) for x in time_part.split(":"))
                due = datetime.fromisoformat(date).replace(hour=h, minute=mi, tzinfo=timezone.utc)
            except (ValueError, TypeError):
                continue
            db.add(Deadline(title=item.get("title", "Item"), type=item.get("type", "other"),
                            course=course, due_at=due, source="syllabus"))
            deadlines_added += 1

    return {"course": course, "meetings_added": meetings_added,
            "deadlines_added": deadlines_added}


def save_upload(filename: str, content: bytes) -> str:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe = "".join(c for c in filename if c.isalnum() or c in "._- ")[:120] or "syllabus.pdf"
    path = UPLOAD_DIR / safe
    path.write_bytes(content)
    return str(path)
