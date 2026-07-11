"""The ONE scheduled job: a 7:00 AM America/New_York morning brief that runs
even when the agent is off. Read-only, one batched pass, minimal tokens:
refresh deadlines + calendar + portfolio + news, compose one brief, store it,
send exactly ONE ntfy push. It also runs the marketing-folder 3-week
auto-trash sweep (logged, recoverable). No other unattended activity exists
anywhere in this codebase."""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings
from db.models import CacheEntry, utcnow
from db.session import db_session
from notify import send_push
from safety.gate import expire_stale_approvals

logger = logging.getLogger("jarvis.scheduler")

_scheduler: BackgroundScheduler | None = None


def run_morning_brief() -> dict:
    """Compose + store the brief, push once. Safe to call manually for testing."""
    s = get_settings()
    tz = ZoneInfo(s.timezone)
    today = datetime.now(tz).strftime("%A, %B %d")
    sections: list[str] = []

    expire_stale_approvals()

    # Deadlines (refresh Brightspace first — keyless iCal read)
    try:
        from tools import school_brightspace, tasks_deadlines
        school_brightspace.sync_ical()
        due = tasks_deadlines.whats_due(days=7).get("deadlines", [])
        if due:
            lines = [f"• {d['title']} ({d['course'] or d['type']}) — "
                     f"{d['due_at'][:16].replace('T', ' ')}" for d in due[:8]]
            sections.append("Due this week:\n" + "\n".join(lines))
    except Exception as exc:
        logger.warning("brief deadlines failed: %s", exc)

    # Today's schedule
    try:
        from tools import calendar_unified
        events = calendar_unified.merged_events(0, 1)
        todays = [e for e in events
                  if e.get("start_at", "").startswith(datetime.now(tz).strftime("%Y-%m-%d"))]
        if todays:
            lines = [f"• {e['start_at'][11:16]} {e['title']} [{e['category']}]"
                     for e in todays[:8]]
            sections.append("Today's schedule:\n" + "\n".join(lines))
    except Exception as exc:
        logger.warning("brief calendar failed: %s", exc)

    # Portfolio
    try:
        from tools import investments
        if investments.is_configured():
            brief = investments.investment_brief()
            if brief.get("brief"):
                sections.append("Portfolio:\n" + "\n".join(f"• {l}" for l in brief["brief"][:6]))
    except Exception as exc:
        logger.warning("brief portfolio failed: %s", exc)

    # News
    try:
        from tools import news_rss
        if news_rss.is_configured():
            news = news_rss.get_news()
            if news.get("summary") and not news["summary"].startswith("("):
                sections.append("News:\n" + news["summary"])
    except Exception as exc:
        logger.warning("brief news failed: %s", exc)

    # Cleanup sweep: 3-week auto-trash of high-confidence marketing (logged)
    try:
        from tools import email_cleanup
        swept = email_cleanup.auto_trash_old_marketing()
        if swept.get("trashed"):
            sections.append(f"Cleanup: trashed {swept['trashed']} marketing email(s) "
                            "older than 3 weeks (recoverable, logged).")
    except Exception as exc:
        logger.warning("brief cleanup sweep failed: %s", exc)

    body = f"Good morning — {today}.\n\n" + ("\n\n".join(sections) if sections
           else "Nothing pressing on the radar today.")

    with db_session() as db:
        entry = db.query(CacheEntry).filter(CacheEntry.domain == "morning_brief").first()
        payload = {"text": body, "date": today, "generated_at": utcnow().isoformat()}
        if entry:
            entry.payload = payload
            entry.fetched_at = utcnow()
        else:
            db.add(CacheEntry(domain="morning_brief", payload=payload))

    send_push(title="Jarvis — Morning Brief", message=body[:3500], tags=["sunrise"])
    logger.info("morning brief generated (%d sections)", len(sections))
    return {"sections": len(sections)}


def get_stored_brief() -> dict | None:
    with db_session() as db:
        entry = db.query(CacheEntry).filter(CacheEntry.domain == "morning_brief").first()
        return entry.payload if entry else None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler:
        return
    s = get_settings()
    try:
        hour, minute = (int(x) for x in s.morning_brief_time.split(":"))
    except ValueError:
        hour, minute = 7, 0
    _scheduler = BackgroundScheduler(timezone=s.timezone)
    _scheduler.add_job(run_morning_brief,
                       CronTrigger(hour=hour, minute=minute, timezone=s.timezone),
                       id="morning_brief", replace_existing=True)
    _scheduler.start()
    logger.info("scheduler started — morning brief at %02d:%02d %s", hour, minute, s.timezone)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
