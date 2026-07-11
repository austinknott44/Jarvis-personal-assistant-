# SETUP_APIS.md — every key Jarvis can use, with direct links

Everything below has a free tier. Items marked **no key** work out of the box.
Fill values into `.env` (copy from `.env.example`), restart, and the HUD
lights the feature up. The Agent Status tile tells you what's still missing.

## 📱 Grab these from your phone right now (5 min, all free, no computer needed)

Do these in order — each just needs a mobile browser and an email. Write the
keys down (Notes app, whatever) and paste them into `.env` when you're back
at the laptop.

1. **Gemini API key** — https://aistudio.google.com/apikey — sign in, "Create API key," pick/create a project named `jarvis-free`. **Do not tap anything about enabling billing.** This is the only one that matters immediately — nothing else works without it.
2. **Alpha Vantage key** — https://www.alphavantage.co/support/#api-key — just an email, key appears instantly.
3. **Finnhub key** — https://finnhub.io/register — email + password, instant. (See below — this one's a bigger upgrade than Alpha Vantage for the strategist desk.)
4. **FRED key** — https://fredaccount.stlouisfed.org/apikeys — free account, key issued same-day (usually instantly).
5. **ntfy topic** — install the ntfy app from the App Store, subscribe to a topic name only you'd guess, e.g. `jarvis-approvals-x7q2z9`. No account needed.
6. **iCloud app-specific password** — account.apple.com → Sign-In and Security → App-Specific Passwords → name it "Jarvis." Works fine from Safari on the phone.

Things that are easier to leave for the computer: Google Cloud OAuth client
creation and Microsoft Entra app registration both involve multi-step console
UIs that are painful on mobile — just create the Google Cloud project itself
(aistudio already made one) and do the OAuth client step later.

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

## Tier 5 — upgrades for the strategist desk (get the keys now, wire in later)

These aren't in the code yet — grab the keys while you're out, and next
session I can wire them into `market_movers.py` / the strategist brief.
Ranked by how much they'd actually sharpen the "options strategist" goal.

| What | Why it's worth adding | Where | Free tier |
|---|---|---|---|
| **Finnhub** | The single best upgrade available. **60 calls/min** vs Alpha Vantage's 25/*day* — basically removes the "cache once a day" constraint. Also adds things AV doesn't have at all: **insider transaction data, congressional/senate trading disclosures, earnings call transcripts, earnings calendar, FDA approval calendar, and company news with sentiment scoring.** Real signal for "why is this stock moving." | https://finnhub.io/register | 60 req/min, real-time quotes (20-min delay), all the alt-data above |
| **FRED** (Federal Reserve Economic Data) | Macro context the strategist brief currently lacks entirely — Fed funds rate, 10-year yield, CPI, unemployment, yield curve. A strategist who ignores "what's the Fed doing" is only half a strategist. Feeds directly into the "market read" paragraph. | https://fredaccount.stlouisfed.org/apikeys | Unlimited, no daily cap, 800k+ series |
| **SEC EDGAR full-text search** | **No key needed at all.** Free search across every 10-K/10-Q/8-K/Form-4 filed since 2001, 10 req/sec, no daily limit. Lets Jarvis pull "what did the actual 10-K say" or flag a fresh insider Form-4 filing on a holding — real primary-source diligence instead of just price action. | https://www.sec.gov/edgar/sec-api-documentation | Free, keyless, no signup |
| **GDELT** | Already name-checked in CLAUDE.md as optional. Free, **keyless**, indexes global news/events in near real time with tone/sentiment scoring — better than plain RSS for "key events" because it's structured (who, what, where, sentiment) rather than just headlines. Good for geopolitical/macro shocks that move markets. | https://www.gdeltproject.org/data.html | Free, keyless |
| **Tradier sandbox** | If Alpha Vantage's options chain data ever feels thin, Tradier's free sandbox gives full delayed options chains bundled with a (free, no-funding-required) developer account. | https://documentation.tradier.com | Free sandbox, no card |
| **Twelve Data** | Backup/alternative quote source if Alpha Vantage's daily cap ever pinches outside the strategist desk (e.g. more frequent portfolio refreshes). | https://twelvedata.com | 800 calls/day |

## Tier 6 — other free upgrades worth knowing about

| What | Why | Where |
|---|---|---|
| **Reddit API** | Free (OAuth app registration, a bit more setup than the others). Could pull sentiment from a ticker's subreddit or r/wallstreetbets for the strategist desk, or your Purdue subreddit for campus news. | https://www.reddit.com/prefs/apps |
| **Spoonacular** | Free tier (150 req/day) for recipes + nutrition data — an alternative to self-hosting Mealie in Docker if you'd rather not run another container. | https://spoonacular.com/food-api |

**Honest caveat:** I didn't add Google Maps/traffic to this list on purpose —
Google's Maps Platform requires a card on file even for its free tier, which
runs against this project's "never enable billing" rule. If you want a
commute/traffic widget later, ask and we'll find a genuinely keyless or
no-card option rather than bend that rule.

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
