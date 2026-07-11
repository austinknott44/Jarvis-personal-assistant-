# WALKTHROUGH.md — Building & Using Jarvis, Step by Step

> This is the deep, do-this-exactly guide. It assumes you're on **Windows (PC + laptop) with an iPhone**, and that you'll use **Claude Code** to generate most of the code. Where you need to click around in a website (Google Cloud, Apple ID, your school portal), I spell it out. Where Claude Code does the work, I give you the exact thing to ask it.
>
> Work through it in order. Every phase ends with a **"you should now be able to…"** check. Don't move on until that passes. It's completely fine to stop after Phase 3 — you'll already have a genuinely useful assistant.

---

## How to use these three files together

- **CLAUDE.md** sits in your project folder. Claude Code reads it automatically and follows it.
- **BUILD_GUIDE.md** is your reference for "what is this piece / where does it live."
- **WALKTHROUGH.md** (this) is the ordered steps.

Your basic rhythm for each phase: open Claude Code in the project folder, tell it which phase to build and to follow CLAUDE.md, let it generate, then run the "done" check here.

---

# PART A — ONE-TIME FOUNDATIONS (Phase 0)

Do these once. Budget one relaxed evening.

## A1. Install the basics on your laptop

1. **Python 3.11+** — download from python.org, run installer, and **check "Add Python to PATH"** on the first screen. Verify in PowerShell:
   ```powershell
   python --version
   ```
2. **Node.js (LTS)** — download from nodejs.org, install. Verify:
   ```powershell
   node --version
   npm --version
   ```
3. **Git** — download from git-scm.com, install with defaults. Verify:
   ```powershell
   git --version
   ```
4. **Docker Desktop** — download from docker.com, install, launch it once so it's running. (This runs Postgres for you without manual database setup.)
5. **VS Code** — download from code.visualstudio.com. This is where you'll run Claude Code.
6. **Claude Code** — install per Anthropic's current instructions (search "install Claude Code" on docs.claude.com). It runs in the VS Code terminal or your terminal. Sign in with your Claude Pro account.

## A2. Create the project folder

```powershell
cd ~\Documents
mkdir jarvis-assistant
cd jarvis-assistant
git init
```
Now copy the three files (CLAUDE.md, BUILD_GUIDE.md, WALKTHROUGH.md) into this folder.

## A3. Get your FREE Gemini key (the brain + voice)

> This is the money-saving heart of the project. Follow the billing rule exactly.

1. Go to **aistudio.google.com** and sign in with a Google account.
2. Click **Get API key** → **Create API key**. If asked to pick/create a Google Cloud project, create a new one named e.g. `jarvis-free`.
3. **Do NOT enable billing on this project. Ever.** Leaving billing off is what keeps Gemini free. (If you later want paid voice, you'll make a *different* project — never touch this one's billing.)
4. Copy the key somewhere safe for a moment — you'll paste it into `.env` shortly.

## A4. Set up push notifications (ntfy — free, no account)

1. On your **iPhone**, install the **ntfy** app from the App Store.
2. Pick a **private topic name** no one could guess, e.g. `jarvis-approvals-7fq2z9`.
3. In the app, subscribe to that topic.
4. Test it: on your laptop, open PowerShell and run
   ```powershell
   curl -d "hello from jarvis" ntfy.sh/jarvis-approvals-7fq2z9
   ```
   You should get a push on your phone. That topic goes in `.env` as `NTFY_TOPIC`.

## A5. Set up Tailscale (private phone access)

1. Make a free account at **tailscale.com**.
2. Install Tailscale on your **laptop** and your **iPhone**, sign into both with the same account.
3. That's it for now — later you'll open your laptop's Tailscale name in Safari to use Jarvis from your phone.

## A6. Create your `.env`

1. Ask Claude Code: *"Create `.env.example` and `.gitignore` per BUILD_GUIDE.md, and a starter `.env` I'll fill in. Make sure `.env` is gitignored. Also generate a random `ENCRYPTION_KEY` value for me and put it in `.env` — this encrypts my iCloud app-password at rest."*
2. Open `.env` and paste your `GEMINI_API_KEY` and `NTFY_TOPIC`. Confirm `ENCRYPTION_KEY` is filled. Leave the rest blank for now — you'll fill each as you reach its phase (or later, from the Preferences tab).

