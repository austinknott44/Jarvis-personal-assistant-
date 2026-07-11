"""Permission tier: read + draft (Tier 1); SEND is gated (Tier 2). Outlook
(.edu) mail via Microsoft Graph, sharing the device-code token with the
calendar module. Purdue's tenant may block third-party apps — everything here
degrades to read-only or disabled rather than crashing."""
import logging

import httpx

from tools.calendar_outlook import GRAPH, _token, is_connected  # noqa: F401

logger = logging.getLogger("jarvis.email.outlook")


def _req(method: str, path: str, **kwargs) -> dict | None:
    token = _token()
    if not token:
        return None
    try:
        resp = httpx.request(method, f"{GRAPH}{path}",
                             headers={"Authorization": f"Bearer {token}"},
                             timeout=20, **kwargs)
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except Exception as exc:
        logger.warning("graph %s %s failed: %s", method, path, exc)
        return None


def list_inbox(max_results: int = 25) -> list[dict]:
    data = _req("GET", "/me/mailFolders/inbox/messages",
                params={"$top": str(max_results),
                        "$select": "id,subject,from,receivedDateTime,bodyPreview,isRead",
                        "$orderby": "receivedDateTime desc"})
    if not data:
        return []
    return [{
        "id": m.get("id"),
        "account": "outlook",
        "subject": m.get("subject", "(no subject)"),
        "sender": (((m.get("from") or {}).get("emailAddress") or {}).get("address", "")),
        "date": m.get("receivedDateTime", ""),
        "snippet": m.get("bodyPreview", ""),
        "unread": not m.get("isRead", True),
    } for m in data.get("value", [])]


def unread_count() -> int | None:
    data = _req("GET", "/me/mailFolders/inbox", params={"$select": "unreadItemCount"})
    return data.get("unreadItemCount") if data else None


def send_message(to: str, subject: str, body: str) -> dict:
    """Raw send — ONLY callable from the approvals executor after approval."""
    result = _req("POST", "/me/sendMail", json={
        "message": {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "toRecipients": [{"emailAddress": {"address": to}}],
        }
    })
    if result is None:
        return {"error": "Outlook not connected or tenant blocks sending"}
    return {"sent": True}
