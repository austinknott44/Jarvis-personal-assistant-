"""Permission tier: READ-ONLY (Tier 1). iCloud Mail over IMAP with an
app-specific password. v1 is strictly read-only — no send, no delete, no
moves. The password is Fernet-encrypted at rest when saved from the
Preferences tab (see crypto.py); the .env value is a bootstrap fallback."""
import email
import imaplib
import logging
from email.header import decode_header

from config import get_settings
from db.models import EmailAccount
from db.session import db_session

logger = logging.getLogger("jarvis.email.icloud")

IMAP_HOST = "imap.mail.me.com"
IMAP_PORT = 993


def _credentials() -> tuple[str, str] | None:
    """Prefer the encrypted DB secret (set via Preferences); fall back to .env."""
    with db_session() as db:
        acct = db.query(EmailAccount).filter(EmailAccount.provider == "icloud").first()
    if acct and acct.enc_secret:
        try:
            from crypto import decrypt
            return acct.address, decrypt(acct.enc_secret)
        except Exception as exc:
            logger.warning("could not decrypt iCloud password: %s", exc)
    s = get_settings()
    if s.icloud_email and s.icloud_app_password:
        return s.icloud_email, s.icloud_app_password
    return None


def is_configured() -> bool:
    return _credentials() is not None


def _decode(value: str) -> str:
    parts = decode_header(value or "")
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def list_inbox(max_results: int = 25) -> list[dict]:
    creds = _credentials()
    if not creds:
        return []
    address, password = creds
    try:
        with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as imap:
            imap.login(address, password)
            imap.select("INBOX", readonly=True)  # readonly — enforced at the protocol level
            _typ, data = imap.search(None, "ALL")
            ids = data[0].split()[-max_results:]
            out = []
            for mid in reversed(ids):
                _typ, msg_data = imap.fetch(mid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] FLAGS)")
                raw = b"".join(part[1] for part in msg_data if isinstance(part, tuple))
                msg = email.message_from_bytes(raw)
                flags = " ".join(p.decode() if isinstance(p, bytes) else str(p)
                                 for p in msg_data if not isinstance(p, tuple))
                out.append({
                    "id": mid.decode(),
                    "account": "icloud",
                    "subject": _decode(msg.get("Subject", "(no subject)")),
                    "sender": _decode(msg.get("From", "")),
                    "date": msg.get("Date", ""),
                    "snippet": "",
                    "unread": "\\Seen" not in flags,
                })
            return out
    except Exception as exc:
        logger.warning("icloud imap failed: %s", exc)
        return []


def unread_count() -> int | None:
    creds = _credentials()
    if not creds:
        return None
    address, password = creds
    try:
        with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as imap:
            imap.login(address, password)
            imap.select("INBOX", readonly=True)
            _typ, data = imap.search(None, "UNSEEN")
            return len(data[0].split())
    except Exception:
        return None
