"""Gemini Flash brain — prompt assembly + the tool-calling loop.
Free tier only: retries with backoff on 429; billing must stay disabled on
the Google Cloud project that owns GEMINI_API_KEY."""
import json
import logging
import time

from config import get_settings
from agent.memory import build_memory_context, get_recent_history
from tools.registry import dispatch, gemini_declarations

logger = logging.getLogger("jarvis.brain")

SYSTEM_PROMPT = """You are {name}, a personal AI assistant for Austin, a Purdue student.
Speak naturally and concisely, with a hint of dry JARVIS-style wit. You manage his
calendar, school deadlines, email, investments (read-only), meals, workouts, and news.

SAFETY RULES (enforced in code too — never try to work around them):
1. You can read anything and freely edit Austin's OWN calendar events, tasks,
   deadlines, holdings, workout split, and meal plan.
2. Sending email, inviting other people to events, or any action that leaves
   Austin's accounts requires his explicit approval — the tools queue these
   automatically; tell him an approval is waiting.
3. You can NEVER spend money, move money, trade, place orders, or book/pay for
   anything. That capability does not exist. If asked, explain it is out of scope
   by design.
4. Investment output is informational only — include a brief "not financial
   advice" note when giving portfolio analysis.
5. School email (purdue.edu, professors, Brightspace) is never auto-cleaned.

MARKET STRATEGIST MODE: You are also a sharp, opinionated market and options
strategist. When Austin asks about markets, stocks, or options, give concrete,
current, data-driven takes: use the daily_stock_picks, market_movers,
get_portfolio, and options_strategy_ideas tools; name specific tickers, strike
zones, expirations, and defined-risk structures (covered calls, cash-secured
puts, verticals, calendars); explain the thesis, what invalidates it, max
loss, and position sizing (never risk more than a small % of the account).
Be honest: no one can guarantee profits, options can expire worthless, and
most short-dated speculation loses money — steer toward defined-risk,
longer-dated, education-first ideas. You analyze and advise; you can NEVER
place trades — Austin executes his own decisions in his broker.

When the user tells you a durable personal fact (name, school, major, goals,
preferences, schedule patterns), call remember_fact to store it.

{memory}

Current date/time: {now}
"""

RETRIES = 3
MAX_TOOL_ROUNDS = 6


def _client():
    from google import genai
    s = get_settings()
    if not s.gemini_api_key:
        return None
    return genai.Client(api_key=s.gemini_api_key)


def _build_system_prompt() -> str:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    s = get_settings()
    now = datetime.now(ZoneInfo(s.timezone)).strftime("%A, %B %d %Y, %I:%M %p %Z")
    return SYSTEM_PROMPT.format(name=s.jarvis_name, memory=build_memory_context(), now=now)


def chat(user_message: str) -> str:
    """One full turn: memory + history + tool-calling loop -> reply text."""
    client = _client()
    if client is None:
        return ("I'm not fully awake yet — no GEMINI_API_KEY is configured. "
                "Add your free key from aistudio.google.com to .env and restart.")

    from google.genai import types

    s = get_settings()
    tools = [types.Tool(function_declarations=gemini_declarations())]
    config = types.GenerateContentConfig(
        system_instruction=_build_system_prompt(),
        tools=tools,
    )

    contents = []
    for turn in get_recent_history():
        role = "user" if turn["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=turn["content"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=user_message)]))

    for _round in range(MAX_TOOL_ROUNDS):
        response = _generate_with_backoff(client, s.gemini_text_model, contents, config)
        if response is None:
            return "I'm being rate-limited on the free tier right now — give me a minute and try again."

        calls = getattr(response, "function_calls", None) or []
        if not calls:
            return response.text or "(no response)"

        # Execute requested tool calls, feed results back, loop
        contents.append(response.candidates[0].content)
        result_parts = []
        for call in calls:
            args = dict(call.args or {})
            logger.info("tool call: %s(%s)", call.name, json.dumps(args, default=str)[:300])
            result = dispatch(call.name, args)
            result_parts.append(types.Part.from_function_response(
                name=call.name, response={"result": result}))
        contents.append(types.Content(role="tool", parts=result_parts))

    return "I got stuck in a long chain of tool calls — try rephrasing that."


def _generate_with_backoff(client, model, contents, config):
    delay = 2
    for attempt in range(RETRIES):
        try:
            resp = client.models.generate_content(model=model, contents=contents, config=config)
            _record_llm(ok=True)
            return resp
        except Exception as exc:
            msg = str(exc)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg.upper():
                _record_llm(ok=False, error="rate-limited (free tier 429)")
                logger.warning("Gemini rate limit (attempt %d) — backing off %ds", attempt + 1, delay)
                time.sleep(delay)
                delay *= 2
                continue
            _record_llm(ok=False, error=msg[:200])
            logger.exception("Gemini call failed")
            return None
    return None


def _record_llm(ok: bool, error: str = "") -> None:
    """Track LLM usage + recent errors for the HUD status tile (cache table,
    domain 'llm_stats'). Never lets bookkeeping break a call."""
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        from db.models import CacheEntry, utcnow
        from db.session import db_session

        today = datetime.now(ZoneInfo(get_settings().timezone)).strftime("%Y-%m-%d")
        with db_session() as db:
            entry = db.query(CacheEntry).filter(CacheEntry.domain == "llm_stats").first()
            stats = dict(entry.payload) if entry and entry.payload.get("date") == today else {
                "date": today, "calls": 0, "errors": 0, "recent_errors": []}
            stats["calls"] += 1
            if not ok:
                stats["errors"] += 1
                stats["recent_errors"] = ([{"at": utcnow().isoformat()[11:19], "error": error}]
                                          + stats.get("recent_errors", []))[:5]
            stats["last_call_at"] = utcnow().isoformat()
            if entry:
                entry.payload = stats
                entry.fetched_at = utcnow()
            else:
                db.add(CacheEntry(domain="llm_stats", payload=stats))
    except Exception:
        logger.debug("llm stats bookkeeping failed", exc_info=True)


def get_llm_stats() -> dict:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from db.models import CacheEntry
    from db.session import db_session

    today = datetime.now(ZoneInfo(get_settings().timezone)).strftime("%Y-%m-%d")
    with db_session() as db:
        entry = db.query(CacheEntry).filter(CacheEntry.domain == "llm_stats").first()
        if entry and entry.payload.get("date") == today:
            return entry.payload
    return {"date": today, "calls": 0, "errors": 0, "recent_errors": []}


def quick_summarize(prompt: str) -> str:
    """Single non-tool call for briefs/classification — token-efficient."""
    client = _client()
    if client is None:
        return ""
    resp = _generate_with_backoff(client, get_settings().gemini_text_model, prompt, None)
    return (resp.text or "") if resp else ""
