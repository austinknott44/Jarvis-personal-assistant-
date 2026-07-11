"""Permission tier: confidence-gated. Automated inbox cleanup:
- Classify inbox mail as marketing/promotional/spam with concrete signals.
- School mail (purdue.edu / professors / Brightspace / course-related) is
  NEVER touched, regardless of confidence.
- >=95% confident AND not school -> auto-move to Jarvis/Marketing (Tier 1, logged).
- Below 95% -> queue for approval (Tier 2). Never moved silently.
- Items in Jarvis/Marketing older than 3 weeks that were moved at >=95% ->
  auto-Trash (recoverable), every deletion logged to cleanup_log.
- Never deletes from the inbox, never permanently purges.
Gmail only for moves in v1 (iCloud is read-only; Outlook depends on tenant)."""
import logging
import re
from datetime import timedelta

from db.models import CleanupLog, utcnow
from db.session import db_session
from safety.gate import Verdict, check, is_school_related, queue_approval
from tools import email_gmail
from tools.registry import tool

logger = logging.getLogger("jarvis.cleanup")

AUTO_TRASH_AGE = timedelta(weeks=3)

_STRONG_SIGNALS = (
    "% off", "percent off", "coupon", "promo code", "flash sale", "limited time",
    "shop now", "buy now", "act now", "deal of the day", "clearance", "free shipping",
    "exclusive offer", "don't miss", "last chance", "sale ends",
)
_WEAK_SIGNALS = ("sale", "deal", "offer", "discount", "save", "new arrivals",
                 "unsubscribe", "newsletter", "promotion")
_BULK_SENDER_RE = re.compile(
    r"(no-?reply|noreply|newsletter|marketing|promo|offers|deals|email\.|mailer|"
    r"bounce|campaign)", re.I)


def classify(subject: str, sender: str, snippet: str = "") -> dict:
    """Signal-based marketing classifier -> {is_marketing, confidence, signals}.
    MODERATE aggressiveness: clear promotional mail scores high; anything
    ambiguous stays below the 95% autonomy threshold so it asks first."""
    text = f"{subject} {snippet}".lower()
    sender_l = (sender or "").lower()
    signals: list[str] = []

    if is_school_related(sender, subject, snippet):
        return {"is_marketing": False, "confidence": 0.0, "signals": ["school-exempt"]}

    strong = sum(1 for s in _STRONG_SIGNALS if s in text)
    weak = sum(1 for s in _WEAK_SIGNALS if s in text)
    bulk = bool(_BULK_SENDER_RE.search(sender_l))

    if strong:
        signals.append(f"{strong} strong promo keyword(s)")
    if weak:
        signals.append(f"{weak} weak promo keyword(s)")
    if bulk:
        signals.append("bulk/no-reply sender")

    confidence = 0.0
    if strong >= 2 and bulk:
        confidence = 0.97
    elif strong >= 2 or (strong >= 1 and bulk and weak >= 1):
        confidence = 0.95
    elif strong >= 1 and (bulk or weak >= 2):
        confidence = 0.85
    elif bulk and weak >= 2:
        confidence = 0.75
    elif strong or (bulk and weak):
        confidence = 0.6
    elif weak >= 2:
        confidence = 0.4

    return {"is_marketing": confidence >= 0.5, "confidence": confidence, "signals": signals}


def _log(account: str, message_id: str, subject: str, sender: str,
         action: str, confidence: float) -> None:
    with db_session() as db:
        db.add(CleanupLog(account=account, message_id=message_id, subject=subject,
                          sender=sender, action=action, confidence=confidence))


@tool("cleanup_inbox", "Scan the Gmail inbox for marketing/promotional mail. "
      "Moves >=95%-confident marketing to Jarvis/Marketing automatically "
      "(logged); anything less certain is queued for the user's approval. "
      "School mail is never touched.", tier="own-write")
