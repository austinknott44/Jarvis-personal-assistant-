# BUILD_GUIDE.md — Jarvis Personal AI Assistant

> This is the technical build reference: the stack, the folder layout, what each piece does, the environment variables, the database schema, and how the phases fit together. Pair it with WALKTHROUGH.md (the click-by-click, do-this-then-that guide) and CLAUDE.md (the spec Claude Code reads).

---

## 0. Read this first

- **CLAUDE.md** = the spec. Put it at the repo root so Claude Code auto-reads it.
- **BUILD_GUIDE.md** (this file) = the map. What exists and why.
- **WALKTHROUGH.md** = the steps. Exactly what to click/type, in order.

You will mostly work by opening Claude Code in the project folder and asking it to build each phase, pointing it at CLAUDE.md. This guide tells you what "done" looks like for each part so you can verify Claude Code's output.

---

## 1. The stack (final)

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.11+, FastAPI | Async + native WebSockets for live voice; easiest for AI agents to write well |
| Frontend | React (Vite + TypeScript) + Tailwind | Best-looking HUD, componentized, fast dev |
| Database | PostgreSQL + SQLAlchemy + Alembic | Robust memory store; migrations keep schema clean |
| Brain | Gemini 3 Flash (free tier), `google-genai` SDK | Free, capable, good tool-calling |
| Voice | Gemini Live API (free tier) | Native speech-to-speech, barge-in, tool calls |
| Deep reasoning | Claude Pro / ChatGPT Plus (manual) | Flagship reasoning without API cost |
| Remote access | Tailscale | Private phone access, no public exposure |
| Push notifications | ntfy | Free, no account, self-hostable approval pushes |
| Optional voice upgrade | ElevenLabs TTS (env-flagged) | Nicer voice if you spend your ~$5/mo |

**You are on Windows.** Everything below uses Windows-friendly commands (PowerShell). WSL2 is optional.

---

## 2. Folder layout

```
jarvis-assistant/
├── CLAUDE.md                 # spec (Claude Code reads this)
├── BUILD_GUIDE.md            # this file
├── WALKTHROUGH.md            # step-by-step
├── .env                      # secrets (gitignored) — you create from .env.example
├── .env.example              # template committed to repo
├── .gitignore
├── docker-compose.yml        # Postgres (+ optional Mealie/wger/ntfy) in one command
├── backend/
│   ├── main.py               # FastAPI app entry
│   ├── agent/
│   │   ├── core.py           # the agent loop (brain + tool router)
│   │   ├── brain.py          # Gemini Flash calls, prompt assembly
│   │   ├── voice.py          # Gemini Live WebSocket handling
│   │   └── memory.py         # retrieve/store facts + history
│   ├── safety/
│   │   └── gate.py           # THE safety gate — every action passes here
│   ├── tools/
│   │   ├── registry.py       # tool registration so new tools "drop in"
│   │   ├── email_gmail.py
│   │   ├── email_outlook.py
│   │   ├── email_icloud.py
│   │   ├── email_cleanup.py  # spam/marketing classify + move + 3wk auto-trash (logged)
│   │   ├── calendar_google.py
│   │   ├── calendar_outlook.py
│   │   ├── calendar_categorize.py  # AI category (personal/work/school/clubs) + learns
│   │   ├── school_syllabus.py      # syllabus PDF → schedule + exams (primary school path)
│   │   ├── school_brightspace.py   # Brightspace iCal live due dates
│   │   ├── investments.py
│   │   ├── meals_mealie.py
│   │   ├── workouts_wger.py
│   │   └── news_rss.py
│   ├── scheduler.py          # the single 7am ET morning-brief job
│   ├── crypto.py             # encrypt/decrypt for iCloud app-password at rest
│   ├── db/
│   │   ├── models.py         # SQLAlchemy models
│   │   └── migrations/       # Alembic
│   └── config.py             # loads .env, exposes settings
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── StarSphere.tsx    # the dot-sphere orb (idle rotate/load spin/speak expand)
│   │   │   ├── ChatThread.tsx
│   │   │   ├── MicButton.tsx
│   │   │   ├── MasterToggle.tsx
│   │   │   ├── ApprovalCard.tsx
│   │   │   ├── TopTabs.tsx       # Preferences / Portfolio / Workout Split / Account
│   │   │   ├── LeftNav.tsx       # Home(orb) / Calendar / Cleanup Review
│   │   │   ├── CalendarView.tsx  # Day/Week/Month, categorized, merged Google+Outlook
│   │   │   ├── tabs/ (Preferences, Portfolio, WorkoutSplit, Account)
│   │   │   ├── tiles/ (Schedule, Deadlines, Portfolio, Brief, Approvals, Cleanup)
│   │   │   └── hud/ (frame, glow, indicators)
│   │   ├── styles/ (Tailwind + HUD theme tokens)
│   │   └── api.ts            # talks to FastAPI
│   └── vite.config.ts
└── scripts/
    ├── run-dev.ps1           # starts backend + frontend together (Windows)
    └── setup-db.ps1          # runs migrations
```

