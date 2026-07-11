"""Permission tier: READ + own-write of the manual holdings table (Tier 1).
THERE IS NO TRADE/ORDER/TRANSFER CAPABILITY IN THIS MODULE OR ANYWHERE ELSE —
that is Tier 3, forbidden by design (CLAUDE.md §4).

Robinhood has no official equity API, so the default path is manual holdings
entry + Alpha Vantage free-tier prices. SnapTrade read-only auto-sync is an
optional enhancement when credentials exist. All output is informational
only — not financial advice."""
import logging

import httpx

from config import get_settings
from db.models import CacheEntry, Holding, utcnow
from db.session import db_session
from safety.gate import Verdict, check
from tools.registry import tool

logger = logging.getLogger("jarvis.investments")

DISCLAIMER = "This is informational only — not financial advice."


def is_configured() -> bool:
    return bool(get_settings().alphavantage_api_key)


def _quote(ticker: str) -> dict | None:
    s = get_settings()
    if not s.alphavantage_api_key:
        return None
    try:
        resp = httpx.get("https://www.alphavantage.co/query", params={
            "function": "GLOBAL_QUOTE", "symbol": ticker,
            "apikey": s.alphavantage_api_key}, timeout=15)
        resp.raise_for_status()
        q = resp.json().get("Global Quote", {})
        if not q:
            return None
        return {
            "price": float(q.get("05. price", 0) or 0),
            "change_pct": (q.get("10. change percent", "0%") or "0%").rstrip("%"),
            "prev_close": float(q.get("08. previous close", 0) or 0),
        }
    except Exception as exc:
        logger.warning("alpha vantage quote %s failed: %s", ticker, exc)
        return None


def portfolio_snapshot() -> dict:
    """Holdings + live prices + allocation vs targets. Cached for the HUD tile."""
    with db_session() as db:
        holdings = db.query(Holding).order_by(Holding.ticker).all()
        rows = [{"ticker": h.ticker, "shares": h.shares, "cost_basis": h.cost_basis,
                 "target_pct": h.target_pct} for h in holdings]

    total_value, total_cost = 0.0, 0.0
    for r in rows:
        q = _quote(r["ticker"])
        r["price"] = q["price"] if q else None
        r["change_pct"] = q["change_pct"] if q else None
        r["value"] = round(r["shares"] * q["price"], 2) if q else None
        r["gain_pct"] = (round((q["price"] / r["cost_basis"] - 1) * 100, 2)
                         if q and r["cost_basis"] else None)
        if r["value"]:
            total_value += r["value"]
            total_cost += r["shares"] * r["cost_basis"]

    for r in rows:
        r["actual_pct"] = round(r["value"] / total_value * 100, 1) if r.get("value") and total_value else None
        if r["actual_pct"] is not None and r["target_pct"]:
            r["drift"] = round(r["actual_pct"] - r["target_pct"], 1)

    snapshot = {
        "holdings": rows,
        "total_value": round(total_value, 2) if total_value else None,
        "total_gain_pct": (round((total_value / total_cost - 1) * 100, 2)
                           if total_cost else None),
        "prices_available": is_configured(),
        "disclaimer": DISCLAIMER,
    }
    with db_session() as db:
        entry = db.query(CacheEntry).filter(CacheEntry.domain == "portfolio").first()
        if entry:
            entry.payload = snapshot
            entry.fetched_at = utcnow()
        else:
            db.add(CacheEntry(domain="portfolio", payload=snapshot))
    return snapshot


def quick_moves() -> str:
    """One-liner for the startup catch-up (no API burn if unconfigured)."""
    if not is_configured():
        return ""
    with db_session() as db:
        count = db.query(Holding).count()
    return f"portfolio has {count} tracked position(s) — ask me for today's moves" if count else ""


@tool("get_portfolio", "Get the user's portfolio: holdings, live prices, "
      "gains, and allocation vs target percentages. Read-only.", tier="read")
def get_portfolio() -> dict:
    snap = portfolio_snapshot()
    if not snap["holdings"]:
        return {"note": "No holdings entered yet — add them in the Portfolio tab "
                        "or say 'set my NVDA position to 12 shares at 450'."}
    return snap


@tool("set_holding", "Add or update a manually tracked position (the user's "
      "Robinhood holdings are entered manually — there is no trading here, "
      "ever). shares=0 removes the position. cost_basis is per-share.",
      tier="own-write")
def set_holding(ticker: str, shares: float, cost_basis: float = 0.0,
                target_pct: float = 0.0) -> dict:
    if check("edit_holdings") != Verdict.ALLOW:
        return {"error": "not allowed"}
    ticker = ticker.upper().strip()
    with db_session() as db:
        h = db.query(Holding).filter(Holding.ticker == ticker).first()
        if shares <= 0:
            if h:
                db.delete(h)
                return {"removed": ticker}
            return {"error": f"no position in {ticker}"}
        if h:
            h.shares = shares
            if cost_basis:
                h.cost_basis = cost_basis
            if target_pct:
                h.target_pct = target_pct
        else:
            db.add(Holding(ticker=ticker, shares=shares, cost_basis=cost_basis,
                           target_pct=target_pct))
    return {"saved": ticker, "shares": shares}


@tool("investment_brief", "Generate today's investment brief: moves on the "
      "user's holdings, allocation vs targets, and observations. Read-only, "
      "informational, not financial advice.", tier="read")
def investment_brief() -> dict:
    snap = portfolio_snapshot()
    if not snap["holdings"]:
        return {"note": "No holdings tracked yet."}
    lines = []
    for r in snap["holdings"]:
        if r.get("price"):
            drift = f", {r['drift']:+.1f}% vs target" if r.get("drift") is not None else ""
            lines.append(f"{r['ticker']}: ${r['price']:.2f} ({r['change_pct']}% today, "
                         f"{r.get('gain_pct', 0) or 0:+.1f}% overall{drift})")
        else:
            lines.append(f"{r['ticker']}: {r['shares']} shares (no live price — "
                         "check ALPHAVANTAGE_API_KEY)")
    return {"brief": lines, "total_value": snap["total_value"],
            "disclaimer": DISCLAIMER}


@tool("deep_analysis_prompt", "Generate a rich, ready-to-paste prompt the user "
      "can run in Claude or ChatGPT for deep portfolio analysis. Jarvis never "
      "automates trade advice.", tier="read")
def deep_analysis_prompt() -> dict:
    snap = portfolio_snapshot()
    if not snap["holdings"]:
        return {"note": "No holdings tracked yet."}
    lines = [
        "You are a thoughtful investment analyst. Analyze this personal portfolio "
        "for a college student with a long time horizon. Do not give specific "
        "buy/sell orders; explain reasoning, risks, diversification, and questions "
        "I should consider. This is educational, not financial advice.",
        "",
        "My portfolio:",
    ]
    for r in snap["holdings"]:
        lines.append(
            f"- {r['ticker']}: {r['shares']} shares, cost basis ${r['cost_basis']}/sh"
            + (f", current ${r['price']:.2f}" if r.get("price") else "")
            + (f", target allocation {r['target_pct']}%" if r.get("target_pct") else ""))
    if snap.get("total_value"):
        lines.append(f"\nTotal value: ${snap['total_value']:.2f}")
    lines += [
        "",
        "Please cover: 1) concentration and diversification, 2) how my actual "
        "allocation compares to my targets and what rebalancing considerations "
        "exist, 3) the risk profile of each holding, 4) what macro factors most "
        "affect this mix, 5) three questions I should research next.",
    ]
    return {"paste_this": "\n".join(lines), "disclaimer": DISCLAIMER}