def cleanup_inbox(max_messages: int = 50) -> dict:
    if not email_gmail.is_connected():
        return {"error": "Gmail not connected — connect it in Preferences first"}

    moved, queued, skipped = [], [], 0
    for msg in email_gmail.list_inbox(max_messages):
        result = classify(msg["subject"], msg["sender"], msg.get("snippet", ""))
        if not result["is_marketing"]:
            skipped += 1
            continue

        ctx = {"sender": msg["sender"], "subject": msg["subject"],
               "confidence": result["confidence"]}
        verdict = check("move_email_marketing", ctx)

        if verdict == Verdict.ALLOW:
            r = email_gmail.move_to_marketing(msg["id"])
            if "error" not in r:
                _log("gmail", msg["id"], msg["subject"], msg["sender"],
                     "moved", result["confidence"])
                moved.append(msg["subject"])
        elif verdict == Verdict.REQUIRE_APPROVAL:
            queue_approval(
                "move_email_marketing",
                f"Move to Marketing ({int(result['confidence']*100)}% sure): "
                f"'{msg['subject']}' from {msg['sender']}",
                {"account": "gmail", "message_id": msg["id"],
                 "subject": msg["subject"], "sender": msg["sender"],
                 "confidence": result["confidence"], "signals": result["signals"]},
            )
            queued.append(msg["subject"])

    return {"moved": moved, "queued_for_approval": queued, "left_alone": skipped}


def auto_trash_old_marketing() -> dict:
    """Trash Jarvis/Marketing items older than 3 weeks that were MOVED at
    >=95% confidence (checked against cleanup_log). Recoverable from Trash;
    every deletion logged. Called from the morning brief job."""
    if not email_gmail.is_connected():
        return {"trashed": 0}
    cutoff = utcnow() - AUTO_TRASH_AGE
    trashed = 0
    with db_session() as db:
        eligible = (
            db.query(CleanupLog)
            .filter(CleanupLog.action == "moved",
                    CleanupLog.confidence >= 0.95,
                    CleanupLog.at < cutoff,
                    CleanupLog.account == "gmail")
            .all()
        )
        already_trashed = {
            log.message_id for log in
            db.query(CleanupLog).filter(CleanupLog.action == "deleted").all()
        }
    for log in eligible:
        if log.message_id in already_trashed:
            continue
        if is_school_related(log.sender, log.subject):
            continue  # belt-and-suspenders: school mail never auto-deleted
        r = email_gmail.trash_message(log.message_id)
        if "error" not in r:
            _log("gmail", log.message_id, log.subject, log.sender, "deleted", log.confidence)
            trashed += 1
    return {"trashed": trashed}


def execute_move(preview: dict) -> dict:
    """Approved below-95% move — called by the approvals executor."""
    r = email_gmail.move_to_marketing(preview["message_id"])
    if "error" not in r:
        _log(preview.get("account", "gmail"), preview["message_id"],
             preview.get("subject", ""), preview.get("sender", ""),
             "moved", preview.get("confidence", 0.0))
    return r


def undo_move(message_id: str) -> dict:
    """Restore a moved message to the inbox (Cleanup Review 'undo')."""
    r = email_gmail.restore_from_marketing(message_id)
    if "error" not in r:
        with db_session() as db:
            last = (db.query(CleanupLog)
                    .filter(CleanupLog.message_id == message_id,
                            CleanupLog.action == "moved")
                    .order_by(CleanupLog.at.desc()).first())
            db.add(CleanupLog(account="gmail", message_id=message_id,
                              subject=last.subject if last else "",
                              sender=last.sender if last else "",
                              action="restored", confidence=0.0))
    return r


def get_cleanup_log(limit: int = 100) -> list[dict]:
    with db_session() as db:
        rows = db.query(CleanupLog).order_by(CleanupLog.at.desc()).limit(limit).all()
        return [{
            "id": r.id, "account": r.account, "message_id": r.message_id,
            "subject": r.subject, "sender": r.sender, "action": r.action,
            "confidence": r.confidence, "at": r.at.isoformat(),
        } for r in rows]
