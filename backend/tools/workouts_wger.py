"""Permission tier: read + own-write (Tier 1). Workouts: the workout_split
table is the source of truth (editable from the Workout Split tab AND by
voice — both write here). wger API is an optional read enhancement."""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from config import get_settings
from db.models import WorkoutSplitDay
from db.session import db_session
from safety.gate import Verdict, check
from tools.registry import tool

logger = logging.getLogger("jarvis.workouts")

DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def is_configured() -> bool:
    s = get_settings()
    return bool(s.wger_base_url and s.wger_api_token)


def get_split() -> list[dict]:
    with db_session() as db:
        rows = {r.day: r for r in db.query(WorkoutSplitDay).all()}
    return [{
        "day": d,
        "focus": rows[d].focus if d in rows else "Rest",
        "exercises": rows[d].exercises if d in rows else [],
    } for d in DAYS]


@tool("get_workout_split", "Get the user's full weekly workout split.", tier="read")
def get_workout_split() -> dict:
    return {"split": get_split()}


@tool("todays_workout", "What's the user's workout today?", tier="read")
def todays_workout() -> dict:
    today = datetime.now(ZoneInfo(get_settings().timezone)).strftime("%A")
    for d in get_split():
        if d["day"] == today:
            return {"today": today, "focus": d["focus"], "exercises": d["exercises"]}
    return {"today": today, "focus": "Rest", "exercises": []}


@tool("set_workout_day", "Set or change a day of the workout split (e.g. "
      "'change leg day to Thursday' = set Thursday focus to Legs). exercises "
      "is a comma-separated list like 'Squat 4x6, RDL 3x10'.", tier="own-write")
def set_workout_day(day: str, focus: str, exercises: str = "") -> dict:
    if check("edit_workout_split") != Verdict.ALLOW:
        return {"error": "not allowed"}
    day = day.capitalize()
    if day not in DAYS:
        return {"error": f"day must be one of {DAYS}"}
    ex_list = []
    for chunk in exercises.split(","):
        chunk = chunk.strip()
        if chunk:
            parts = chunk.rsplit(" ", 1)
            if len(parts) == 2 and "x" in parts[1]:
                sets_reps = parts[1].split("x")
                ex_list.append({"name": parts[0], "sets": sets_reps[0], "reps": sets_reps[1]})
            else:
                ex_list.append({"name": chunk, "sets": "", "reps": ""})
    with db_session() as db:
        row = db.query(WorkoutSplitDay).filter(WorkoutSplitDay.day == day).first()
        if row:
            row.focus = focus
            if ex_list:
                row.exercises = ex_list
        else:
            db.add(WorkoutSplitDay(day=day, focus=focus, exercises=ex_list))
    return {"saved": f"{day}: {focus}"}


@tool("add_exercise", "Add one exercise to a day of the split (e.g. 'add "
      "Romanian deadlifts to pull day' -> day of the split whose focus is "
      "Pull).", tier="own-write")
def add_exercise(day: str, exercise: str, sets: str = "3", reps: str = "10") -> dict:
    if check("edit_workout_split") != Verdict.ALLOW:
        return {"error": "not allowed"}
    day = day.capitalize()
    if day not in DAYS:
        return {"error": f"day must be one of {DAYS}"}
    with db_session() as db:
        row = db.query(WorkoutSplitDay).filter(WorkoutSplitDay.day == day).first()
        if not row:
            row = WorkoutSplitDay(day=day, focus="Workout", exercises=[])
            db.add(row)
        row.exercises = (row.exercises or []) + [{"name": exercise, "sets": sets, "reps": reps}]
    return {"added": f"{exercise} to {day}"}
