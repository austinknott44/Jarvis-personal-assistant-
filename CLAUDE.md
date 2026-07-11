# CLAUDE.md — Project Specification for "Jarvis" Personal AI Assistant

> This file is the single source of truth for Claude Code. Read it fully before generating or modifying any code. It defines what to build, how it must behave, and the rules that must never be broken. When in doubt, prefer the safety rules over any feature.

---

## 1. What this project is

A **personal, conversational, autonomous AI assistant** named **Jarvis** that the user (Austin) starts and stops on demand. It talks (real-time voice) and types, holds memory across on/off sessions, and connects to the user's real life tools: email (3 accounts), calendar, school deadlines (Brightspace), investments (read-only), meals, workouts, and news/hobbies. It can act autonomously on low-risk things and must ask approval for anything sensitive. It can NEVER spend or move money.

**Design goals, in priority order:**
1. **Safety** — never spend money, never send/act externally without approval. This overrides everything.
2. **Conversational** — natural voice + text, same brain and memory for both.
3. **Autonomous on low-risk tasks** — edit the user's own calendar/tasks freely; chain multi-step work.
4. **On/off, not idling** — runs only when activated; a single scheduled morning job is the sole exception.
5. **Polish** — dark, futuristic "Iron Man HUD" interface that looks and feels premium.
6. **Free to operate** — Gemini free tier for brain + voice; $0/month target.

---

## 2. Finalized tech stack (do not substitute without asking)

- **Backend:** Python 3.11+ with **FastAPI** (async, WebSocket support for live voice).
- **Frontend:** **React** (Vite + TypeScript), dark HUD aesthetic. Tailwind for styling.
- **Database:** **PostgreSQL** (via SQLAlchemy + Alembic migrations). Local instance.
- **Brain (LLM):** **Google Gemini 3 Flash** via the free-tier Gemini API (`google-genai` SDK). Billing MUST stay disabled on this Google Cloud project.
- **Voice:** **Gemini Live API** (native speech-to-speech, WebSocket) — free tier. Optional ElevenLabs TTS output as a pluggable upgrade (env-flagged, off by default).
- **Deep reasoning (manual, not automated):** the agent prepares rich prompts for the user to paste into Claude Pro / ChatGPT Plus. It does NOT call those as APIs.
- **Networking:** app runs locally; **Tailscale** provides private access from the user's iPhone. Never expose to the public internet.
- **Auth to services:** OAuth 2.0 (Gmail, Microsoft Graph, Google Calendar), IMAP w/ app-specific password (iCloud), API tokens (Brightspace, market data).

**Platform:** User is on Windows (PC + laptop, laptop primary) + iPhone. Ensure all setup works on Windows (use `venv`, document PowerShell commands; WSL2 optional but not required).

---

## 3. Architecture (build to this shape)

```
Frontend (React HUD)  ──WebSocket/REST──►  FastAPI backend
  · chat thread                              · /chat  (text)
  · mic button (live voice)                  · /voice (WS → Gemini Live)
  · ON/OFF master toggle                     · /agent/start · /agent/stop
  · approval cards                           · /approvals  (pending queue)
  · live tiles (schedule, deadlines,         · /tools/*    (each integration)
    portfolio, briefs)                       · Agent core (brain + tool router)
                                             · Safety gate (approval enforcement)
                                             · Scheduler (7am ET brief only)
                                                    │
                                             PostgreSQL (memory, cache, approvals)
                                                    │
        ┌───────────┬───────────┬───────────┬───────────┬───────────┐
      Email       Calendar    School      Invest      Lifestyle    Memory
     (Gmail,     (Google,   (Brightspace  (Alpha       (Mealie,    (facts,
      Outlook,    Outlook)   /D2L API +    Vantage +    wger,       history,
      iCloud)                 iCal)        brokerage    RSS/GDELT)   prefs)
                                            read-only)
```

**Agent core loop:** receive user input (text or transcribed voice) → load relevant memory → let Gemini decide which tool(s) to call → for each intended action, check the safety gate → execute allowed actions, queue gated ones for approval → respond (text + optional spoken).

---

## 4. THE SAFETY RULES (non-negotiable — enforce in code, not just prompts)

