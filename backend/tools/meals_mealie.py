"""Permission tier: read + own-write (Tier 1). Meals: Mealie API when
configured, otherwise a simple built-in meal-plan table. Degrades gracefully."""
import logging

import httpx

from config import get_settings
from db.models import MealPlanEntry
from db.session import db_session
from safety.gate import Verdict, check
from tools.registry import tool

logger = logging.getLogger("jarvis.meals")


def is_configured() -> bool:
    s = get_settings()
    return bool(s.mealie_base_url and s.mealie_api_token)


def _mealie_get(path: str, params: dict | None = None) -> dict | None:
    s = get_settings()
    try:
        resp = httpx.get(f"{s.mealie_base_url.rstrip('/')}{path}",
                         headers={"Authorization": f"Bearer {s.mealie_api_token}"},
                         params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("mealie GET %s failed: %s", path, exc)
        return None


@tool("get_meal_plan", "Get this week's meal plan (Mealie if configured, else "
      "the built-in plan).", tier="read")
def get_meal_plan() -> dict:
    if is_configured():
        data = _mealie_get("/api/households/mealplans", params={"perPage": 21})
        if data:
            return {"source": "mealie", "plan": [
                {"date": e.get("date"), "type": e.get("entryType"),
                 "recipe": ((e.get("recipe") or {}).get("name") or e.get("title", ""))}
                for e in data.get("items", [])
            ]}
    with db_session() as db:
        rows = db.query(MealPlanEntry).order_by(MealPlanEntry.id).all()
        if not rows:
            return {"note": "No meal plan yet — say e.g. 'plan chicken stir fry "
                            "for Tuesday dinner' to start one."}
        return {"source": "builtin", "plan": [
            {"day": r.day, "meal": r.meal, "recipe": r.recipe,
             "ingredients": r.ingredients} for r in rows
        ]}


@tool("set_meal", "Add or update a meal in the built-in weekly plan. meal is "
      "breakfast, lunch, dinner, or snack. ingredients is a comma-separated "
      "list.", tier="own-write")
def set_meal(day: str, recipe: str, meal: str = "dinner", ingredients: str = "") -> dict:
    if check("edit_meal_plan") != Verdict.ALLOW:
        return {"error": "not allowed"}
    day = day.capitalize()
    items = [i.strip() for i in ingredients.split(",") if i.strip()]
    with db_session() as db:
        row = (db.query(MealPlanEntry)
               .filter(MealPlanEntry.day == day, MealPlanEntry.meal == meal.lower())
               .first())
        if row:
            row.recipe = recipe
            row.ingredients = items
        else:
            db.add(MealPlanEntry(day=day, meal=meal.lower(), recipe=recipe,
                                 ingredients=items))
    return {"saved": f"{day} {meal}: {recipe}"}


@tool("grocery_list", "Build a grocery list from this week's meal plan.", tier="read")
def grocery_list() -> dict:
    if is_configured():
        data = _mealie_get("/api/households/shopping/lists")
        if data and data.get("items"):
            return {"source": "mealie",
                    "lists": [l.get("name") for l in data["items"]],
                    "note": "Open Mealie for full list contents."}
    with db_session() as db:
        rows = db.query(MealPlanEntry).all()
    items: list[str] = []
    for r in rows:
        items.extend(r.ingredients or [])
    seen, unique = set(), []
    for i in items:
        if i.lower() not in seen:
            seen.add(i.lower())
            unique.append(i)
    return {"source": "builtin", "groceries": unique or
            ["(no ingredients recorded — add meals with ingredient lists)"]}
