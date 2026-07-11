"""Permission tier: read + own-write (Tier 1); events with invitees are gated
(Tier 2). Google Calendar via OAuth — the user clicks "Connect" in Preferences,
does Google's own consent flow, and the token is stored locally in
backend/.tokens/. Degrades gracefully when not configured."""
import json
import logging
from datetime import datetime, timedelta, timezone

from config import TOKEN_DIR, get_settings

logger = logging.getLogger("jarvis.calendar.google")

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
]
TOKEN_FILE = TOKEN_DIR / "google_token.json"


def is_configured() -> bool:
    s = get_settings()
    return bool(s.gmail_client_id and s.gmail_client_secret)


def is_connected() -> bool:
    return TOKEN_FILE.exists()


def _credentials():
    """Load stored credentials, refreshing if expired. Returns None if the
    user hasn't connected yet."""
    if not is_configured() or not is_connected():
        return None
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = Credentials.from_authorized_user_info(
        json.loads(TOKEN_FILE.read_text()), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json())
    return creds


def start_oauth_flow() -> str:
    """Run the local-server OAuth flow (opens a browser). Called from the
    Preferences tab. Stores the token on success."""
    if not is_configured():
        raise RuntimeError("GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET not set in .env")
    from google_auth_oauthlib.flow import InstalledAppFlow

    s = get_settings()
    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": s.gmail_client_id,
                "client_secret": s.gmail_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        SCOPES,
    )
    creds = flow.run_local_server(port=0)
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(creds.to_json())
    return "connected"


def _service():
    creds = _credentials()
    if not creds:
        return None
    from googleapiclient.discovery import build
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def list_events(days_back: int = 1, days_forward: int = 30) -> list[dict]:
    """Fetch events across all of the user's Google calendars."""
    svc = _service()
    if not svc:
        return []
    now = datetime.now(timezone.utc)
    time_min = (now - timedelta(days=days_back)).isoformat()
    time_max = (now + timedelta(days=days_forward)).isoformat()
    events: list[dict] = []
    try:
        cal_list = svc.calendarList().list().execute().get("items", [])
        for cal in cal_list:
            resp = svc.events().list(
                calendarId=cal["id"], timeMin=time_min, timeMax=time_max,
                singleEvents=True, orderBy="startTime", maxResults=250,
            ).execute()
            for ev in resp.get("items", []):
                start = ev.get("start", {})
                end = ev.get("end", {})
                events.append({
                    "id": ev.get("id"),
                    "title": ev.get("summary", "(no title)"),
                    "start_at": start.get("dateTime") or start.get("date"),
                    "end_at": end.get("dateTime") or end.get("date"),
                    "location": ev.get("location", ""),
                    "organizer": (ev.get("organizer") or {}).get("email", ""),
                    "calendar": cal.get("summary", ""),
                    "source": "google",
                    "has_invitees": len(ev.get("attendees", []) or []) > 1,
                })
    except Exception as exc:
        logger.warning("google calendar fetch failed: %s", exc)
    return events


def create_event(title: str, start_iso: str, end_iso: str, location: str = "",
                 attendees: list[str] | None = None) -> dict:
    """Create an event on the primary calendar. The caller (calendar_unified)
    is responsible for gating invitee events through the safety gate."""
    svc = _service()
    if not svc:
        return {"error": "Google Calendar not connected"}
    body: dict = {
        "summary": title,
        "start": {"dateTime": start_iso},
        "end": {"dateTime": end_iso},
    }
    if location:
        body["location"] = location
    if attendees:
        body["attendees"] = [{"email": a} for a in attendees]
    ev = svc.events().insert(calendarId="primary", body=body,
                             sendUpdates="all" if attendees else "none").execute()
    return {"id": ev.get("id"), "link": ev.get("htmlLink", "")}