These are enforced by a dedicated `safety_gate` module that every action passes through. The LLM prompt also states them, but code is the real enforcement.

### Tier 1 — AUTO-ALLOWED (no approval)
- Read anything: emails, calendar, deadlines, portfolio data, news, meals, workouts.
- Create/edit/delete the user's OWN calendar events and tasks/reminders.
- Generate briefs, summaries, analysis, draft (but not send) content.

### Tier 2 — APPROVAL REQUIRED (must confirm before executing)
- Sending ANY email (all 3 accounts).
- Creating calendar events that invite OTHER people.
- Any action that affects the outside world / leaves the user's accounts.
- Deleting anything that isn't the user's own task/event created by the agent.

### Tier 3 — FORBIDDEN — DO NOT BUILD THE CAPABILITY AT ALL
- Spending money, moving money, making payments.
- Executing trades, placing orders, transferring funds/securities.
- Booking or paying for travel.
- Any financial transaction of any kind.

> Tier 3 is not a gate — the code to do these things must NOT EXIST. If a feature request would require building payment/trade/transfer capability, refuse and explain. The brokerage integration is READ-ONLY: quotes, holdings, balances — never orders.

### Approval mechanism
- Gated actions create a row in the `approvals` table with status `pending`, a human-readable description, and a full preview (e.g., the exact email draft).
- The user is notified two ways, whichever they see first: (a) an in-app approval card in the HUD, (b) a push notification to their iPhone (via ntfy — free, self-hostable, no account). Approving/rejecting from either updates the same row.
- The action executes ONLY after status becomes `approved`. On `rejected`, discard. Nothing gated ever auto-fires. Approvals expire after 24h → auto-reject.

---

## 5. On/off + scheduling behavior (exact)

- **Master toggle** in the HUD starts/stops the agent. "Off" = no LLM calls, no voice sessions, no polling, no cost. The FastAPI server may stay running to serve the toggle UI, but the agent core is dormant.
- **Startup catch-up:** when toggled ON, run a fast refresh of things that go stale — new email, new/updated deadlines, today's calendar, portfolio moves — then greet with "welcome back, here's what changed."
- **On-demand refresh:** while ON, refresh any domain when the user asks or when a task needs current data.
- **The ONE scheduled job:** a single **7:00 AM Eastern** "morning brief" that runs even if the agent is off — read-only, produces the daily brief (schedule + deadlines + portfolio + top news), stores it, and sends one push notification. This is the ONLY unattended activity. It must be efficient (one batched pass, minimal tokens). No other background polling exists.

---

## 6. Integrations (build as independent, pluggable tool modules)

Each integration is a module under `backend/tools/` exposing typed functions the agent can call. Design so new tools "drop in" via a registry.

### Email (3 accounts, unified) + AUTOMATED CLEANUP
- **Gmail** — Gmail API, OAuth. Scopes: `readonly` + `compose` + `modify` (modify needed to move/label/trash; still gated per rules below). NOT full delete-everything scope.
- **.edu Outlook (Purdue)** — Microsoft Graph. Purdue is a Microsoft shop; verify tenant allows third-party app access. If blocked, degrade to read-only.
- **iCloud Mail** — IMAP with app-specific password. READ-ONLY in v1 (no send, no delete).
- Unify into one inbox view tagged by account. "Needs reply" ranking across all. Every send → Tier 2 approval.
- Deadline-looking emails: FLAG for user confirmation; do NOT auto-create deadlines from email text.

**Automated inbox cleanup (spam/marketing) — confidence-gated:**
- The agent classifies each inbox email as marketing/promotional/spam vs. legitimate. Detection is **MODERATE**: catch clear marketing/promotional mail (coupons, deals, product promos, sales, "% off", no-reply bulk senders, unsubscribe-footer bulk mail) even from senders the user occasionally gets, when the content is clearly promotional.
- **School-related mail is NEVER touched** — anything from purdue.edu, professors, Brightspace, or course-related is exempt from all cleanup, always.
- **Confidence threshold governs autonomy:**
  - If the agent is **≥95% certain** an email is marketing/spam AND unrelated to school AND unexpected (not a service the user actively uses for something important): **auto-move** it to a `Jarvis/Marketing` folder (Tier 1, logged).
  - If **below 95% certain**: do NOT move it autonomously — surface it for approval (Tier 2). Look at concrete signals: promotional keywords (coupon, deal, sale, % off, "limited time", "shop now"), sender type (no-reply/marketing domains), bulk formatting, unsubscribe footers.
