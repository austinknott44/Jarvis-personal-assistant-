"""Permission tier: read (Tier 1). Brightspace live due dates via the user's
personal iCal feed (Calendar → Subscribe inside purdue.brightspace.com).
Purdue does NOT grant students Valence API access, and we never scrape —
the iCal feed is the sanctioned, keyless path. Synced items land in the same
unified `deadlines` table as syllabus + manual items."""
import logging
from datetime import datetime, timezone

import httpx

from config import get_settings
from db.models import Deadline
from db.session import db_session
from tools.registry import tool

logger = logging.getLogger("jarvis.brightspace")


def is_configured() -> bool:
    return bool(get_settings().brightspace_ical_url)


def _guess_type(title: str) -> str:
    t = title.lower()
    if "exam" in t or "midterm" in t or "final" in t:
        return "exam"
    if "quiz" in t:
        return "quiz"
    if "project" in t:
        return "project"
    return "assignment"


def sync_ical() -> dict:
    """Fetch the feed and upsert deadlines (deduped by iCal UID)."""
    if not is_configured():
        return {"configured": False, "new": 0}
    from icalendar import Calendar

    url = get_settings().brightspace_ical_url
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        cal = Calendar.from_ical(resp.content)
    except Exception as exc:
        logger.warning("brightspace ical fetch failed: %s", exc)
        return {"configured": True, "error": str(exc), "new": 0}

    new_count, updated = 0, 0
    with db_session() as db:
        for comp in cal.walk("VEVENT"):
            uid = str(comp.get("UID", ""))
            title = str(comp.get("SUMMARY", "Brightspace item"))
            dt = comp.get("DTSTART")
            due = None
            if dt is not None:
                v = dt.dt
                if isinstance(v, datetime):
                    due = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
                else:  # date only
                    due = datetime(v.year, v.month, v.day, 23, 59, tzinfo=timezone.utc)
            course = str(comp.get("LOCATION", "") or comp.get("CATEGORIES", "") or "")

            existing = db.query(Deadline).filter(Deadline.external_uid == uid).first() if uid else None
            if existing:
                if existing.due_at != due or existing.title != title:
                    existing.due_at = due
                    existing.title = title
                    updated += 1
            else:
                db.add(Deadline(title=title, type=_guess_type(title), course=course,
                                due_at=due, source="brightspace", external_uid=uid))
                new_count += 1
    return {"configured": True, "new": new_count, "updated": updated}


@tool("sync_brightspace", "Refresh assignment/quiz due dates from the "
      "Brightspace iCal feed right now.", tier="read")
def sync_brightspace() -> dict:
    return sync_ical()