---

## 3. Environment variables (`.env.example`)

```
# ---- Core ----
JARVIS_NAME=Jarvis
TIMEZONE=America/New_York
DATABASE_URL=postgresql://jarvis:jarvis@localhost:5432/jarvis
ENCRYPTION_KEY=            # generated once; encrypts iCloud app-password at rest (see crypto.py)

# ---- Brain / Voice (Gemini free tier — KEEP BILLING DISABLED on this project) ----
GEMINI_API_KEY=your_free_gemini_key_here
GEMINI_TEXT_MODEL=gemini-3-flash
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview

# ---- Notifications (ntfy) ----
NTFY_TOPIC=jarvis-approvals-<random-string>   # your private topic
NTFY_SERVER=https://ntfy.sh                    # or your self-hosted server

# ---- Email: Gmail (OAuth) ----
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=

# ---- Email: Outlook / .edu (Microsoft Graph) ----
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_TENANT=common
# NOTE: your university may block third-party app access. See WALKTHROUGH §Email.

# ---- Email: iCloud (IMAP, read-only) ----
ICLOUD_EMAIL=
ICLOUD_APP_PASSWORD=            # app-specific password from appleid.apple.com

# ---- School: Brightspace at Purdue (NO student API) ----
BRIGHTSPACE_ICAL_URL=           # personal iCal feed from purdue.brightspace.com Calendar→Subscribe
# Syllabus upload is the PRIMARY path (no key needed). No Valence API for Purdue students.

# ---- Investments (brokerage = Robinhood: NO official equity API) ----
ALPHAVANTAGE_API_KEY=           # free tier — powers prices for manual holdings (default path)
# Optional read-only auto-sync via SnapTrade (official OAuth, cannot trade):
SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_KEY=
# DO NOT use robin_stocks / unofficial APIs (raw password + 2FA risk).

# ---- Lifestyle (optional; degrade gracefully if blank) ----
MEALIE_BASE_URL=
MEALIE_API_TOKEN=
WGER_BASE_URL=
WGER_API_TOKEN=
RSS_FEEDS=https://feed1,https://feed2   # comma-separated

# ---- Optional voice upgrade ----
ELEVENLABS_API_KEY=             # leave blank to use free Gemini voice
USE_ELEVENLABS=false
```

**Golden rule:** the Google Cloud project that owns `GEMINI_API_KEY` must have **billing disabled** to keep the free tier. If you ever want paid voice/limits, make a *separate* project — never enable billing on the free one.

---

## 4. Database schema (core tables)

| Table | Purpose | Key columns |
|---|---|---|
| `facts` | durable facts about you | id, key, value, category, updated_at |
| `conversations` | chat history | id, role, content, modality (text/voice), created_at |
| `cache` | latest snapshots | domain (email/deadlines/portfolio), payload(json), fetched_at |
| `deadlines` | unified school + manual | id, title, type (assignment/quiz/exam), course, due_at, source, status |
| `tasks` | your reminders/todos | id, title, due_at, done, created_by (user/agent) |
| `holdings` | your positions | id, ticker, shares, cost_basis, target_pct |
| `workout_split` | your workout plan | id, day, focus, exercises(json), updated_at |
| `approvals` | pending gated actions | id, action_type, description, preview(json), status, created_at, expires_at |
| `category_rules` | learned event categorization | id, matcher(json: sender/keyword/calendar), category, source(user/agent) |
| `cleanup_log` | every marketing move/delete | id, account, subject, sender, action(moved/deleted), confidence, at |
| `email_accounts` | connection metadata | id, provider, address, auth_type(oauth/imap), token_ref/enc_secret_ref, status |

Credentials: OAuth tokens stored via the credential store; the iCloud app-password is encrypted at rest with `ENCRYPTION_KEY` (see `crypto.py`) — never plaintext, never synced off-device.

Add `pgvector` later for semantic memory (optional; schema designed to allow it).

---

## 5. The safety gate (the most important module)

`backend/safety/gate.py` exposes one function every action passes through:

```
check(action) -> ALLOW | REQUIRE_APPROVAL | FORBIDDEN
```

