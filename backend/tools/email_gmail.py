"""Permission tier: read + draft (Tier 1); SEND is gated (Tier 2); cleanup
moves are confidence-gated via safety.gate. Gmail API with minimum scopes
(readonly + compose + modify — modify is needed to move/label/trash; there is
no delete-everything scope). Shares the Google OAuth token with the calendar."""
import base64
import logging
from email.mime.text import MIMEText

from tools import calendar_google

logger = logging.getLogger("jarvis.email.gmail")

MARKETING_LABEL = "Jarvis/Marketing"


def is_connected() -> bool:
    return calendar_google.is_connected()


def _service():
    creds = calendar_google._credentials()
    if not creds:
        return None
    from googleapiclient.discovery import build
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _headers(msg: dict) -> dict:
    return {h["name"].lower(): h["value"]
            for h in (msg.get("payload", {}).get("headers") or [])}


def list_inbox(max_results: int = 25, query: str = "in:inbox") -> list[dict]:
    svc = _service()
    if not svc:
        return []
    try:
        resp = svc.users().messages().list(userId="me", q=query,
                                           maxResults=max_results).execute()
        out = []
        for ref in resp.get("messages", []) or []:
            msg = svc.users().messages().get(userId="me", id=ref["id"],
                                             format="metadata").execute()
            h = _headers(msg)
            out.append({
                "id": ref["id"],
                "account": "gmail",
                "subject": h.get("subject", "(no subject)"),
                "sender": h.get("from", ""),
                "date": h.get("date", ""),
                "snippet": msg.get("snippet", ""),
                "unread": "UNREAD" in (msg.get("labelIds") or []),
            })
        return out
    except Exception as exc:
        logger.warning("gmail list failed: %s", exc)
        return []


def unread_count() -> int | None:
    svc = _service()
    if not svc:
        return None
    try:
        resp = svc.users().labels().get(userId="me", id="INBOX").execute()
        return resp.get("messagesUnread", 0)
    except Exception:
        return None


def send_message(to: str, subject: str, body: str) -> dict:
    """Raw send — ONLY callable from the approvals executor after the user
    approves. Nothing routes here directly from the model."""
    svc = _service()
    if not svc:
        return {"error": "Gmail not connected"}
    mime = MIMEText(body)
    mime["to"] = to
    mime["subject"] = subject
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
    sent = svc.users().messages().send(userId="me", body={"raw": raw}).execute()
    return {"sent": sent.get("id")}


def _marketing_label_id(svc) -> str:
    labels = svc.users().labels().list(userId="me").execute().get("labels", [])
    for lb in labels:
        if lb["name"] == MARKETING_LABEL:
            return lb["id"]
    created = svc.users().labels().create(userId="me", body={
        "name": MARKETING_LABEL, "labelListVisibility": "labelShow",
        "messageListVisibility": "show"}).execute()
    return created["id"]


def move_to_marketing(message_id: str) -> dict:
    """Move out of inbox into Jarvis/Marketing (never a hard delete)."""
    svc = _service()
    if not svc:
        return {"error": "Gmail not connected"}
    label_id = _marketing_label_id(svc)
    svc.users().messages().modify(userId="me", id=message_id, body={
        "addLabelIds": [label_id], "removeLabelIds": ["INBOX"]}).execute()
    return {"moved": message_id}


def restore_from_marketing(message_id: str) -> dict:
    svc = _service()
    if not svc:
        return {"error": "Gmail not connected"}
    label_id = _marketing_label_id(svc)
    svc.users().messages().modify(userId="me", id=message_id, body={
        "addLabelIds": ["INBOX"], "removeLabelIds": [label_id]}).execute()
    return {"restored": message_id}


def trash_message(message_id: str) -> dict:
    """Move to Trash (recoverable ~30 days). Never a permanent purge."""
    svc = _service()
    if not svc:
        return {"error": "Gmail not connected"}
    svc.users().messages().trash(userId="me", id=message_id).execute()
    return {"trashed": message_id}


def list_marketing(max_results: int = 100) -> list[dict]:
    return list_inbox(max_results, query=f"label:{MARKETING_LABEL.replace('/', '-')}") or \
           list_inbox(max_results, query=f'label:"{MARKETING_LABEL}"')
