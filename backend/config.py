"""Central settings loader. Reads .env from the repo root; every integration is
optional — blank values mean "not configured" and the matching tool degrades
gracefully instead of crashing."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parent.parent
TOKEN_DIR = REPO_ROOT / "backend" / ".tokens"  # gitignored OAuth token store
UPLOAD_DIR = REPO_ROOT / "uploads"             # gitignored syllabus uploads


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # Core
    jarvis_name: str = "Jarvis"
    timezone: str = "America/New_York"
    database_url: str = "postgresql+psycopg://jarvis:jarvis@localhost:5432/jarvis"
    encryption_key: str = ""

    # Brain / voice
    gemini_api_key: str = ""
    gemini_text_model: str = "gemini-3-flash"
    gemini_live_model: str = "gemini-3.1-flash-live-preview"

    # Notifications
    ntfy_topic: str = ""
    ntfy_server: str = "https://ntfy.sh"

    # Gmail / Google Calendar OAuth
    gmail_client_id: str = ""
    gmail_client_secret: str = ""

    # Microsoft Graph
    ms_client_id: str = ""
    ms_client_secret: str = ""
    ms_tenant: str = "common"

    # iCloud IMAP (read-only)
    icloud_email: str = ""
    icloud_app_password: str = ""

    # School
    brightspace_ical_url: str = ""

    # Investments
    alphavantage_api_key: str = ""
    snaptrade_client_id: str = ""
    snaptrade_consumer_key: str = ""

    # Lifestyle
    mealie_base_url: str = ""
    mealie_api_token: str = ""
    wger_base_url: str = ""
    wger_api_token: str = ""
    rss_feeds: str = ""

    # Voice upgrade
    elevenlabs_api_key: str = ""
    use_elevenlabs: bool = False

    # Morning brief
    morning_brief_time: str = "07:00"

    # Weather (Open-Meteo — free, no API key). Defaults: West Lafayette, IN.
    weather_lat: float = 40.4259
    weather_lon: float = -86.9081
    weather_city: str = "West Lafayette"

    @property
    def rss_feed_list(self) -> list[str]:
        return [u.strip() for u in self.rss_feeds.split(",") if u.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
