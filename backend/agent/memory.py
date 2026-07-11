"""Memory: durable facts + recent conversation history. Loaded into every
turn so Jarvis remembers the user across on/off sessions and restarts.
Schema leaves room for pgvector semantic recall later."""
from db.models import Conversation, Fact, utcnow
from db.session import db_session

RECENT_TURNS = 20
MAX_FACTS = 100


def remember_turn(role: str, content: str, modality: str = "text") -> None:
    with db_session() as db:
        db.add(Conversation(role=role, content=content, modality=modality))


def store_fact(key: str, value: str, category: str = "general") -> None:
    with db_session() as db:
        existing = db.query(Fact).filter(Fact.key == key).first()
        if existing:
            existing.value = value
            existing.category = category
            existing.updated_at = utcnow()
        else:
            db.add(Fact(key=key, value=value, category=category))


def get_facts() -> list[dict]:
    with db_session() as db:
        facts = db.query(Fact).order_by(Fact.updated_at.desc()).limit(MAX_FACTS).all()
        return [{"key": f.key, "value": f.value, "category": f.category} for f in facts]


def get_recent_history(limit: int = RECENT_TURNS) -> list[dict]:
    with db_session() as db:
        rows = (
            db.query(Conversation)
            .order_by(Conversation.created_at.desc())
            .limit(limit)
            .all()
        )
        return [{"role": r.role, "content": r.content} for r in reversed(rows)]


def build_memory_context() -> str:
    """Compact memory block injected into the system prompt each turn."""
    facts = get_facts()
    if not facts:
        return "No stored facts about the user yet."
    lines = [f"- {f['key']}: {f['value']}" for f in facts]
    return "Known facts about the user:\n" + "\n".join(lines)
