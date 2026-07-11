"""Permission tier: read + own-write (Tier 1); invitee events gated (Tier 2).
Outlook calendar via Microsoft Graph device-code flow. Many universities
block student-registered apps — if consent fails this module reports
'blocked' and Jarvis degrades to read-only/disabled without crashing."""
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

from config import TOKEN_DIR, get_settings

logger = logging.getLogger("jarvis.calendar.outlook")

GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = ["Calendars.ReadWrite", "Mail.Read", "Mail.ReadWrite", "Mail.Send", "offline_access"]
TOKEN_FILE = TOKEN_DIR / "ms_token.json"

_pending_flow: dict = {}


def is_configured() -> bool:
    return bool(get_settings().ms_client_id)


def is_connected() -> bool:
    return TOKEN_FILE.exists()


def _app():
    import msal
    s = get_settings()
    cache = msal.SerializableTokenCache()
    if TOKEN_FILE.exists():
        cache.deserialize(TOKEN_FILE.read_text())
    app = msal.PublicClientApplication(
        s.ms_client_id, authority=f"https://login.microsoftonline.com/{s.ms_tenant}",
        token_cache=cache)
    return app, cache


def _save(cache) -> None:
    if cache.has_state_changed:
        TOKEN_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(cache.serialize())


def start_device_flow() -> dict:
    """Begin device-code sign-in; returns the code + URL to show the user in
    the Preferences tab."""
    if not is_configured():
        return {"error": "MS_CLIENT_ID not set in .env"}
    app, cache = _app()
    flow = app.initiate_device_flow(scopes=SCOPES)
    if "user_code" not in flow:
        return {"error": f"device flow failed — tenant may block third-party apps: {flow.get('error_description', '')}"}
    _pending_flow.update(flow)
    return {"user_code": flow["user_code"], "verification_uri": flow["verification_uri"],
            "message": flow["message"]}


def complete_device_flow() -> dict:
    """Poll for the user having finished sign-in (blocking call from a
    background-friendly endpoint)."""
    if not _pending_flow:
        return {"error": "no sign-in in progress"}
    app, cache = _app()
    result = app.acquire_token_by_device_flow(_pending_flow)
    _pending_flow.clear()
    if "access_token" in result:
        _save(cache)
        return {"status": "connected"}
    return {"error": result.get("error_description", "sign-in failed — your school may block this")}


def _token() -> str | None:
    if not is_configured() or not is_connected():
        return None
    app, cache = _app()
    accounts = app.get_accounts()
    if not accounts:
        return None
    result = app.acquire_token_silent(SCOPES, account=accounts[0])
    _save(cache)
    return result.get("access_token") if result else None


def _get(path: str, params: dict | None = None) -> dict | None:
    token = _token()
    if not token:
        return None
    try:
        resp = httpx.get(f"{GRAPH}{path}", params=params,
                         headers={"Authorization": f"Bearer {token}"}, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("graph GET %s failed: %s", path, exc)
        return None


def list_events(days_back: int = 1, days_forward: int = 30) -> list[dict]:
    now = datetime.now(timezone.utc)
    data = _get("/me/calendarView", params={
        "startDateTime": (now - timedelta(days=days_back)).isoformat(),
        "endDateTime": (now + timedelta(days=days_forward)).isoformat(),
        "$top": "250", "$orderby": "start/dateTime",
    })
    if not data:
        return []
    events = []
    for ev in data.get("value", []):
        events.append({
            "id": ev.get("id"),
            "title": ev.get("subject", "(no title)"),
            "start_at": (ev.get("start") or {}).get("dateTime", ""),
            "end_at": (ev.get("end") or {}).get("dateTime", ""),
            "location": ((ev.get("location") or {}).get("displayName", "")),
            "organizer": (((ev.get("organizer") or {}).get("emailAddress") or {}).get("address", "")),
            "calendar": "outlook",
            "source": "outlook",
            "has_invitees": len(ev.get("attendees", []) or []) > 1,
        })
    return events