- **Auto-delete of moved marketing mail:** items sitting in the `Jarvis/Marketing` folder that are **older than 3 weeks** AND were moved at ≥95% confidence may be **auto-deleted (moved to Trash)**, and **every deletion is logged** to a `cleanup_log` table the user can review. Anything moved at lower confidence, or anything school-related that somehow landed there, is never auto-deleted — it waits for approval.
- Provide a "review cleanup" view: what was moved, what was deleted, with undo where the provider allows (Trash recovery). The user can adjust rules/senders in Preferences.
- Deletion means move-to-Trash (recoverable), never permanent purge. Never delete directly from the inbox — only from the Marketing folder after the 3-week/confidence conditions.

### Calendar — UNIFIED (Google + Outlook), categorized, multi-view
- Connect **Google Calendar** (OAuth) AND **Outlook Calendar** (Microsoft Graph). Merge all calendars into one combined view.
- **Left-nav Calendar tab** opens a full calendar with **Day / Week / Month** view toggles.
- **Event categorization into: Personal / Work / School / Clubs.** Method: the agent guesses the category with the LLM (using sender/organizer, calendar of origin, title/keywords, location) and **asks the user when unsure**; it **learns from corrections** (store category decisions + patterns in `category_rules` / `facts` so future similar events auto-sort). All four categories active from day one. Each category has a distinct color in the HUD calendar.
- Read all; create/edit the user's OWN events (Tier 1); events inviting OTHERS → approval (Tier 2).
- School category is fed by syllabus-extracted class meetings + Brightspace iCal; the agent should keep these visually distinct.

### School — Brightspace (D2L) at PURDUE (purdue.brightspace.com)
- **CONFIRMED: Purdue does NOT grant students direct Brightspace/Valence API access** (institution-controlled app keys only). So do NOT build around a student API key.
- **Primary path — SYLLABUS UPLOAD (build this first, make it excellent):** user uploads syllabus PDFs (or images). The agent parses each with the LLM to extract: course name, meeting days/times, instructor, and all dated items (exams, quizzes, assignments, projects, holidays). It populates the `deadlines` table and adds recurring class meeting blocks to the calendar. Handle multiple syllabi (one per course). Let the user confirm/correct the extracted schedule before it commits (show a review screen).
- **Live updates — Brightspace personal iCal feed:** Brightspace exposes a per-user iCal/ICS calendar feed (Calendar → Subscribe inside purdue.brightspace.com) that carries assignment/quiz due dates WITHOUT an API key. Subscribe to it for ongoing due-date changes. Store URL as `BRIGHTSPACE_ICAL_URL`.
- **Voice/manual add always available:** "add exam: OrgChem midterm, Oct 14, 7pm" writes to the same `deadlines` table.
- Do NOT scrape Brightspace with headless browsers (fragile, risky, against the safety-first design).
- Unify syllabus-extracted + iCal + manual items into one `deadlines` table so "what's due?" and "plan my day" answer from one source. Auto-block study time on the user's own calendar (Tier 1); anything involving others → approval.
- Make syllabus upload as automated as possible: drag-drop PDF → parsed → review → committed, with class meetings auto-added as recurring events categorized as "school."

