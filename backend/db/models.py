"""SQLAlchemy models — the full memory + state store from BUILD_GUIDE §4.
Schema is designed so pgvector semantic memory can be added later without
breaking changes."""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Fact(Base):
    """Durable facts about the user (name, school, preferences...)."""
    __tablename__ = "facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(255), index=True)
    value: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64), default="general")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Conversation(Base):
    """Chat history, both text and voice turns."""
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | system
    content: Mapped[str] = mapped_column(Text)
    modality: Mapped[str] = mapped_column(String(8), default="text")  # text | voice
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CacheEntry(Base):
    """Latest snapshots per domain (email/deadlines/portfolio/brief...)."""
    __tablename__ = "cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    domain: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Deadline(Base):
    """Unified school deadlines: syllabus-extracted + Brightspace iCal + manual."""
    __tablename__ = "deadlines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(512))
    type: Mapped[str] = mapped_column(String(32), default="assignment")  # assignment|quiz|exam|project|other
    course: Mapped[str] = mapped_column(String(255), default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(32), default="manual")  # syllabus|brightspace|manual
    external_uid: Mapped[str] = mapped_column(String(512), default="", index=True)  # iCal UID for dedupe
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|done|dropped
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Task(Base):
    """User reminders/todos."""
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(512))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str] = mapped_column(String(16), default="user")  # user | agent
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Holding(Base):
    """Manually entered portfolio positions (Robinhood has no official equity API)."""
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    shares: Mapped[float] = mapped_column(Float, default=0.0)
    cost_basis: Mapped[float] = mapped_column(Float, default=0.0)  # per-share average cost
    target_pct: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class WorkoutSplitDay(Base):
    """The user's workout split — editable from the tab AND by voice."""
    __tablename__ = "workout_split"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[str] = mapped_column(String(16), unique=True)  # Monday..Sunday
    focus: Mapped[str] = mapped_column(String(255), default="Rest")
    exercises: Mapped[list] = mapped_column(JSON, default=list)  # [{name, sets, reps}]
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Approval(Base):
    """Every Tier-2 (gated) action waits here until approved/rejected/expired."""
    __tablename__ = "approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action_type: Mapped[str] = mapped_column(String(64))  # send_email | invite_event | move_email | ...
    description: Mapped[str] = mapped_column(Text)
    preview: Mapped[dict] = mapped_column(JSON, default=dict)  # full preview, e.g. exact email draft
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|approved|rejected|expired|executed|failed
    result: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CategoryRule(Base):
    """Learned calendar-event categorization (Personal/Work/School/Clubs)."""
    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matcher: Mapped[dict] = mapped_column(JSON, default=dict)  # {field: organizer|keyword|calendar, value: ...}
    category: Mapped[str] = mapped_column(String(32))  # personal|work|school|clubs
    source: Mapped[str] = mapped_column(String(16), default="user")  # user | agent
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CleanupLog(Base):
    """Every marketing move/delete, for the Cleanup Review view."""
    __tablename__ = "cleanup_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account: Mapped[str] = mapped_column(String(255))
    message_id: Mapped[str] = mapped_column(String(512), default="")
    subject: Mapped[str] = mapped_column(String(1024), default="")
    sender: Mapped[str] = mapped_column(String(512), default="")
    action: Mapped[str] = mapped_column(String(16))  # moved | deleted | restored
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class EmailAccount(Base):
    """Connection metadata per account. Tokens live in the token store; the
    iCloud app-password is Fernet-encrypted (enc_secret), never plaintext."""
    __tablename__ = "email_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))  # gmail | outlook | icloud
    address: Mapped[str] = mapped_column(String(255), default="")
    auth_type: Mapped[str] = mapped_column(String(16))  # oauth | imap
    token_ref: Mapped[str] = mapped_column(String(255), default="")  # filename in .tokens/
    enc_secret: Mapped[str] = mapped_column(Text, default="")  # Fernet ciphertext (iCloud only)
    status: Mapped[str] = mapped_column(String(32), default="disconnected")  # connected|disconnected|read_only|blocked
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CalendarEvent(Base):
    """Local calendar events (study blocks, syllabus class meetings, manual adds)
    merged in the UI with Google/Outlook events."""
    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(512))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location: Mapped[str] = mapped_column(String(512), default="")
    category: Mapped[str] = mapped_column(String(32), default="personal")  # personal|work|school|clubs
    source: Mapped[str] = mapped_column(String(32), default="local")  # local|syllabus|google|outlook
    recurrence: Mapped[str] = mapped_column(String(255), default="")  # e.g. "weekly:MO,WE,FR until:2026-12-20"
    created_by: Mapped[str] = mapped_column(String(16), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentState(Base):
    """Single-row master state: is the agent ON?"""
    __tablename__ = "agent_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    is_on: Mapped[bool] = mapped_column(Boolean, default=False)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MealPlanEntry(Base):
    """Simple built-in meals fallback when Mealie isn't configured."""
    __tablename__ = "meal_plan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[str] = mapped_column(String(16))
    meal: Mapped[str] = mapped_column(String(32), default="dinner")  # breakfast|lunch|dinner|snack
    recipe: Mapped[str] = mapped_column(String(512))
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