**✅ You should now be able to:** run `python --version`, `node --version`, `docker --version`, get a test push on your phone, and have a project folder with the three docs + a `.env`.

---

# PART B — THE CORE BUILD

## Phase 1 — Text chat MVP (one weekend)

**Goal:** type to Jarvis in a dark HUD, it remembers you, and the ON/OFF toggle works.

1. Start Postgres:
   ```powershell
   docker compose up -d
   ```
   (If `docker-compose.yml` doesn't exist yet, ask Claude Code: *"Create docker-compose.yml running Postgres per BUILD_GUIDE.md, with the credentials matching DATABASE_URL in .env."*)

2. Ask Claude Code to build Phase 1:
   > *"Build Phase 1 from CLAUDE.md: a FastAPI backend and a React (Vite+TypeScript+Tailwind) frontend in a dark futuristic Iron-Man-HUD style. The centerpiece is a STAR-SPHERE ORB — thousands of dots arranged on a sphere (use Three.js points/BufferGeometry). Idle = slow rotation like a turning starfield; thinking/loading = faster rotation; speaking = the sphere expands slightly and stops rotating, pulsing gently. Include the chat thread, the ON/OFF master toggle, a top tab bar (Preferences, Portfolio, Workout Split, Account) and a left nav (Home/orb, Calendar, Cleanup Review) — scaffold the tabs now, fill them in later phases. Wire Gemini Flash for text chat using GEMINI_API_KEY. Set up Postgres models and Alembic migrations for `facts` and `conversations`, and make Jarvis load recent history + facts each turn so it remembers me across restarts. Give me scripts/run-dev.ps1 to start both. Include a reduced-motion fallback for the orb. Follow the safety and style rules in CLAUDE.md."*

3. Run it:
   ```powershell
   ./scripts/run-dev.ps1
   ```
   Open the local URL it prints (usually http://localhost:5173).

4. Test memory: tell Jarvis a fact ("my name is Austin, I study at [school]"), stop and restart the app, ask "what's my name?" — it should remember.

5. Test the toggle: flip OFF — confirm it stops responding / no calls; flip ON — it resumes.

**✅ You should now be able to:** hold a typed conversation with Jarvis in a cool dark HUD, have it remember facts across restarts, and turn it on/off.

---

## Phase 2 — Unified Calendar + School (syllabus + Brightspace) + Tasks

**Goal:** a combined Google+Outlook calendar (Day/Week/Month, categorized), your class schedule + exams pulled from uploaded syllabi, live due dates from Brightspace, and "what's due this week / block 2 hours for bio / add exam" all working by voice or text.

### B2.1 Google Calendar
1. Go to **console.cloud.google.com** → same `jarvis-free` project → **APIs & Services** → **Enable APIs** → enable **Google Calendar API** (and **Gmail API** now too, for Phase 4).
2. **APIs & Services → OAuth consent screen** → set it up as **External**, add yourself as a **test user** (your Gmail). This avoids the app-verification hassle for personal use.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Desktop app.** Download the client ID + secret → put into `.env` (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` — same Google project covers Calendar + Gmail).

### B2.2 Outlook Calendar (.edu) — check access FIRST
1. Try registering an app at **entra.microsoft.com** (Azure) → **App registrations → New registration**. Use `MS_CLIENT_ID`/`MS_CLIENT_SECRET` from there.
2. **Reality check:** many universities block student-registered apps or third-party OAuth access to `.edu` accounts. If registration is disabled or consent is blocked, that's your school's policy — note it and let this integration stay disabled or read-only. Jarvis is built to degrade gracefully.

### B2.3 School at Purdue — syllabus upload + Brightspace iCal
> **Confirmed:** Purdue does **not** give students Brightspace/Valence API access. So your reliable, automated path is **syllabus upload + the Brightspace iCal feed** — no API key, nothing to request from Purdue IT.

1. **Brightspace iCal (live due dates):** log into **purdue.brightspace.com** → **Calendar** → **Subscribe** (or "Access existing calendar") → copy the personal **iCal/ICS URL**. Put it in `.env` as `BRIGHTSPACE_ICAL_URL`. This carries your assignment/quiz due dates automatically, no key needed.
2. **Syllabus upload (class schedule + exams):** you'll drop each course's syllabus PDF into Jarvis and it extracts the meeting times and dated items — built in B2.4. Have your syllabus PDFs handy.
3. **How to tell if you have API access (short answer: you don't, and that's fine):** Purdue routes Brightspace through your Career Account login and controls API keys at the institution level; students can't self-register a Valence app. You never need to check — the syllabus + iCal combo covers you fully. (Don't use browser-scraping tools; they're fragile and against this project's safety design.)

### B2.4 Build it
Ask Claude Code:
> *"Build Phase 2 from CLAUDE.md: (1) A unified calendar merging Google Calendar and Outlook (Microsoft Graph), with a left-nav Calendar view supporting Day/Week/Month. Categorize every event as Personal/Work/School/Clubs — guess with the LLM using organizer/calendar-of-origin/title/location, ASK me when unsure, and LEARN from my corrections (store in `category_rules`). Color-code categories. (2) A syllabus-upload tool: I drag-drop syllabus PDFs, you parse each with the LLM to extract course name, meeting days/times, instructor, and all dated items (exams, quizzes, assignments), show me a REVIEW screen to confirm/edit, then commit — adding class meetings as recurring 'school' calendar events and dated items to a unified `deadlines` table. (3) A Brightspace tool that subscribes to my BRIGHTSPACE_ICAL_URL for live due dates into the same `deadlines` table. (4) A `tasks` table. Safety gate: reads + edits to MY OWN calendar/tasks auto-allowed; events inviting others require approval. Support voice/manual add like 'add exam: OrgChem midterm Oct 14 7pm'. Add HUD tiles for Today's Schedule and Upcoming Deadlines. Do NOT build Brightspace API/scraping — Purdue students don't get API access. Follow CLAUDE.md safety rules."*

The first time you use a Google tool, it'll open a browser to authorize — approve it; the token is stored locally.

**✅ You should now be able to:** open the Calendar tab and see all your Google + Outlook events merged in Day/Week/Month, color-coded Personal/Work/School/Clubs (and get asked when it's unsure); upload a syllabus PDF and watch it extract your class schedule + exams into a review screen; ask "what's my schedule today," "what's due this week," "add a study block for biology tomorrow at 6," and "add exam: chem midterm Oct 14."

---

## Phase 3 — Startup catch-up + the 7 AM brief

**Goal:** turning Jarvis on greets you with what changed; a single 7 AM ET brief runs even when off.

Ask Claude Code:
> *"Build Phase 3 from CLAUDE.md: a startup catch-up routine that refreshes calendar + deadlines (and later email/portfolio) when I toggle ON and greets me with what changed, plus a single scheduled job at 7:00 AM America/New_York that runs a read-only 'morning brief' even when the agent is off, stores it, sends ONE ntfy push, and is token-efficient. Add a Morning Brief HUD tile. This 7am job must be the ONLY unattended activity."*

Test: change your system clock or temporarily set the schedule to two minutes from now to confirm the brief generates and pushes once, then set it back to 7 AM.

**✅ You should now be able to:** flip Jarvis on and hear/see "welcome back, here's what changed," and get one morning-brief push at 7 AM.

---

## Phase 4 — Email across your 3 accounts

**Goal:** unified inbox summary, "which emails need replies," drafting — with every send asking your approval via phone or app.

### B4.1 Gmail
Already enabled in B2.1. No extra steps — the tool uses the same Google OAuth.

### B4.2 .edu Outlook (Microsoft Graph)
- Use the app registration from B2.2 if it worked. If your school blocked it, skip send and keep this account read-only or disabled. **This is the one integration that may be out of your control — that's expected.**

### B4.3 iCloud Mail (read-only)
1. Go to **appleid.apple.com** → **Sign-In and Security** → **App-Specific Passwords** → generate one named "Jarvis."
2. Put your iCloud address + that password in `.env` (`ICLOUD_EMAIL`, `ICLOUD_APP_PASSWORD`). iCloud stays **read-only** in this build.

### B4.4 Build it
Ask Claude Code:
> *"Build Phase 4 from CLAUDE.md: email tools for Gmail (API, read + compose + modify), Outlook via Microsoft Graph (read + compose, degrade to read-only if the Purdue tenant blocks access), and iCloud via IMAP (READ-ONLY). Unify all three into one inbox view tagged by account, with a 'needs reply' ranking. Drafting allowed; SENDING any email goes through the safety gate — approval with full preview + ntfy push, send only after I approve. Flag deadline-looking emails for my confirmation (don't auto-add). THEN build automated cleanup: classify inbox mail as marketing/promotional/spam using content signals (coupon, deal, sale, % off, 'limited time', 'shop now', no-reply/bulk senders, unsubscribe footers), MODERATE aggressiveness. NEVER touch anything from purdue.edu, professors, Brightspace, or course-related. If ≥95% confident it's marketing AND not school AND unexpected → auto-move to a `Jarvis/Marketing` folder (log it). If below 95% → don't move; surface for approval. Auto-move items in `Jarvis/Marketing` older than 3 weeks that were moved at ≥95% to Trash (recoverable), logging every deletion to a `cleanup_log`. Build a Cleanup Review view showing what was moved/deleted with undo where possible. Never delete directly from the inbox and never permanently purge. Add Inbox, Pending Approvals, and Cleanup Review HUD tiles. Follow CLAUDE.md safety rules."*

Test: ask Jarvis to draft a reply and "send it" — confirm it does NOT send until you approve, and that approving from either the phone push or the app works.

**✅ You should now be able to:** "summarize my email," "what needs a reply," "draft a reply to Professor X" (send stays gated), and watch Jarvis quietly move obvious marketing into a `Jarvis/Marketing` folder — asking you first whenever it's less than 95% sure, auto-clearing that folder after 3 weeks, logging everything in Cleanup Review, and never touching your Purdue mail.

---

## Phase 5 — Investments (read-only, your priority)

**Goal:** a daily investment brief and portfolio tile; deep "what should I do" analysis handed to Claude/ChatGPT; zero trading ability.

### B5.1 Data sources — note: you use Robinhood
> Robinhood has **no official public API** for stock accounts (its official API is crypto-only), so there's no clean read-only key to generate. You have two good paths; start with the first.

1. **Default — manual holdings + free prices (recommended):**
   - Get a free key at **alphavantage.co** → `ALPHAVANTAGE_API_KEY`.
   - You'll enter your positions into Jarvis once (ticker, shares, cost basis, target %). Alpha Vantage supplies live prices. Update your holdings when you actually trade — a couple minutes a week. Zero credential risk; never touches your Robinhood login.
2. **Optional auto-sync — SnapTrade (official read-only OAuth):**
   - SnapTrade connects to Robinhood with **read-only** access — you log in on Robinhood's own site, your credentials are never shared with the app, and it **cannot place trades**. Sign up at snaptrade.com, check their current free/developer tier, and if you want auto-sync add `SNAPTRADE_CLIENT_ID` + `SNAPTRADE_CONSUMER_KEY` to `.env`.
   - Skip this if manual entry is fine — it's purely a convenience upgrade.
3. **Do NOT use `robin_stocks` or other unofficial wrappers.** They need your raw Robinhood password + 2FA secret stored locally and can get your account blocked. Not worth it for this build.

### B5.2 Build it
Ask Claude Code:
> *"Build Phase 5 from CLAUDE.md: an investments tool for a Robinhood user. Since Robinhood has no official equity API, make MANUAL holdings entry + Alpha Vantage prices the default, robust path (store `holdings` with ticker, shares, cost_basis, target_pct; fetch live quotes/fundamentals from Alpha Vantage). If SnapTrade credentials are present, offer optional read-only auto-sync of Robinhood holdings; degrade gracefully if absent. Do NOT use robin_stocks or any unofficial API. Produce a daily investment brief: today's moves on my holdings, allocation vs. targets, earnings/news on tickers, educational observations. For deep 'what should I do' analysis, GENERATE A RICH PROMPT I can paste into Claude or ChatGPT — do not automate trade advice. There must be NO order/trade/transfer capability anywhere. Include a 'not financial advice' note. Add a Portfolio Snapshot HUD tile."*

**✅ You should now be able to:** ask "summarize my investments today," see a portfolio tile, get a daily investment brief, and get a ready-to-paste deep-analysis prompt — with no way for Jarvis to ever trade.

---

## Phase 6 — Voice (Gemini Live)

**Goal:** press the mic and actually talk to Jarvis — interrupt it, and have it use your tools mid-conversation.

Ask Claude Code:
> *"Build Phase 6 from CLAUDE.md: real-time voice using the Gemini Live API (GEMINI_LIVE_MODEL) over a WebSocket. Wire the mic button in the HUD to open a live speech-to-speech session with barge-in, a waveform indicator while active, and tool-calling mid-conversation (routed through the safety gate). Sessions must end when I close the mic or toggle OFF. Handle the ~15-min free-tier session cap by transparently reopening. If USE_ELEVENLABS=true, route spoken output through ElevenLabs instead. Keep everything else free by default."*

Test: press mic, say "what's on my schedule today?", interrupt it mid-sentence, then say "actually, what's due this week?" — it should handle the barge-in and answer from your tools.

**✅ You should now be able to:** have a natural spoken conversation with Jarvis that controls your real tools.

---

## Phase 7 — Meals, workouts, news, hobbies

**Goal:** the lifestyle layer, included from the start per your choice.

### B7.1 Optional self-hosted services
- **Mealie** (meals + grocery lists) and **wger** (workouts) can run via `docker compose`. Ask Claude Code to add them to `docker-compose.yml` if you want them; then create an account in each and generate an API token → `.env`.
- If you skip these, Jarvis uses simple built-in meal/workout tables instead — it degrades gracefully.

### B7.2 News/hobbies
- Put a few RSS feed URLs (your news outlets, hobby sites, local news) in `RSS_FEEDS` (comma-separated).

### B7.3 Build it
Ask Claude Code:
> *"Build Phase 7 from CLAUDE.md: a meals tool (Mealie API if configured, else a simple meal/recipe/grocery table), a workouts tool (wger API if configured, else a simple `workout_split` table), and a news/hobbies tool that pulls my RSS_FEEDS and summarizes with Gemini Flash. Build the Workout Split TAB so I can edit my split (days, focus, exercises) in the UI, AND make it editable by voice ('change leg day to Thursday', 'add Romanian deadlifts to pull day') — both write to the same `workout_split` table. Add HUD tiles for each. All degrade gracefully if not configured."*

**✅ You should now be able to:** "what should I meal prep this week," "what's my workout today," "give me my news" — see the matching tiles — and edit your workout split from its tab or just by telling Jarvis.

---

## Phase 8 — Preferences, Account, credentials & polish

First, complete the management tabs (ask Claude Code):
> *"Build Phase 8 from CLAUDE.md: finish the Preferences tab (connect/manage my 3 email accounts — Gmail + Outlook via OAuth 'Connect' buttons, iCloud via app-specific password stored ENCRYPTED at rest using ENCRYPTION_KEY/crypto.py; manage cleanup rules + sender allow/block lists; manage category rules; set timezone + morning-brief time + voice/ElevenLabs toggles) and the Account/About-Me tab (a profile — name, Purdue, major, goals, preferences — that seeds my `facts` memory). Show clearly in the UI which accounts are 'connected via secure login' vs 'app password, encrypted locally.'"*

Then pick any optional polish; all optional:
- **Phone PWA:** ask Claude Code to make the frontend an installable PWA; open your laptop's Tailscale hostname in iPhone Safari → Share → Add to Home Screen. Jarvis becomes an "app" on your phone (orb and all).
- **Wake word:** add openWakeWord (free) for "Hey Jarvis" hands-free.
- **Semantic memory:** enable pgvector for smarter recall of past conversations.
- **Premium voice:** set `USE_ELEVENLABS=true` and add your key (~$5/mo) if you want a nicer voice than the free Gemini voices.

**✅ You should now be able to:** manage everything from Preferences and Account without touching `.env`, connect email accounts securely, and (optionally) run Jarvis as a phone app with a wake word and premium voice.

---

# PART C — USING JARVIS DAY TO DAY

## Turning it on and off
- Open the app (laptop, or iPhone via Tailscale). Flip the **master toggle ON**. It greets you with what changed since last time. Flip **OFF** when done — nothing runs, nothing costs.

## Talking vs typing
- **Type** in the chat box any time. **Press the mic** to talk; interrupt freely; press again (or toggle off) to end voice. Same brain, same memory either way.

## Example things to say or type
- "What do I have due this week?" · "What should I focus on today?"
- "Add a study block for biology tomorrow at 6." · "Add exam: OrgChem midterm Oct 14 at 7pm."
- "Show my calendar this week." · "Is that club meeting personal or school?" *(it learns your answer)*
- "Summarize my email." · "What needs a reply?" · "Clean up my inbox." · "What did you move to Marketing?"
- "Summarize my investments today." · "Set my NVDA position to 12 shares." · "Give me a deep analysis prompt for my portfolio." *(then paste into Claude/ChatGPT)*
- "Change leg day to Thursday." · "What's my workout today?"
- "Plan my day around my classes and deadlines." · "What should I meal prep this week?" · "Give me my news."

## Approving actions
- When Jarvis wants to do something gated (send an email, invite someone, or move a marketing email it's less than 95% sure about), you get an **approval card in the app** and a **push on your phone** — approve from whichever you reach first. Nothing gated happens without your yes.
- Confirmed marketing (≥95%) moves to `Jarvis/Marketing` on its own and auto-clears after 3 weeks — all visible in **Cleanup Review** with undo. Your Purdue/school mail is never touched.

## What Jarvis will never do
- Spend money, move money, trade, or book/pay for anything. That ability isn't in the system.

---

# PART D — TROUBLESHOOTING

- **Gemini 429 / rate limit:** you hit the free-tier cap for the minute/day. Wait, or slow down; the code retries with backoff and falls back to text if voice is limited. Check your live limits in AI Studio.
- **"Billing" surprises:** if you ever see charges, confirm the Gemini project has billing DISABLED. If you enabled it, the free tier is gone for that project — make a fresh project and move the key.
- **Outlook/.edu won't connect:** almost always your university blocking third-party apps. Not fixable by you; keep that account read-only or disabled.
- **Brightspace / Purdue:** you don't get student API access — that's expected. Use the iCal feed for live due dates and upload syllabus PDFs for the class schedule + exams. That combo covers everything.
- **Phone can't reach the app:** confirm Tailscale is on and signed in on both devices; use the laptop's Tailscale hostname, not `localhost`.
- **Voice cuts out ~15 min:** expected on the free tier; the client reopens a session. For long talks this is normal.
- **A tool tile says "not configured":** you haven't filled that service's `.env` values yet — that's fine, fill it when you reach that phase.

---

# PART E — QUICK-START CHECKLIST

```
[ ] Phase 0: Python, Node, Git, Docker, VS Code, Claude Code installed
[ ] Free Gemini key created (billing OFF), in .env
[ ] ENCRYPTION_KEY generated (for encrypted iCloud password)
[ ] ntfy topic set + phone push tested
[ ] Tailscale on laptop + iPhone
[ ] Phase 1: type to Jarvis, star-sphere orb works, tabs scaffolded, toggle works
[ ] Phase 2: unified Google+Outlook calendar (Day/Week/Month, categorized) + syllabus upload + Brightspace iCal + tasks
[ ] Phase 3: startup catch-up + 7am brief
[ ] Phase 4: 3-account email, sends gated, auto-cleanup of marketing (school-safe)
[ ] Phase 5: Portfolio tab + investment brief + deep-analysis hand-off (Robinhood manual/SnapTrade, no trading)
[ ] Phase 6: voice conversation with barge-in + orb speaking state
[ ] Phase 7: meals, Workout Split tab (voice-editable), news, hobbies
[ ] Phase 8: Preferences + Account tabs, secure credentials; optional PWA, wake word, semantic memory, ElevenLabs
```

**Remember:** you have a useful assistant after Phase 3. Everything after is additive. Build at your own pace, verify each "✅" before moving on, and let Claude Code do the heavy lifting while CLAUDE.md keeps it honest on the safety rules.

*Caveats: free-tier limits and model IDs (e.g., the Gemini Live model name) change — verify current values in Google AI Studio. University access to .edu email and Brightspace APIs varies by institution and may be restricted regardless of these steps. The investment features are informational only and are not financial advice.*
