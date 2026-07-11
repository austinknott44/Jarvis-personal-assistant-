"""THE SAFETY GATE — every action in the system passes through check().

Tier 1  ALLOW             reads; create/edit/delete the user's OWN calendar
                          events + tasks; drafts/briefs; auto-move marketing
                          mail at >=95% confidence (non-school, logged);
                          auto-trash Jarvis/Marketing items >3 weeks old that
                          were moved at >=95% (logged, recoverable).
Tier 2  REQUIRE_APPROVAL  sending ANY email; events inviting others; anything
                          external; deleting non-own items; marketing moves
                          below 95% confidence.
Tier 3  FORBIDDEN         money/trade/transfer/payment/booking — the code to
                          do these does not exist anywhere in this repo; this
                          gate hard-refuses if such an action is ever named.

Fail-safe: unknown or ambiguous action types => REQUIRE_APPROVAL.
School-exempt rule: anything from purdue.edu / professors / Brightspace /
course-related is NEVER auto-moved or auto-deleted, regardless of confidence.

This module is enforcement in code — the LLM prompt repeats the rules, but
this is what actually decides.
"""
import logging
from datetime import timedelta
from enum import Enum

from db.models import Approval, utcnow
from db.session import db_session
from notify import send_push

logger = logging.getLogger("jarvis.safety")

MARKETING_CONFIDENCE_THRESHOLD = 0.95
APPROVAL_TTL_HOURS = 24

SCHOOL_DOMAINS = ("purdue.edu", "brightspace.com", "d2l.com")
SCHOOL_KEYWORDS = ("professor", "prof.", "syllabus", "lecture", "exam", "quiz",
                   "assignment", "brightspace", "course", "campus", "registrar",
                   "bursar", "financial aid", "office hours")


class Verdict(str, Enum):
    ALLOW = "ALLOW"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    FORBIDDEN = "FORBIDDEN"


# Tier 1 — auto-allowed action types
_ALLOW = {
    "read", "search", "summarize", "draft", "brief",
    "create_own_event", "edit_own_event", "delete_own_event",
    "create_task", "edit_task", "delete_task", "complete_task",
    "add_deadline", "edit_deadline", "delete_own_deadline",
    "edit_holdings", "edit_workout_split", "edit_meal_plan",
    "edit_fact", "edit_preferences",
}

# Tier 2 — always gated
_GATED = {
    "send_email", "reply_email", "forward_email",
    "create_event_with_invitees", "edit_event_with_invitees",
    "delete_external_item", "external_action",
}

# Tier 3 — forbidden by design. These strings exist ONLY so the gate can refuse
# them loudly; no tool in this codebase implements any of them.
_FORBIDDEN = {
    "spend_money", "payment", "purchase", "transfer_funds", "trade",
    "place_order", "book_travel", "wire", "withdraw", "deposit",
}


def is_school_related(sender: str = "", subject: str = "", body: str = "") -> bool:
    """School mail is exempt from ALL cleanup, always."""
    s = (sender or "").lower()
    text = f"{subject} {body}".lower()
    if any(d in s for d in SCHOOL_DOMAINS):
        return True
    return any(k in text for k in SCHOOL_KEYWORDS)


def check(action_type: str, context: dict | None = None) -> Verdict:
    """The one function every write/external effect must call first."""
    context = context or {}
    at = (action_type or "").lower().strip()

    if at in _FORBIDDEN or any(f in at for f in _FORBIDDEN):
        logger.error("FORBIDDEN action attempted and refused: %s", at)
        return Verdict.FORBIDDEN

    if at in _GATED:
        return Verdict.REQUIRE_APPROVAL

    # Email cleanup: confidence + school checks decide the tier
    if at in ("move_email_marketing", "trash_marketing_email"):
        if is_school_related(context.get("sender", ""), context.get("subject", ""),
                             context.get("body", "")):
            logger.info("School-related mail exempt from cleanup: %s", context.get("subject"))
            return Verdict.REQUIRE_APPROVAL  # never autonomous; surfaces for the user
        confidence = float(context.get("confidence", 0.0))
        if confidence >= MARKETING_CONFIDENCE_THRESHOLD:
            return Verdict.ALLOW
        return Verdict.REQUIRE_APPROVAL

    if at in _ALLOW:
        return Verdict.ALLOW

    # Fail-safe default: unknown => approval required
    logger.warning("Unknown action type '%s' — failing safe to REQUIRE_APPROVAL", at)
    return Verdict.REQUIRE_APPROVAL


def queue_approval(action_type: str, description: str, preview: dict) -> int:
    """Create a pending approval row + one ntfy push. Returns approval id.
    The action executes ONLY after the user approves (see approvals API)."""
    with db_session() as db:
        approval = Approval(
            action_type=action_type,
            description=description,
            preview=preview,
            status="pending",
            expires_at=utcnow() + timedelta(hours=APPROVAL_TTL_HOURS),
        )
        db.add(approval)
        db.flush()
        approval_id = approval.id

    send_push(
        title="Jarvis needs your approval",
        message=description[:400],
        tags=["raised_hand"],
    )
    return approval_id


def expire_stale_approvals() -> int:
    """Auto-reject approvals older than 24h. Called on agent start + brief."""
    with db_session() as db:
        stale = (
            db.query(Approval)
            .filter(Approval.status == "pending", Approval.expires_at < utcnow())
            .all()
        )
        for a in stale:
            a.status = "expired"
        return len(stale)
