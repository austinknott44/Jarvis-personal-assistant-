"""Permission tier: read (Tier 1). News/hobbies from the user's curated
RSS_FEEDS, summarized with Gemini Flash. Degrades to headline lists when the
LLM isn't available, and to a friendly note when no feeds are configured."""
import logging

from config import get_settings
from tools.registry import tool

logger = logging.getLogger("jarvis.news")

# Default free, keyless feeds (research 2026: Google News RSS is free with
# unlimited access — no API key). The user's RSS_FEEDS are layered on top.
DEFAULT_FEEDS = [
    "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",                    # top stories
    "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
]


def is_configured() -> bool:
    return True  # defaults always available; user feeds add to them


def _feeds() -> list[str]:
    return get_settings().rss_feed_list + DEFAULT_FEEDS


def fetch_headlines(max_per_feed: int = 5) -> list[dict]:
    import feedparser
    items = []
    for url in _feeds():
        try:
            feed = feedparser.parse(url)
            source = feed.feed.get("title", url)
            for entry in feed.entries[:max_per_feed]:
                items.append({
                    "source": source,
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "published": entry.get("published", ""),
                })
        except Exception as exc:
            logger.warning("rss fetch %s failed: %s", url, exc)
    return items


@tool("get_news", "Get today's top news and key events (Google News + BBC "
      "defaults plus the user's RSS feeds), with a short summary.", tier="read")
def get_news() -> dict:
    headlines = fetch_headlines()
    if not headlines:
        return {"note": "Feeds configured but nothing fetched — check the URLs."}

    summary = ""
    try:
        from agent.brain import quick_summarize
        digest = "\n".join(f"- [{h['source']}] {h['title']}" for h in headlines[:25])
        summary = quick_summarize(
            "Summarize these headlines into a 4-6 sentence personal news brief, "
            "grouping related stories:\n" + digest)
    except Exception:
        pass

    return {"summary": summary or "(summary unavailable — headlines below)",
            "headlines": headlines[:20]}
