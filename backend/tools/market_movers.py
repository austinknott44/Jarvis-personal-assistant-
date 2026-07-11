"""Permission tier: read (Tier 1). Daily stock ideas + market movers.
STRICTLY INFORMATIONAL/EDUCATIONAL — there is no trade capability anywhere
in Jarvis (Tier 3, forbidden by design) and this is not financial advice.

Data: Alpha Vantage free tier (TOP_GAINERS_LOSERS = 1 call, TIME_SERIES_DAILY
per pick for the 7-day change). Everything is cached for the whole day so the
picks cost ~4 API calls/day, well inside the 25/day free cap. The one-line
"why" and company names come from Gemini reasoning over the fetched numbers."""
import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from config import get_settings
from db.models import CacheEntry, utcnow
from db.session import db_session
from tools.registry import tool

logger = logging.getLogger("jarvis.market")

DISCLAIMER = "Educational ideas only — not financial advice. Jarvis cannot trade."
AV = "https://www.alphavantage.co/query"


def is_configured() -> bool:
    return bool(get_settings().alphavantage_api_key)


def _today() -> str:
    return datetime.now(ZoneInfo(get_settings().timezone)).strftime("%Y-%m-%d")


def _cache_get(domain: str) -> dict | None:
    with db_session() as db:
        entry = db.query(CacheEntry).filter(CacheEntry.domain == domain).first()
        if entry and entry.payload.get("date") == _today():
            return entry.payload
    return None


def _cache_put(domain: str, payload: dict) -> None:
    payload["date"] = _today()
    with db_session() as db:
        entry = db.query(CacheEntry).filter(CacheEntry.domain == domain).first()
        if entry:
            entry.payload = payload
            entry.fetched_at = utcnow()
        else:
            db.add(CacheEntry(domain=domain, payload=payload))


def _av(params: dict) -> dict | None:
    s = get_settings()
    try:
        resp = httpx.get(AV, params={**params, "apikey": s.alphavantage_api_key}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        if "Information" in data or "Note" in data:  # rate-limit responses
            logger.warning("alpha vantage limit: %s", data.get("Information") or data.get("Note"))
            return None
        return data
    except Exception as exc:
        logger.warning("alpha vantage call failed: %s", exc)
        return None


def fetch_movers() -> dict:
    """Top gainers / losers / most active (cached all day)."""
    cached = _cache_get("market_movers")
    if cached:
        return cached
    if not is_configured():
        return {"error": "Set ALPHAVANTAGE_API_KEY in .env for market data (free at alphavantage.co)."}
    data = _av({"function": "TOP_GAINERS_LOSERS"})
    if not data:
        return {"error": "Alpha Vantage unavailable or rate-limited — try again later."}

    def slim(rows):
        return [{
            "ticker": r.get("ticker", ""),
            "price": float(r.get("price", 0) or 0),
            "change_pct": (r.get("change_percentage", "0%") or "0%").rstrip("%"),
            "volume": r.get("volume", ""),
        } for r in rows[:10]]

    payload = {
        "gainers": slim(data.get("top_gainers", [])),
        "losers": slim(data.get("top_losers", [])),
        "most_active": slim(data.get("most_actively_traded", [])),
        "disclaimer": DISCLAIMER,
    }
    _cache_put("market_movers", payload)
    return payload


def _seven_day_change(ticker: str) -> float | None:
    data = _av({"function": "TIME_SERIES_DAILY", "symbol": ticker, "outputsize": "compact"})
    if not data:
        return None
    series = data.get("Time Series (Daily)", {})
    dates = sorted(series.keys(), reverse=True)
    if len(dates) < 6:
        return None
    latest = float(series[dates[0]]["4. close"])
    week_ago = float(series[dates[min(5, len(dates) - 1)]]["4. close"])  # ~7 calendar days = 5 trading days
    if not week_ago:
        return None
    return round((latest / week_ago - 1) * 100, 2)


def fetch_daily_picks() -> dict:
    """Three stock ideas for today: ticker, name, price, 7-day change, and a
    one-line LLM-written 'why'. Computed once per day and cached."""
    cached = _cache_get("stock_picks")
    if cached:
        return cached
    if not is_configured():
        return {"picks": [], "note": "Set ALPHAVANTAGE_API_KEY in .env to get daily stock ideas.",
                "disclaimer": DISCLAIMER}

    movers = fetch_movers()
    if movers.get("error"):
        return {"picks": [], "note": movers["error"], "disclaimer": DISCLAIMER}

    # Candidates: liquid, sane-priced names from most-active, topped up with gainers
    candidates = [m for m in movers.get("most_active", []) if m["price"] >= 5][:5]
    for g in movers.get("gainers", []):
        if len(candidates) >= 5:
            break
        if g["price"] >= 5 and g["ticker"] not in {c["ticker"] for c in candidates}:
            candidates.append(g)
    chosen = candidates[:3]

    for c in chosen:
        c["week_change_pct"] = _seven_day_change(c["ticker"])

    # One cheap LLM call for names + one-line reasons
    names_reasons: dict = {}
    try:
        from agent.brain import quick_summarize
        raw = quick_summarize(
            "For each stock ticker below, give the company name and ONE concise "
            "sentence (max 18 words) on why it's notable to watch today, based on "
            "the data given. Educational tone, no buy/sell commands.\n"
            + "\n".join(
                f"- {c['ticker']}: price ${c['price']}, today {c['change_pct']}%, "
                f"7-day {c.get('week_change_pct', 'n/a')}%, volume {c['volume']}"
                for c in chosen)
            + '\nReply ONLY with JSON: {"TICKER": {"name": "...", "why": "..."}, ...}'
        ).strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw
            raw = raw.rsplit("```", 1)[0] if "```" in raw else raw
        names_reasons = json.loads(raw)
    except Exception as exc:
        logger.warning("picks LLM annotation failed: %s", exc)

    picks = []
    for c in chosen:
        meta = names_reasons.get(c["ticker"], {}) if isinstance(names_reasons, dict) else {}
        picks.append({
            "ticker": c["ticker"],
            "name": meta.get("name", c["ticker"]),
            "price": c["price"],
            "change_pct": c["change_pct"],
            "week_change_pct": c.get("week_change_pct"),
            "why": meta.get("why", "High trading activity today — worth a look."),
        })

    payload = {"picks": picks, "disclaimer": DISCLAIMER}
    if picks:
        _cache_put("stock_picks", payload)
    return payload


@tool("daily_stock_picks", "Get today's three notable stocks to watch (ticker, "
      "name, price, 7-day change, one-line reason). Educational only — Jarvis "
      "can never trade.", tier="read")
def daily_stock_picks() -> dict:
    return fetch_daily_picks()


@tool("market_movers", "Get today's top market gainers, losers, and most "
      "actively traded stocks.", tier="read")
def market_movers() -> dict:
    return fetch_movers()
