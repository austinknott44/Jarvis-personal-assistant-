"""Permission tier: read (Tier 1). News/hobbies from the user's curated
RSS_FEEDS, summarized with Gemini Flash. Degrades to headline lists when the
LLM isn't available, and to a friendly note when no feeds are configured."""
import logging

from config import get_settings
from tools.registry import tool

logger = logging.getLogger("jarvis.news")


def is_configured() -> bool:
    return bool(get_settings().rss_feed_list)


def fetch_headlines(max_per_feed: int = 5) -> list[dict]:
    import feedparser
    items = []
    for url in get_settings().rss_feed_list:
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


@tool("get_news", "Get the user's news/hobby headlines from their RSS feeds, "
      "with a short summary.", tier="read")
def get_news() -> dict:
    if not is_configured():
        return {"note": "No RSS feeds configured — add some in Preferences "
                        "(RSS_FEEDS in .env) to get news."}
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
