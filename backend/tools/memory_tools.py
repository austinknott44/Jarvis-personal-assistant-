"""Permission tier: own-write (Tier 1). Stores durable facts about the user."""
from agent.memory import get_facts, store_fact
from safety.gate import Verdict, check
from tools.registry import tool


@tool("remember_fact", "Store a durable fact about the user (e.g. name, school, "
      "major, goals, preferences). Use a short snake_case key.", tier="own-write")
def remember_fact(key: str, value: str, category: str = "general") -> dict:
    if check("edit_fact") != Verdict.ALLOW:
        return {"error": "not allowed"}
    store_fact(key, value, category)
    return {"stored": key}


@tool("list_facts", "List everything currently remembered about the user.", tier="read")
def list_facts() -> dict:
    return {"facts": get_facts()}
