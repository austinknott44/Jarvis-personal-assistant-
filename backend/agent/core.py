"""Agent core — master on/off state, the chat turn pipeline, and the startup
catch-up. OFF means dormant: no LLM calls, no polling, no voice sessions.
Only the 7am scheduled brief (scheduler.py) runs unattended."""
import logging

from agent import brain, memory
from db.models import AgentState, CacheEntry, utcnow
from db.session import db_session
from safety.gate import expire_stale_approvals

logger = logging.getLogger("jarvis.core")


def _state(db) -> AgentState:
    st = db.query(AgentState).first()
    if not st:
        st = AgentState(id=1, is_on=False)
        db.add(st)
        db.flush()
    return st


def is_on() -> bool:
    with db_session() as db:
        return _state(db).is_on


def start() -> dict:
    """Toggle ON: mark awake, expire stale approvals, run the catch-up."""
    with db_session() as db:
        st = _state(db)
        st.is_on = True
        st.last_started_at = utcnow()
    expired = expire_stale_approvals()
    greeting = startup_catchup()
    if expired:
        greeting += f"\n\n({expired} stale approval(s) expired while I was off.)"
    memory.remember_turn("assistant", greeting)
    return {"status": "on", "greeting": greeting}


def stop() -> dict:
    with db_session() as db:
        st = _state(db)
        st.is_on = False
        st.last_stopped_at = utcnow()
    return {"status": "off"}


def handle_chat(user_message: str, modality: str = "text") -> str:
    """One conversational turn. Refuses politely when the master toggle is off."""
    if not is_on():
        return "I'm currently switched off. Flip the master toggle on and I'm all yours."
    memory.remember_turn("user", user_message, modality)
    reply = brain.chat(user_message)
    memory.remember_turn("assistant", reply, modality)
    return reply


def startup_catchup() -> str:
    """Fast refresh of stale domains + a short 'here's what changed' greeting.
    Each refresh degrades gracefully when its service isn't configured."""
    changes: list[str] = []

    try:
        from tools import school_brightspace
        result = school_brightspace.sync_ical()
        if result.get("new"):
            changes.append(f"{result['new']} new/updated deadline(s) from Brightspace")
    except Exception as exc:
        logger.warning("catch-up brightspace failed: %s", exc)

    try:
        from tools import calendar_unified
        today = calendar_unified.today_summary()
        if today:
            changes.append(today)
    except Exception as exc:
        logger.warning("catch-up calendar failed: %s", exc)

    try:
        from tools import email_unified
        unread = email_unified.unread_counts()
        if unread:
            changes.append(unread)
    except Exception as exc:
        logger.warning("catch-up email failed: %s", exc)

    try:
        from tools import investments
        moves = investments.quick_moves()
        if moves:
            changes.append(moves)
    except Exception as exc:
        logger.warning("catch-up investments failed: %s", exc)

    with db_session() as db:
        entry = db.query(CacheEntry).filter(CacheEntry.domain == "catchup").first()
        payload = {"changes": changes, "at": utcnow().isoformat()}
        if entry:
            entry.payload = payload
            entry.fetched_at = utcnow()
        else:
            db.add(CacheEntry(domain="catchup", payload=payload))

    if not changes:
        return "Welcome back. Nothing new since last time — all quiet."
    return "Welcome back. Here's what changed:\n" + "\n".join(f"• {c}" for c in changes)