- **ALLOW** (Tier 1): reads; create/edit/delete YOUR OWN calendar/tasks; drafts; briefs; **move an email to `Jarvis/Marketing` when ≥95% confident it's marketing/spam AND not school-related** (logged); **auto-trash marketing mail in that folder older than 3 weeks that was moved at ≥95% confidence** (logged, recoverable from Trash).
- **REQUIRE_APPROVAL** (Tier 2): send email; invite others; anything external; delete non-own items; **move/classify an email as marketing when confidence is BELOW 95%**; deleting anything school-related or anything not moved at high confidence → creates an `approvals` row, sends ntfy push, blocks until approved.
- **FORBIDDEN** (Tier 3): money/trade/transfer/payment/booking → the code path does not exist; if somehow reached, hard-refuse and log.
- **School-exempt rule:** anything from purdue.edu / professors / Brightspace / course-related is NEVER auto-moved or auto-deleted, regardless of confidence.
- **Fail-safe default:** unknown/ambiguous → REQUIRE_APPROVAL.

Every tool function must call the gate before any write/external effect. There is no bypass. This is enforced in code, not just in the LLM prompt.

---

## 6. How voice works (Gemini Live)

- Frontend mic button opens a WebSocket to `/voice`.
- Backend bridges to the Gemini Live API (`GEMINI_LIVE_MODEL`), streaming your audio up and spoken audio back, with barge-in.
- Tool calls happen mid-conversation: Gemini can invoke your tools while talking (e.g., "read my latest email"), still routed through the safety gate.
- Free-tier audio sessions cap around 15 min — the client transparently opens a fresh session when needed.
- Closing the mic or toggling OFF ends the session (no hot mic, no cost when idle).
- Optional: set `USE_ELEVENLABS=true` to route spoken output through ElevenLabs instead of Gemini's built-in voice.

---

## 7. On/off + the single scheduled job

- **Master toggle** → `/agent/start` and `/agent/stop`. Stop = dormant core: no LLM calls, no polling, no voice.
- **Startup catch-up** runs on start: refresh email/deadlines/calendar/portfolio, then greet with what changed.
- **7:00 AM ET morning brief** (`scheduler.py`): the ONLY unattended job. One batched, read-only pass → stores the brief + sends one ntfy push. Efficient by design (minimize tokens). No other background activity exists.

---

## 8. "Done" checklist per phase

- **P1 Text MVP:** type to Jarvis in the HUD; the **star-sphere orb** rotates when idle, spins faster when thinking, expands + stops when it speaks; remembers you across restarts; toggle works; top tabs + left nav scaffolded.
- **P2 Calendar+School+Tasks:** unified Google+Outlook calendar with Day/Week/Month; events categorized Personal/Work/School/Clubs (asks when unsure, learns from corrections); **syllabus PDF upload** extracts schedule + exams → review → commit; Brightspace iCal feeds live due dates; "what's due this week / block 2h for bio" work; manual + voice add.
- **P3 Briefs:** turning on greets with changes; 7am brief appears + pushes once.
- **P4 Email:** unified 3-account summary; "needs reply" ranking; drafting; every send asks approval; **auto-cleanup** moves ≥95%-confident marketing to `Jarvis/Marketing` (asks below 95%), auto-trashes those >3 weeks old, logs to Cleanup Review, never touches Purdue/school mail.
- **P5 Investments:** Portfolio tab + tile; manual holdings (+ optional SnapTrade read-only); daily investment brief; "deep analysis" hands you a Claude/ChatGPT prompt; edit by tab AND voice; zero trade capability.
- **P6 Voice:** mic → real conversation, barge-in, tool calls mid-talk, orb enters speaking state.
- **P7 Lifestyle:** meals/grocery, Workout Split tab (edit by tab AND voice), news/hobbies tiles (or gracefully disabled if not set up).
- **P8 Preferences/Account complete:** connect email accounts (OAuth where possible, encrypted iCloud app-password), manage cleanup/category rules, About-Me profile seeds memory; PWA on phone; optional wake word / semantic memory / ElevenLabs.

---

## 9. Running it (Windows)

- Start Postgres (+ optional services): `docker compose up -d`
- Backend: `cd backend; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt; uvicorn main:app --reload`
- Frontend: `cd frontend; npm install; npm run dev`
- Or both at once: `./scripts/run-dev.ps1`
- Phone access: install Tailscale on PC + iPhone, open the PC's Tailscale hostname in Safari, "Add to Home Screen."

Full click-by-click is in WALKTHROUGH.md.

---

## 10. Cost control (keep it $0)

- Gemini project: billing DISABLED (free brain + voice).
- Only one scheduled job (7am), batched, read-only.
- Agent dormant when toggled off = no calls.
- Free tiers: Alpha Vantage, ntfy, Tailscale, Mealie/wger (self-hosted), RSS.
- Optional spend: ElevenLabs voice (~$5/mo) — your call, off by default.
- Watch for 429 (rate-limit) errors from Gemini free tier; the code should retry with backoff and fall back to text if Live is rate-limited.
