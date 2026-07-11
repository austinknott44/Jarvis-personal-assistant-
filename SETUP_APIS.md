# SETUP_APIS.md — every key Jarvis can use, with direct links

Everything below has a free tier. Items marked **no key** work out of the box.
Fill values into `.env` (copy from `.env.example`), restart, and the HUD
lights the feature up. The Agent Status tile tells you what's still missing.

## Tier 0 — the brain (do this first)

| What | Where | .env |
|---|---|---|
| **Gemini API key** (brain + voice, free tier) | https://aistudio.google.com/apikey — create key, pick/create project `jarvis-free`, **NEVER enable billing on it** | `GEMINI_API_KEY` |
| **Encryption key** (iCloud password at rest) | run: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | `ENCRYPTION_KEY` |

## Tier 1 — daily life

| What | Where | .env |
|---|---|---|
| **Weather** — Open-Meteo | **no key, already working** — set your coords if not West Lafayette: https://open-meteo.com/en/docs | `WEATHER_LAT` `WEATHER_LON` `WEATHER_CITY` |
| **News** — Google News + BBC RSS | **no key, already working** — add your own feeds (comma-separated) on top | `RSS_FEEDS` |
| **Push notifications** — ntfy | install the iPhone app https://ntfy.sh — subscribe to a private topic like `jarvis-approvals-7fq2z9` | `NTFY_TOPIC` |
| **Phone access** — Tailscale | https://tailscale.com/download on laptop + iPhone, same account | — |

## Tier 2 — school + calendar + email

| What | Where | .env |
|---|---|---|
| **Google OAuth** (Gmail + Google Calendar) | https://console.cloud.google.com → same `jarvis-free` project → *APIs & Services → Enable APIs* → enable **Gmail API** + **Google Calendar API** → *OAuth consent screen* (External, add yourself as test user) → *Credentials → Create → OAuth client ID → Desktop app* | `GMAIL_CLIENT_ID` `GMAIL_CLIENT_SECRET` |
| **Outlook / Purdue email** — Microsoft Graph | https://entra.microsoft.com → *App registrations → New registration*. If Purdue blocks it, that's expected — Jarvis degrades to disabled | `MS_CLIENT_ID` (`MS_TENANT=common`) |
| **iCloud Mail** (read-only) | https://account.apple.com → *Sign-In and Security → App-Specific Passwords* → generate "Jarvis" — or paste it in the Preferences tab (stored encrypted) | `ICLOUD_EMAIL` `ICLOUD_APP_PASSWORD` |
| **Brightspace due dates** | log into https://purdue.brightspace.com → *Calendar → Subscribe* → copy the iCal URL | `BRIGHTSPACE_ICAL_URL` |

## Tier 3 — markets & the strategist desk

| What | Where | .env |
|---|---|---|
| **Alpha Vantage** (quotes, movers, daily picks, **options chains w/ IV + greeks**) | https://www.alphavantage.co/support/#api-key — instant free key, 25 req/day (Jarvis caches everything daily to fit) | `ALPHAVANTAGE_API_KEY` |
| **SnapTrade** (optional read-only Robinhood holdings sync) | https://snaptrade.com — check current free/dev tier | `SNAPTRADE_CLIENT_ID` `SNAPTRADE_CONSUMER_KEY` |

**Upgrade paths when free caps pinch** (documented, not yet wired):
- **Finnhub** — https://finnhub.io (free: 60 calls/min; real-time quotes, news, sentiment)
- **Tradier sandbox** — https://documentation.tradier.com (free full options chains, delayed)
- **Twelve Data** — https://twelvedata.com (free: 800 calls/day, global coverage)

## Tier 4 — lifestyle (optional, self-hosted, free)

| What | Where | .env |
|---|---|---|
| **Mealie** (meals/groceries) | uncomment in `docker-compose.yml`, open http://localhost:9925, make account → API token | `MEALIE_BASE_URL` `MEALIE_API_TOKEN` |
| **wger** (workouts) | uncomment in `docker-compose.yml`, open http://localhost:8000 → API token | `WGER_BASE_URL` `WGER_API_TOKEN` |
| **ElevenLabs voice** (optional, ~$5/mo — the ONLY paid thing, off by default) | https://elevenlabs.io | `ELEVENLABS_API_KEY` `USE_ELEVENLABS=true` |

## The honest part about "making a lot of money"

The strategist desk gives real, current, data-driven options strategy ideas
(defined-risk structures, strikes, expiries, IV context) and will tell you
what invalidates each idea. No AI — none — can guarantee trading profits, and
most short-dated options speculation loses money. Jarvis is built to make you
*smarter* with real data and honest risk framing, it always says what the max
loss is, and it can never touch your money: execution stays 100% in your
hands in your own broker. That last part is a safety rule enforced in code.
