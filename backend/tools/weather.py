"""Permission tier: read (Tier 1). Daily weather from Open-Meteo — free,
no API key, no registration (research 2026: easiest keyless global weather
source; aggregates NOAA/DWD/MeteoFrance). Location comes from WEATHER_LAT/
WEATHER_LON/WEATHER_CITY in .env (defaults to West Lafayette, IN)."""
import logging

import httpx

from config import get_settings
from tools.registry import tool

logger = logging.getLogger("jarvis.weather")

# WMO weather interpretation codes -> human text + emoji-ish glyph
WMO = {
    0: ("Clear sky", "☀"), 1: ("Mostly clear", "🌤"), 2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁"), 45: ("Fog", "🌫"), 48: ("Rime fog", "🌫"),
    51: ("Light drizzle", "🌦"), 53: ("Drizzle", "🌦"), 55: ("Heavy drizzle", "🌧"),
    61: ("Light rain", "🌦"), 63: ("Rain", "🌧"), 65: ("Heavy rain", "🌧"),
    66: ("Freezing rain", "🌧"), 67: ("Freezing rain", "🌧"),
    71: ("Light snow", "🌨"), 73: ("Snow", "🌨"), 75: ("Heavy snow", "❄"),
    77: ("Snow grains", "🌨"), 80: ("Showers", "🌦"), 81: ("Showers", "🌧"),
    82: ("Violent showers", "⛈"), 85: ("Snow showers", "🌨"), 86: ("Snow showers", "❄"),
    95: ("Thunderstorm", "⛈"), 96: ("Thunderstorm + hail", "⛈"), 99: ("Thunderstorm + hail", "⛈"),
}


def _describe(code: int) -> tuple[str, str]:
    return WMO.get(code, ("Weather", "•"))


def fetch_weather() -> dict:
    """Current conditions + today/tomorrow daily forecast + next hours."""
    s = get_settings()
    try:
        resp = httpx.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": s.weather_lat,
            "longitude": s.weather_lon,
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                       "weather_code,wind_speed_10m,precipitation",
            "hourly": "temperature_2m,precipitation_probability,weather_code",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
                     "precipitation_probability_max,sunrise,sunset",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "timezone": s.timezone,
            "forecast_days": 3,
        }, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("open-meteo fetch failed: %s", exc)
        return {"error": f"weather unavailable: {exc}"}

    cur = data.get("current", {})
    daily = data.get("daily", {})
    hourly = data.get("hourly", {})

    desc, glyph = _describe(int(cur.get("weather_code", -1)))

    # next 6 hourly readings from "now"
    hours = []
    times = hourly.get("time", [])
    cur_time = cur.get("time", "")
    start = next((i for i, t in enumerate(times) if t >= cur_time), 0)
    for i in range(start, min(start + 6, len(times))):
        hdesc, hglyph = _describe(int(hourly["weather_code"][i]))
        hours.append({
            "time": times[i][11:16],
            "temp": round(hourly["temperature_2m"][i]),
            "precip_pct": hourly.get("precipitation_probability", [0] * len(times))[i],
            "glyph": hglyph,
            "desc": hdesc,
        })

    days = []
    for i in range(min(2, len(daily.get("time", [])))):
        ddesc, dglyph = _describe(int(daily["weather_code"][i]))
        days.append({
            "date": daily["time"][i],
            "desc": ddesc,
            "glyph": dglyph,
            "high": round(daily["temperature_2m_max"][i]),
            "low": round(daily["temperature_2m_min"][i]),
            "precip_pct": daily.get("precipitation_probability_max", [0, 0])[i],
            "sunrise": (daily.get("sunrise", [""])[i] or "")[11:16],
            "sunset": (daily.get("sunset", [""])[i] or "")[11:16],
        })

    return {
        "city": s.weather_city,
        "current": {
            "temp": round(cur.get("temperature_2m", 0)),
            "feels_like": round(cur.get("apparent_temperature", 0)),
            "humidity": cur.get("relative_humidity_2m", 0),
            "wind_mph": round(cur.get("wind_speed_10m", 0)),
            "desc": desc,
            "glyph": glyph,
        },
        "hours": hours,
        "today": days[0] if days else None,
        "tomorrow": days[1] if len(days) > 1 else None,
        "source": "open-meteo.com (free, keyless)",
    }


@tool("get_weather", "Get current weather + today's and tomorrow's forecast "
      "for the user's location.", tier="read")
def get_weather() -> dict:
    return fetch_weather()
