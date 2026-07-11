# Jarvis — Personal AI Assistant

A personal, conversational, on/off AI assistant with an Iron-Man-style HUD.
Free to operate: Gemini free tier for brain + voice, ntfy for pushes,
Tailscale for private phone access, Alpha Vantage for prices. It can never
spend money, trade, or act externally without your approval — enforced in
code by a safety gate, not just prompts.

**Docs:** [CLAUDE.md](CLAUDE.md) (the spec) · [BUILD_GUIDE.md](BUILD_GUIDE.md)
(the map) · [WALKTHROUGH.md](WALKTHROUGH.md) (click-by-click setup) ·
[SETUP_APIS.md](SETUP_APIS.md) (every key, with links) ·
[SKILLS.md](SKILLS.md) (capability upgrades + dev-workflow skills) ·
[IDEAS.md](IDEAS.md) (roadmap: automation + real financial value).

## What's built (all 8 phases scaffolded and wired)

- **HUD frontend** (React + Vite + TS + Tailwind): star-sphere orb (idle
  rotate / thinking spin / speaking expand+pulse, reduced-motion fallback),
  chat thread, mic button (Gemini Live voice with barge-in), master ON/OFF
  toggle, approval cards, live tiles, Day/Week/Month unified calendar with
  Personal/Work/School/Clubs colors, syllabus-upload review screen, Cleanup
  Review with undo, Preferences / Portfolio / Workout Split / Account tabs.
- **Backend** (FastAPI + Postgres + SQLAlchemy/Alembic): agent core with
  Gemini Flash tool-calling, durable memory (`facts` + history), the
  **safety gate** (Tier 1 auto-allow / Tier 2 approval + ntfy push / Tier 3
  forbidden-by-design), single 7 AM morning-brief job, startup catch-up.
- **Tools**: unified calendar (Google OAuth + Outlook Graph + local),
  AI event categorization that learns from corrections, syllabus PDF parser,
  Brightspace iCal sync, unified 3-account email (Gmail / Outlook / iCloud
  read-only IMAP) with needs-reply ranking and confidence-gated marketing
  cleanup (≥95% auto-move, else ask; 3-week auto-trash, all logged, school
  mail never touched), read-only investments (manual holdings + Alpha
  Vantage + deep-analysis prompt hand-off), meals, workout split
  (tab + voice), RSS news.

Every integration degrades gracefully when unconfigured — the app runs with
zero keys and lights features up as you add them.

## Quick start (Windows)

```powershell
# 1. Prereqs: Python 3.11+, Node LTS, Docker Desktop (running), Git
# 2. Copy .env.example to .env and fill in what you have (GEMINI_API_KEY first)
# 3. Generate the encryption key for the iCloud password:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
#    …and paste it as ENCRYPTION_KEY in .env
# 4. Run everything:
./scripts/run-dev.ps1
```

Open http://localhost:5173, flip the toggle ON, and talk to Jarvis.
Full setup (Google OAuth, Brightspace iCal, ntfy, Tailscale…) is in
[WALKTHROUGH.md](WALKTHROUGH.md).

## Home HUD layout

Left: daily weather (Open-Meteo — free, keyless) → today's agenda
(all-day events pinned on top) → due-today / due-this-week counters →
tomorrow's agenda → inbox summary (unread / needs-reply). Center: the
star-sphere orb at true screen center, with the chat thread beneath it
doubling as the live transcript for voice sessions. Right: news & key
events (Google News + BBC RSS defaults, free and keyless, plus your own
feeds, with an LLM "key read") → three daily stock squares (ticker, name,
price, day + 7-day change, one-line why — Alpha Vantage, cached once per
day to stay inside the free 25-call cap) → agent status (on/off, LLM
calls today, errors, config notices).

A left-nav **Inbox** view shows the full unified 3-account email list
with needs-reply/deadline flags and the marketing-cleanup runner. The
**Financials** tab adds the **Strategist Desk** — a daily options-
strategist note (market read, defined-risk structures with strikes,
expiries, and IV from Alpha Vantage's free options chains, portfolio
note, and what to avoid) — plus picks with reasoning and full
gainers/losers/most-active tables. Educational only; Jarvis has no
trade capability by design. All API setup links: [SETUP_APIS.md](SETUP_APIS.md).

## Data sources (all free)

| Data | Source | Key needed |
|---|---|---|
| Weather | Open-Meteo | none |
| News | Google News RSS + BBC (+ your RSS_FEEDS) | none |
| Stock quotes/movers | Alpha Vantage free tier | free key |
| Brain + voice | Gemini free tier | free key |
| Push notifications | ntfy.sh | none |

## Safety model (short version)

| Tier | What | Behavior |
|---|---|---|
| 1 | Reads, your own calendar/tasks/holdings/split, drafts, briefs | Auto-allowed |
| 2 | Sending email, inviting others, low-confidence cleanup moves | Approval card + phone push; executes only after you approve |
| 3 | Money, trades, transfers, payments, bookings | **The code does not exist.** Hard-refused |

Approvals expire after 24 h. The 7 AM brief is the only unattended job.
OFF means dormant — no LLM calls, no polling, no cost.

## Testing without real accounts

```powershell
# Backend API against SQLite (no Docker needed):
cd backend
$env:DATABASE_URL="sqlite:///./jarvis-dev.db"
.venv\Scripts\python.exe -m uvicorn main:app --reload
# Then: POST /brief/run to test the morning brief, /health for integration status.
```
