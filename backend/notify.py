"""ntfy push notifications — free, no account. Used for approval requests and
the single 7am morning brief. Degrades to a no-op if NTFY_TOPIC is blank."""
import logging

import httpx

from config import get_settings

logger = logging.getLogger("jarvis.notify")


def send_push(title: str, message: str, tags: list[str] | None = None) -> bool:
    s = get_settings()
    if not s.ntfy_topic:
        logger.info("ntfy not configured; skipping push: %s", title)
        return False
    try:
        headers = {"Title": title}
        if tags:
            headers["Tags"] = ",".join(tags)
        resp = httpx.post(
            f"{s.ntfy_server.rstrip('/')}/{s.ntfy_topic}",
            content=message.encode(),
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:  # never let a push failure break the caller
        logger.warning("ntfy push failed: %s", exc)
        return False
