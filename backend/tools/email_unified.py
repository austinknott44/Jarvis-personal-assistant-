"""Permission tier: read + draft (Tier 1); SEND always gated (Tier 2).
Unified 3-account inbox (Gmail + Outlook + iCloud), 'needs reply' ranking,
drafting, and the approval-gated send path. Deadline-looking emails are
FLAGGED for confirmation — never auto-added to deadlines."""
import logging

from safety.gate import Verdict, check, queue_approval
from tools import email_gmail, email_icloud, email_outlook
from tools.registry import tool

logger = logging.getLogger("jarvis.email")

_NEEDS_REPLY_HINTS = ("?", "please respond", "let me know", "rsvp", "confirm",
                      "can you", "could you", "are you", "will you", "reply",
                      "get back to me", "deadline", "due", "asap")
_DEADLINE_HINTS = ("due", "deadline", "submit", "exam", "quiz", "assignment",
                   "midterm", "final", "by friday", "by monday")


def unified_inbox(max_per_account: int = 15) -> list[dict]:
    inbox: list[dict] = []
    inbox.extend(email_gmail.list_inbox(max_per_account))
    inbox.extend(email_outlook.list_inbox(max_per_account))
    inbox.extend(email_icloud.list_inbox(max_per_account))
    for m in inbox:
        text = f"{m['subject']} {m.get('snippet', '')}".lower()
        m["needs_reply"] = m.get("unread", False) and any(h in text for h in _NEEDS_REPLY_HINTS)
        m["deadline_flag"] = any(h in text for h in _DEADLINE_HINTS)
    inbox.sort(key=lambda m: (not m["needs_reply"], not m.get("unread", False)))
    return inbox


def unread_counts() -> str:
    parts = []
    for name, fn in (("Gmail", email_gmail.unread_count),
                     ("Outlook", email_outlook.unread_count),
                     ("iCloud", email_icloud.unread_count)):
        n = fn()
        if n:
            parts.append(f"{n} unread in {name}")
    return "; ".join(parts)


@tool("summarize_email", "Fetch the unified inbox across Gmail, Outlook, and "
      "iCloud — subjects, senders, what's unread, what needs a reply, and "
      "which messages look deadline-related (flagged, never auto-added).",
      tier="read")
def summarize_email() -> dict:
    inbox = unified_inbox()
    if not inbox:
        return {"note": "No email accounts connected yet — connect them in Preferences."}
    return {
        "unread": unread_counts() or "nothing unread",
        "needs_reply": [
            {"account": m["account"], "subject": m["subject"], "sender": m["sender"]}
            for m in inbox if m["needs_reply"]
        ][:10],
        "deadline_flagged": [
            {"account": m["account"], "subject": m["subject"], "sender": m["sender"],
             "note": "confirm before adding to deadlines"}
            for m in inbox if m["deadline_flag"]
        ][:10],
        "recent": [
            {"account": m["account"], "subject": m["subject"], "sender": m["sender"],
             "unread": m.get("unread", False)}
            for m in inbox
        ][:20],
    }


@tool("send_email", "Send an email FROM the user's Gmail or Outlook account. "
      "This ALWAYS queues for the user's approval with a full preview — it "
      "never sends immediately. account is 'gmail' or 'outlook'.", tier="gated")
def send_email(account: str, to: str, subject: str, body: str) -> dict:
    account = account.lower().strip()
    if account == "icloud":
        return {"error": "iCloud is read-only in this build — use gmail or outlook"}
    if account not in ("gmail", "outlook"):
        return {"error": "account must be gmail or outlook"}

    verdict = check("send_email")
    if verdict == Verdict.FORBIDDEN:
        return {"error": "forbidden"}
    approval_id = queue_approval(
        "send_email",
        f"Send from {account} to {to}: '{subject}'",
        {"account": account, "to": to, "subject": subject, "body": body},
    )
    return {"status": "pending_approval", "approval_id": approval_id,
            "note": "Draft queued — the user must approve before anything is sent."}


def execute_send(preview: dict) -> dict:
    """Called by the approvals executor after the user approves."""
    account = preview.get("account", "gmail")
    if account == "gmail":
        return email_gmail.send_message(preview["to"], preview["subject"], preview["body"])
    if account == "outlook":
        return email_outlook.send_message(preview["to"], preview["subject"], preview["body"])
    return {"error": f"cannot send from {account}"}
