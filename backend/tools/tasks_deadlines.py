"""Permission tier: own-write (Tier 1). Tasks/reminders + the unified
`deadlines` table (syllabus + Brightspace iCal + manual all land here, so
"what's due this week?" answers from one source)."""
from datetime import datetime, timedelta, timezone

from db.models import Deadline, Task, utcnow
from db.session import db_session
from safety.gate import Verdict, check
from tools.registry import tool


def _parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(value.strip(), fmt)
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(value.strip())
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except ValueError:
        return None


# ---- Tasks ----

@tool("add_task", "Add a reminder/todo for the user. due_at format: YYYY-MM-DD HH:MM "
      "(24h) or YYYY-MM-DD; empty for no due date.", tier="own-write")
def add_task(title: str, due_at: str = "") -> dict:
    if check("create_task") != Verdict.ALLOW:
        return {"error": "not allowed"}
    with db_session() as db:
        t = Task(title=title, due_at=_parse_dt(due_at), created_by="agent")
        db.add(t)
        db.flush()
        return {"id": t.id, "title": t.title}


@tool("complete_task", "Mark a task done by its id.", tier="own-write")
def complete_task(task_id: int) -> dict:
    if check("complete_task") != Verdict.ALLOW:
        return {"error": "not allowed"}
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            return {"error": f"no task {task_id}"}
        t.done = True
        return {"completed": t.title}


@tool("list_tasks", "List open tasks/reminders.", tier="read")
def list_tasks() -> dict:
    with db_session() as db:
        rows = db.query(Task).filter(Task.done.is_(False)).order_by(Task.due_at).all()
        return {"tasks": [
            {"id": t.id, "title": t.title,
             "due_at": t.due_at.isoformat() if t.due_at else None}
            for t in rows
        ]}


# ---- Deadlines ----

@tool("add_deadline", "Add a school deadline manually (e.g. 'add exam: OrgChem midterm "
      "Oct 14 7pm'). type is assignment, quiz, exam, project, or other. due_at format: "
      "YYYY-MM-DD HH:MM.", tier="own-write")
def add_deadline(title: str, due_at: str, type: str = "assignment", course: str = "") -> dict:
    if check("add_deadline") != Verdict.ALLOW:
        return {"error": "not allowed"}
    dt = _parse_dt(due_at)
    if not dt:
        return {"error": f"could not parse due date '{due_at}' — use YYYY-MM-DD HH:MM"}
    with db_session() as db:
        d = Deadline(title=title, type=type, course=course, due_at=dt, source="manual")
        db.add(d)
        db.flush()
        return {"id": d.id, "title": d.title, "due_at": dt.isoformat()}


@tool("whats_due", "List upcoming deadlines within the next N days (default 7). "
      "Answers 'what's due this week?'", tier="read")
def whats_due(days: int = 7) -> dict:
    horizon = utcnow() + timedelta(days=days)
    with db_session() as db:
        rows = (
            db.query(Deadline)
            .filter(Deadline.status == "open", Deadline.due_at.isnot(None),
                    Deadline.due_at <= horizon, Deadline.due_at >= utcnow() - timedelta(days=1))
            .order_by(Deadline.due_at)
            .all()
        )
        return {"deadlines": [
            {"id": d.id, "title": d.title, "type": d.type, "course": d.course,
             "due_at": d.due_at.isoformat(), "source": d.source}
            for d in rows
        ]}


@tool("complete_deadline", "Mark a deadline done by its id.", tier="own-write")
def complete_deadline(deadline_id: int) -> dict:
    if check("edit_deadline") != Verdict.ALLOW:
        return {"error": "not allowed"}
    with db_session() as db:
        d = db.get(Deadline, deadline_id)
        if not d:
            return {"error": f"no deadline {deadline_id}"}
        d.status = "done"
        return {"completed": d.title}
