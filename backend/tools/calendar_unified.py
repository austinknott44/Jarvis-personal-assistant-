"""Permission tier: read + own-write (Tier 1); events inviting OTHERS are
gated (Tier 2). The unified calendar: merges Google + Outlook + local events
(study blocks, syllabus class meetings, manual adds) into one categorized,
color-coded stream for the Day/Week/Month HUD calendar."""
import logging
from datetime import datetime, timedelta, timezone

from db.models import CalendarEvent, utcnow
from db.session import db_session
from safety.gate import Verdict, check, queue_approval
from tools import calendar_categorize, calendar_google, calendar_outlook
from tools.registry import tool

logger = logging.getLogger("jarvis.calendar")

_WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def _parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(value.strip(), fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


def _expand_recurring(ev: CalendarEvent, window_start: datetime, window_end: datetime) -> list[dict]:
    """Expand 'weekly:MO,WE until:YYYY-MM-DD' recurrences into instances."""
    out = []
    rec = ev.recurrence or ""
    if not rec.startswith("weekly:"):
        return out
    try:
        parts = rec.split()
        days = [_WEEKDAYS[d] for d in parts[0].split(":", 1)[1].split(",") if d in _WEEKDAYS]
        until = None
        for p in parts[1:]:
            if p.startswith("until:"):
                until = _parse_dt(p.split(":", 1)[1])
        duration = (ev.end_at - ev.start_at) if ev.end_at else timedelta(hours=1)
        cursor = max(window_start, ev.start_at)
        cursor = cursor.replace(hour=ev.start_at.hour, minute=ev.start_at.minute,
                                second=0, microsecond=0)
        while cursor <= window_end:
            if cursor.weekday() in days and cursor >= ev.start_at and (not until or cursor <= until):
                out.append(_row(ev, cursor, cursor + duration, instance=True))
            cursor += timedelta(days=1)
    except Exception as exc:
        logger.warning("bad recurrence '%s': %s", rec, exc)
    return out


def _row(ev: CalendarEvent, start: datetime, end: datetime | None, instance: bool = False) -> dict:
    return {
        "id": f"local-{ev.id}" + (f"-{start.date()}" if instance else ""),
        "title": ev.title,
        "start_at": start.isoformat(),
        "end_at": end.isoformat() if end else None,
        "location": ev.location,
        "category": ev.category,
        "source": ev.source,
        "certain": True,
    }


def merged_events(days_back: int = 1, days_forward: int = 30) -> list[dict]:
    """Everything, merged + categorized. Uncertain categories carry
    certain=False so the HUD can ask the user."""
    window_start = utcnow() - timedelta(days=days_back)
    window_end = utcnow() + timedelta(days=days_forward)

    events: list[dict] = []
    for ext in calendar_google.list_events(days_back, days_forward) + \
               calendar_outlook.list_events(days_back, days_forward):
        cat = calendar_categorize.categorize(ext)
        ext["category"] = cat["category"]
        ext["certain"] = cat["certain"]
        events.append(ext)

    with db_session() as db:
        local = db.query(CalendarEvent).all()
    for ev in local:
        if ev.recurrence:
            events.extend(_expand_recurring(ev, window_start, window_end))
        elif ev.start_at and window_start <= ev.start_at <= window_end:
            events.append(_row(ev, ev.start_at, ev.end_at))

    events.sort(key=lambda e: e.get("start_at") or "")
    return events


def today_summary() -> str:
    today = utcnow().date()
    todays = [e for e in merged_events(0, 1)
              if e.get("start_at", "").startswith(str(today))]
    if not todays:
        return ""
    return f"{len(todays)} event(s) on today's calendar"


@tool("get_schedule", "Get the user's calendar events for the next N days "
      "(merged Google + Outlook + local, categorized).", tier="read")
def get_schedule(days: int = 1) -> dict:
    events = merged_events(0, max(1, days))
    return {"events": events[:60]}


@tool("add_calendar_event", "Create a calendar event for the user (their OWN "
      "event — no other attendees). start/end format: YYYY-MM-DD HH:MM (24h). "
      "Use for study blocks, personal events, reminders-with-times. "
      "category: personal, work, school, or clubs.", tier="own-write")
def add_calendar_event(title: str, start: str, end: str = "", location: str = "",
                       category: str = "personal") -> dict:
    if check("create_own_event") != Verdict.ALLOW:
        return {"error": "not allowed"}
    start_dt = _parse_dt(start)
    if not start_dt:
        return {"error": f"could not parse start '{start}' — use YYYY-MM-DD HH:MM"}
    end_dt = _parse_dt(end) or (start_dt + timedelta(hours=1))
    with db_session() as db:
        ev = CalendarEvent(title=title, start_at=start_dt, end_at=end_dt,
                           location=location, category=category.lower(),
                           source="local", created_by="agent")
        db.add(ev)
        db.flush()
        return {"id": ev.id, "title": title, "start_at": start_dt.isoformat()}


@tool("delete_calendar_event", "Delete one of the user's own LOCAL calendar "
      "events by numeric id (from get_schedule ids like 'local-12', pass 12).",
      tier="own-write")
def delete_calendar_event(event_id: int) -> dict:
    if check("delete_own_event") != Verdict.ALLOW:
        return {"error": "not allowed"}
    with db_session() as db:
        ev = db.get(CalendarEvent, event_id)
        if not ev:
            return {"error": f"no local event {event_id}"}
        title = ev.title
        db.delete(ev)
        return {"deleted": title}


@tool("invite_to_event", "Create a Google Calendar event that INVITES other "
      "people (comma-separated emails). This ALWAYS requires the user's "
      "approval before it is sent.", tier="gated")
def invite_to_event(title: str, start: str, end: str, attendee_emails: str) -> dict:
    verdict = check("create_event_with_invitees")
    if verdict == Verdict.FORBIDDEN:
        return {"error": "forbidden"}
    approval_id = queue_approval(
        "create_event_with_invitees",
        f"Invite {attendee_emails} to '{title}' at {start}",
        {"title": title, "start": start, "end": end,
         "attendees": [a.strip() for a in attendee_emails.split(",") if a.strip()]},
    )
    return {"status": "pending_approval", "approval_id": approval_id,
            "note": "Waiting for the user's approval before sending invites."}


def execute_invite(preview: dict) -> dict:
    """Called by the approvals API after the user approves."""
    start_dt = _parse_dt(preview.get("start", ""))
    end_dt = _parse_dt(preview.get("end", "")) or (start_dt + timedelta(hours=1) if start_dt else None)
    if not start_dt:
        return {"error": "bad start time in approved preview"}
    return calendar_google.create_event(
        preview.get("title", "(no title)"), start_dt.isoformat(), end_dt.isoformat(),
        attendees=preview.get("attendees", []))
