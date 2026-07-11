"""FastAPI entry point — REST + WebSocket surface for the HUD.
Run: uvicorn main:app --reload (or scripts/run-dev.ps1)."""
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

import scheduler as sched
from agent import core, voice
from config import get_settings
from db.models import (
    Approval, Base, CacheEntry, EmailAccount, Fact, utcnow,
)
from db.session import engine, get_db
from tools import load_all

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("jarvis.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)  # idempotent; alembic manages evolutions
    load_all()
    sched.start_scheduler()
    logger.info("%s backend up", get_settings().jarvis_name)
    yield
    sched.stop_scheduler()


app = FastAPI(title="Jarvis", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local + Tailscale-only deployment; never public
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- health ----------

@app.get("/health")
def health() -> dict:
    from tools import (calendar_google, calendar_outlook, email_icloud,
                       investments, meals_mealie, news_rss, school_brightspace,
                       workouts_wger)
    s = get_settings()
    return {
        "status": "ok",
        "agent_on": core.is_on(),
        "integrations": {
            "gemini": bool(s.gemini_api_key),
            "google": calendar_google.is_connected(),
            "google_configured": calendar_google.is_configured(),
            "outlook": calendar_outlook.is_connected(),
            "outlook_configured": calendar_outlook.is_configured(),
            "icloud": email_icloud.is_configured(),
            "brightspace": school_brightspace.is_configured(),
            "alphavantage": investments.is_configured(),
            "mealie": meals_mealie.is_configured(),
            "wger": workouts_wger.is_configured(),
            "rss": news_rss.is_configured(),
            "ntfy": bool(s.ntfy_topic),
        },
    }


# ---------- agent on/off + chat ----------

class ChatIn(BaseModel):
    message: str


@app.post("/agent/start")
def agent_start() -> dict:
    return core.start()


@app.post("/agent/stop")
def agent_stop() -> dict:
    return core.stop()


@app.get("/agent/status")
def agent_status() -> dict:
    return {"on": core.is_on()}


@app.post("/chat")
def chat(body: ChatIn) -> dict:
    return {"reply": core.handle_chat(body.message)}


@app.get("/chat/history")
def chat_history() -> dict:
    from agent.memory import get_recent_history
    return {"history": get_recent_history(50)}


@app.websocket("/voice")
async def voice_ws(ws: WebSocket):
    await ws.accept()
    if not core.is_on():
        await ws.send_json({"type": "error", "message": "Agent is off — flip the master toggle first."})
        await ws.close()
        return
    await voice.run_voice_session(ws)


# ---------- approvals ----------

_EXECUTORS = {}


def _executor(action_type: str):
    """Map approved action types to their executors (registered lazily so
    tool imports stay clean)."""
    if not _EXECUTORS:
        from tools import calendar_unified, email_cleanup, email_unified
        _EXECUTORS.update({
            "send_email": email_unified.execute_send,
            "move_email_marketing": email_cleanup.execute_move,
            "create_event_with_invitees": calendar_unified.execute_invite,
        })
    return _EXECUTORS.get(action_type)


@app.get("/approvals")
def list_approvals(db: Session = Depends(get_db)) -> dict:
    rows = (db.query(Approval).filter(Approval.status == "pending")
            .order_by(Approval.created_at.desc()).all())
    return {"approvals": [{
        "id": a.id, "action_type": a.action_type, "description": a.description,
        "preview": a.preview, "created_at": a.created_at.isoformat(),
        "expires_at": a.expires_at.isoformat() if a.expires_at else None,
    } for a in rows]}


@app.post("/approvals/{approval_id}/approve")
def approve(approval_id: int, db: Session = Depends(get_db)) -> dict:
    a = db.get(Approval, approval_id)
    if not a or a.status != "pending":
        return {"error": "no pending approval with that id"}
    if a.expires_at and a.expires_at < utcnow():
        a.status = "expired"
        db.commit()
        return {"error": "approval expired"}
    a.status = "approved"
    db.commit()
    executor = _executor(a.action_type)
    if not executor:
        a.status = "failed"
        a.result = "no executor for this action type"
        db.commit()
        return {"error": a.result}
    result = executor(a.preview)
    a.status = "failed" if isinstance(result, dict) and result.get("error") else "executed"
    a.result = str(result)[:2000]
    db.commit()
    return {"status": a.status, "result": result}


@app.post("/approvals/{approval_id}/reject")
def reject(approval_id: int, db: Session = Depends(get_db)) -> dict:
    a = db.get(Approval, approval_id)
    if not a or a.status != "pending":
        return {"error": "no pending approval with that id"}
    a.status = "rejected"
    db.commit()
    return {"status": "rejected"}


# ---------- calendar + school ----------

@app.get("/calendar/events")
def calendar_events(days_back: int = 1, days_forward: int = 31) -> dict:
    from tools import calendar_unified
    return {"events": calendar_unified.merged_events(days_back, days_forward)}


@app.get("/deadlines")
def deadlines(days: int = 30) -> dict:
    from tools import tasks_deadlines
    return tasks_deadlines.whats_due(days)


@app.get("/tasks")
def tasks() -> dict:
    from tools import tasks_deadlines
    return tasks_deadlines.list_tasks()


@app.post("/syllabus/upload")
async def syllabus_upload(file: UploadFile = File(...)) -> dict:
    """Parse a syllabus PDF -> extraction for the review screen (nothing committed)."""
    from tools import school_syllabus
    content = await file.read()
    path = school_syllabus.save_upload(file.filename or "syllabus.pdf", content)
    return school_syllabus.parse_syllabus(path)


class SyllabusCommit(BaseModel):
    course_name: str = "Course"
    instructor: str = ""
    meetings: list = []
    dated_items: list = []


@app.post("/syllabus/commit")
def syllabus_commit(body: SyllabusCommit) -> dict:
    """Commit the user-reviewed extraction to calendar + deadlines."""
    from tools import school_syllabus
    return school_syllabus.commit_syllabus(body.model_dump())


@app.post("/brightspace/sync")
def brightspace_sync() -> dict:
    from tools import school_brightspace
    return school_brightspace.sync_ical()


# ---------- email + cleanup ----------

@app.get("/email/inbox")
def email_inbox() -> dict:
    from tools import email_unified
    return {"inbox": email_unified.unified_inbox()}


@app.post("/email/cleanup")
def email_cleanup_run() -> dict:
    from tools import email_cleanup
    return email_cleanup.cleanup_inbox()


@app.get("/cleanup/log")
def cleanup_log() -> dict:
    from tools import email_cleanup
    return {"log": email_cleanup.get_cleanup_log()}


class UndoIn(BaseModel):
    message_id: str


@app.post("/cleanup/undo")
def cleanup_undo(body: UndoIn) -> dict:
    from tools import email_cleanup
    return email_cleanup.undo_move(body.message_id)


# ---------- portfolio ----------

@app.get("/portfolio")
def portfolio() -> dict:
    from tools import investments
    return investments.portfolio_snapshot()


class HoldingIn(BaseModel):
    ticker: str
    shares: float
    cost_basis: float = 0.0
    target_pct: float = 0.0


@app.post("/portfolio/holding")
def set_holding(body: HoldingIn) -> dict:
    from tools import investments
    return investments.set_holding(body.ticker, body.shares, body.cost_basis, body.target_pct)


@app.get("/portfolio/deep-prompt")
def deep_prompt() -> dict:
    from tools import investments
    return investments.deep_analysis_prompt()


# ---------- workout split ----------

@app.get("/workout")
def workout() -> dict:
    from tools import workouts_wger
    return {"split": workouts_wger.get_split()}


class WorkoutDayIn(BaseModel):
    day: str
    focus: str
    exercises: str = ""


@app.post("/workout/day")
def set_workout(body: WorkoutDayIn) -> dict:
    from tools import workouts_wger
    return workouts_wger.set_workout_day(body.day, body.focus, body.exercises)


# ---------- meals + news ----------

@app.get("/meals")
def meals() -> dict:
    from tools import meals_mealie
    return meals_mealie.get_meal_plan()


@app.get("/news")
def news() -> dict:
    from tools import news_rss
    return news_rss.get_news()


# ---------- briefs ----------

@app.get("/brief")
def brief() -> dict:
    stored = sched.get_stored_brief()
    return stored or {"note": "No morning brief yet — it generates at 7:00 AM, "
                              "or POST /brief/run to test."}


@app.post("/brief/run")
def brief_run() -> dict:
    """Manual trigger for testing the morning brief."""
    return sched.run_morning_brief()


@app.get("/catchup")
def catchup(db: Session = Depends(get_db)) -> dict:
    entry = db.query(CacheEntry).filter(CacheEntry.domain == "catchup").first()
    return entry.payload if entry else {"changes": []}


# ---------- preferences + account ----------

@app.post("/preferences/google/connect")
def google_connect() -> dict:
    """Opens Google's consent flow in a local browser (Desktop OAuth)."""
    from tools import calendar_google
    try:
        return {"status": calendar_google.start_oauth_flow()}
    except Exception as exc:
        return {"error": str(exc)}


@app.post("/preferences/outlook/connect")
def outlook_connect() -> dict:
    from tools import calendar_outlook
    return calendar_outlook.start_device_flow()


@app.post("/preferences/outlook/poll")
def outlook_poll() -> dict:
    from tools import calendar_outlook
    return calendar_outlook.complete_device_flow()


class ICloudIn(BaseModel):
    email: str
    app_password: str


@app.post("/preferences/icloud")
def icloud_save(body: ICloudIn, db: Session = Depends(get_db)) -> dict:
    """Store the iCloud app-specific password ENCRYPTED at rest (Fernet,
    ENCRYPTION_KEY). Read-only account — no send, no delete."""
    from crypto import encrypt
    try:
        ciphertext = encrypt(body.app_password)
    except RuntimeError as exc:
        return {"error": str(exc)}
    acct = db.query(EmailAccount).filter(EmailAccount.provider == "icloud").first()
    if not acct:
        acct = EmailAccount(provider="icloud", auth_type="imap")
        db.add(acct)
    acct.address = body.email
    acct.enc_secret = ciphertext
    acct.status = "read_only"
    db.commit()
    return {"status": "saved", "note": "app password encrypted locally; account is read-only"}


class ProfileIn(BaseModel):
    facts: dict  # {key: value}


@app.get("/account/profile")
def get_profile(db: Session = Depends(get_db)) -> dict:
    rows = db.query(Fact).filter(Fact.category == "profile").all()
    return {"profile": {f.key: f.value for f in rows}}


@app.post("/account/profile")
def save_profile(body: ProfileIn) -> dict:
    """About-Me profile seeds the agent's `facts` memory."""
    from agent.memory import store_fact
    for key, value in body.facts.items():
        if value:
            store_fact(key, str(value), category="profile")
    return {"saved": len(body.facts)}
