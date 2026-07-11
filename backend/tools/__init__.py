"""Tool package — importing load_all() registers every tool with the registry.
New integrations drop in by adding a module here and importing it below."""


def load_all() -> None:
    from tools import (  # noqa: F401
        calendar_unified,
        email_cleanup,
        email_unified,
        investments,
        meals_mealie,
        memory_tools,
        news_rss,
        school_brightspace,
        tasks_deadlines,
        workouts_wger,
    )
