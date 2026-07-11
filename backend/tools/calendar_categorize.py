"""Permission tier: read + own-write (Tier 1). Categorizes every calendar
event as personal/work/school/clubs. Order of authority: learned
category_rules (from user corrections) -> heuristics -> LLM guess -> 'ask'.
When the user corrects a category, we store a rule so similar events
auto-sort next time."""
import logging

from db.models import CategoryRule
from db.session import db_session
from tools.registry import tool

logger = logging.getLogger("jarvis.categorize")

CATEGORIES = ("personal", "work", "school", "clubs")

_SCHOOL_HINTS = ("class", "lecture", "lab ", "exam", "midterm", "final", "quiz",
                 "recitation", "office hours", "purdue", "brightspace", "study")
_WORK_HINTS = ("shift", "work", "meeting", "standup", "interview", "on-call", "payroll")
_CLUB_HINTS = ("club", "society", "fraternity", "sorority", "intramural", "chapter",
               "callout", "org meeting", "volunteer")


def _rule_match(event: dict) -> str | None:
    with db_session() as db:
        rules = db.query(CategoryRule).all()
    text = f"{event.get('title', '')} {event.get('location', '')}".lower()
    organizer = (event.get("organizer") or "").lower()
    calendar = (event.get("calendar") or "").lower()
    for r in rules:
        m = r.matcher or {}
        field, value = m.get("field"), (m.get("value") or "").lower()
        if not value:
            continue
        if field == "organizer" and value in organizer:
            return r.category
        if field == "keyword" and value in text:
            return r.category
        if field == "calendar" and value in calendar:
            return r.category
    return None


def _heuristic(event: dict) -> tuple[str | None, float]:
    text = f"{event.get('title', '')} {event.get('location', '')} {event.get('calendar', '')}".lower()
    organizer = (event.get("organizer") or "").lower()
    source = event.get("source", "")
    if source in ("syllabus", "brightspace") or "purdue.edu" in organizer:
        return "school", 0.99
    if any(h in text for h in _SCHOOL_HINTS):
        return "school", 0.8
    if any(h in text for h in _CLUB_HINTS):
        return "clubs", 0.75
    if any(h in text for h in _WORK_HINTS):
        return "work", 0.7
    return None, 0.0


def categorize(event: dict) -> dict:
    """Returns {category, certain}. certain=False means the HUD should ask the
    user (their answer becomes a learned rule)."""
    learned = _rule_match(event)
    if learned:
        return {"category": learned, "certain": True}

    cat, conf = _heuristic(event)
    if cat and conf >= 0.75:
        return {"category": cat, "certain": conf >= 0.9}

    # LLM guess as a tiebreaker — cheap single call, degrades to 'personal/ask'
    try:
        from agent.brain import quick_summarize
        guess = quick_summarize(
            "Categorize this calendar event as exactly one word — personal, work, "
            f"school, or clubs:\ntitle: {event.get('title')}\norganizer: "
            f"{event.get('organizer')}\ncalendar: {event.get('calendar')}\n"
            f"location: {event.get('location')}\nAnswer with only the word."
        ).strip().lower()
        if guess in CATEGORIES:
            return {"category": guess, "certain": False}
    except Exception as exc:
        logger.debug("LLM categorize unavailable: %s", exc)

    return {"category": "personal", "certain": False}


@tool("set_event_category", "Correct/confirm a calendar event's category "
      "(personal, work, school, or clubs). Learns the pattern: pass "
      "match_field (organizer, keyword, or calendar) and match_value so "
      "similar events auto-sort in future.", tier="own-write")
def set_event_category(category: str, match_field: str, match_value: str) -> dict:
    category = category.lower().strip()
    if category not in CATEGORIES:
        return {"error": f"category must be one of {CATEGORIES}"}
    if match_field not in ("organizer", "keyword", "calendar"):
        return {"error": "match_field must be organizer, keyword, or calendar"}
    with db_session() as db:
        db.add(CategoryRule(matcher={"field": match_field, "value": match_value},
                            category=category, source="user"))
    return {"learned": f"{match_field}~'{match_value}' → {category}"}