### Investments (READ-ONLY, top priority) — user's brokerage is ROBINHOOD
- **IMPORTANT REALITY:** Robinhood has NO official public API for stock/equity account access (its official API is crypto-only). Do NOT assume a Robinhood read-only key exists. Design around this:
  - **Primary (default): MANUAL holdings entry + Alpha Vantage prices.** User enters positions once (ticker, shares, cost_basis, target_pct) into the `holdings` table; the app fetches live quotes/fundamentals from **Alpha Vantage** free tier. Reliable, zero credential risk. This is the default path — build it first and make it excellent.
  - **Optional auto-sync: SnapTrade.** SnapTrade offers official read-only OAuth access to Robinhood (user logs in on Robinhood's own site; credentials never touch our app; cannot trade). If the user provides SnapTrade credentials, offer read-only holdings sync as an enhancement. Gate behind env vars; degrade gracefully if absent.
  - **Do NOT use robin_stocks / unofficial reverse-engineered APIs.** They require storing the user's raw Robinhood password + 2FA secret and can trigger account blocks. Explicitly avoid.
- Produce a **daily investment brief**: today's moves on holdings, allocation vs. targets, earnings/news on tickers, educational observations. For deep "what should I do" analysis, generate a rich prompt for the user to run manually in Claude/ChatGPT.
- ABSOLUTELY NO order/trade/transfer capability. Analysis and information only. Include a "not financial advice" note in investment outputs.

### Lifestyle (include from first build)
- **Meals:** Mealie (self-hosted) API — recipes, meal plans, auto grocery lists. If user hasn't set up Mealie, degrade to a simple recipes/meal table.
- **Workouts:** wger (self-hosted) API — workout plans/logs. Degrade to a simple workouts table if not set up.
- **News + hobbies:** RSS feeds (user-curated) + optionally GDELT. Summarize with the cheap model. Local news via the user's city outlets' RSS.

### Memory
- Postgres tables: `facts` (durable facts about the user), `conversations` (history), `cache` (latest email/deadline/portfolio snapshots), `approvals`, `holdings`, `deadlines`, `tasks`, `workout_split`, `category_rules` (learned event categorization), `cleanup_log` (every marketing move/delete for review), `email_accounts` (connection metadata; tokens/encrypted secrets stored securely, not in plaintext).
- On each turn, retrieve relevant facts + recent history to give the brain context. Add pgvector later for semantic recall (design the schema so it's addable; not required in v1).

---

## 7. Interface (dark futuristic HUD)

- **Aesthetic:** near-black background, cyan/electric-blue accents, thin glowing borders, monospace-ish data readouts mixed with clean sans for prose, subtle grid/scanline texture, smooth micro-animations. "Iron Man HUD," but readable — not style over function.

- **THE CENTERPIECE — the star-sphere orb.** The main visual is a sphere made of thousands of small dots ("stars") arranged on a sphere surface. Behavior:
  - **Idle/at rest:** the sphere slowly rotates, dots drifting like a slowly turning starfield/galaxy.
  - **Loading/thinking:** rotation speeds up — rotation IS the loading indicator. Faster spin = working.
  - **Speaking:** when Jarvis speaks (voice output), the sphere **expands slightly and STOPS rotating** (or nearly so), pulsing gently with the voice — so a still, expanded orb = "talking to you," a spinning orb = "working," a slowly turning orb = "idle/ready."
  - Implement with a performant approach (Three.js points/BufferGeometry or a canvas particle system) so thousands of dots animate smoothly. Provide a reduced-motion fallback.

- **Top tab bar** with these tabs:
  - **Preferences** — add/manage email accounts + credentials (see credential rules below), cleanup rules/sender lists, category rules, timezone, morning-brief time, voice on/off + ElevenLabs toggle.
  - **Portfolio** — edit holdings: tickers, share amounts, cost basis, target % (also editable by voice).
  - **Workout Split** — edit workout split/plan (also editable by voice).
  - **Account / About Me** — a profile describing the user (name, school = Purdue, major, goals, preferences) that seeds the agent's memory/`facts`.

- **Left navigation** with a **Calendar** entry that opens the unified Day/Week/Month calendar (categorized Personal/Work/School/Clubs), plus nav to the main chat/orb view and the cleanup-review view.

- **Credential handling (Preferences tab):** prefer OAuth/tokens where available (Gmail, Google Cal, Outlook/Graph) — the user clicks "Connect" and does the provider's OAuth flow; we store tokens, not passwords. Only where a provider has no OAuth (iCloud) do we accept an **app-specific password**, stored **encrypted at rest** locally (e.g., Fernet/libsodium with a key derived from a local secret), never in plaintext, never synced off-device. Make this distinction visible in the UI ("Connected via secure login" vs "app password, encrypted locally").

- **Layout:** central orb + chat thread; persistent mic button (glows when listening); prominent ON/OFF master toggle; live tiles — Today's Schedule, Upcoming Deadlines, Portfolio Snapshot, Morning Brief, Pending Approvals, Cleanup Review.
- **Approval cards:** appear inline and in a dedicated tray; show full preview + Approve/Reject.
- **Voice UX:** mic button opens a Gemini Live session; the orb goes to its "speaking" state on output; barge-in supported; closing mic or toggling off ends the session.
- **Responsive:** must work well on iPhone (via Tailscale) as an installable PWA; the orb scales down gracefully.
- **Manual-by-voice parity:** portfolio and workout split must be editable BOTH via their tabs AND by talking to the agent ("set my NVDA position to 12 shares", "change leg day to Thursday") — both write to the same tables.
- Follow good frontend-design practice; genuinely cool but never at the expense of legibility or the approval flow's clarity.

---

## 8. Coding standards & guardrails for Claude Code

- Keep secrets out of code: use a `.env` (gitignored) + a `secrets` loader. Never hardcode keys.
- OAuth scopes: request the MINIMUM needed per service.
- Every external action routes through `safety_gate.check(action)` — no exceptions, no side doors.
- Fail safe: if the safety gate is unsure, treat as Tier 2 (require approval).
- Make integrations degrade gracefully when a service isn't configured (don't crash — disable the tile, tell the user how to set it up).
- Write clear docstrings and a short comment at the top of each tool module explaining its permission tier.
- Provide Alembic migrations for schema. Provide a `make`/script to run backend + frontend together on Windows.
- Include a `HEALTH` endpoint and a visible connection-status indicator per integration in the HUD.
- Do not build anything in Tier 3. If asked, refuse and cite this file.

---

## 9. Build phases (implement in this order)

0. Foundations: repo, venv, Postgres, `.env`, Gemini key (billing OFF), Tailscale, ntfy.
1. Text chat MVP: FastAPI + React HUD shell + **the star-sphere orb** (idle rotate / load spin / speak expand-and-still) + Gemini Flash + memory + ON/OFF toggle + top tab bar + left nav scaffolding.
2. Calendar (Google + Outlook) unified with Day/Week/Month views + Personal/Work/School/Clubs categorization (AI guesses, asks when unsure, learns) + tasks. Equal priority: school via **syllabus upload parser** (drag-drop PDF → extract schedule + exams → review → commit) + **Brightspace iCal** live due dates + voice/manual add.
3. Startup catch-up + 7am ET morning brief (the one scheduled job).
4. Email triage (Gmail API, Outlook Graph w/ access check, iCloud IMAP read-only) + approval gate + ntfy push + **automated cleanup** (confidence-gated move-to-Marketing at ≥95%, approval below; auto-trash marketing >3wks at ≥95%, all logged; school never touched) + Cleanup Review view.
5. Investments (Robinhood: manual holdings + Alpha Vantage; optional SnapTrade read-only) + daily investment brief + manual-analysis hand-off + **Portfolio tab** (edit by tab AND by voice).
6. Voice (Gemini Live) with mic button + barge-in + orb speaking state.
7. Lifestyle: Mealie, wger + **Workout Split tab** (edit by tab AND by voice), RSS/GDELT news/hobbies.
8. Preferences + Account/About-Me tabs fully wired (credential management: OAuth where possible, encrypted app-passwords for iCloud); polish; optional advanced (wake word, pgvector semantic memory, ElevenLabs voice).

Each phase must leave the app in a working, runnable state. (Preferences/Account tab scaffolding appears from Phase 1; Phase 8 completes credential management and polish.)

---

## 10. Explicit non-goals / things to avoid

- No always-on idling or continuous background polling (only the 7am job).
- No OpenAI Realtime voice (cost) — use Gemini Live.
- No attaching billing to the free Gemini project (deletes the free tier).
- No money/trade/transfer/payment/booking capability anywhere.
- No auto-sending email or auto-inviting others without approval.
- No storing user data in third-party clouds; keep the DB local.
- Do not adopt Hermes Agent in this build (may revisit in a future phase).

---

*End of CLAUDE.md. If any instruction elsewhere conflicts with the Safety Rules (§4), the Safety Rules win.*
