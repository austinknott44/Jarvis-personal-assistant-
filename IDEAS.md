# IDEAS.md — where to take Jarvis next: automation + real financial value

Organized around your three goals. Everything here respects the hard rules:
**free to run, no billing, never moves/spends money, and no new background
polling** (the 7 AM brief + on-toggle catch-up stay the only unattended
work — proactive features ride those, they don't add new always-on jobs).

---

## First, an honest reframe on "make money"

No app passively makes a college student wealthy, and anything promising
that is lying to you. What an app *can* genuinely do for your finances:

1. **Stop you from losing money** — missed deadlines cost scholarships and
   GPA; forgotten subscriptions and late fees leak real cash every month.
   This is the highest-certainty financial win and it's boring on purpose.
2. **Make you a better investor over time** — not by trading for you (it
   can't and won't), but by turning the strategist desk into a *learning
   loop* so you get good before real money is at stake.
3. **Free up your time to earn** — the biggest wealth lever at 20 isn't a
   stock pick, it's landing the internship / scholarship / campus job.
   Automating the busywork buys you the hours to chase those.

The features below are ranked by *real* value against that reality, not by
how exciting they sound.

---

## Tier A — build these first (highest real value, all free, all fit the rules)

### 1. Money Radar — subscriptions, bills & receipts from your email
Jarvis already reads all three inboxes. Have it classify receipt / bill /
subscription-confirmation emails and build a running picture:
- **Recurring charges** you may have forgotten (that $12 free-trial that
  started charging, the duplicate music sub) → the #1 way this app saves
  you real money every month.
- **Bills with due dates** → remind before the late fee, not after.
- **Spending awareness** — a simple monthly "here's what left your accounts
  by category, from receipts" without ever touching a bank login.

Why it's the top pick: pure read + flag (Tier 1 safe), reuses the email
integration you're already setting up, needs no new API or key, and saves
actual dollars. New `spending` table + an email classifier alongside the
existing marketing one.

### 2. Options Paper-Trading Journal — learn to trade without risking a cent
The strategist desk gives ideas; right now nothing tracks whether they'd
have *worked*. Add a journal that logs each idea (ticker, structure,
strikes, entry price, thesis) and, using the free quote data you already
pull, scores how it actually played out over time. You build a real track
record and learn options pricing/risk with $0 at stake — the only
responsible on-ramp to eventually doing it for real. Directly serves "make
money" in the one way that isn't a fantasy. New `paper_trades` table +
a scoring pass on the daily job.

### 3. Opportunity Radar — scholarships, internships, campus jobs, deadlines
For a Purdue sophomore this is a bigger wealth lever than any stock. Point
it at scholarship-listing RSS/pages, Purdue's job board, and internship
feeds; have it surface fresh matches and their deadlines into the same
`deadlines` table you already answer "what's due" from. Free (RSS +
the LLM you already run). New `opportunities` source feeding existing tables.

### 4. Proactive Day Planner
You can already auto-block study time; make it *proactive*. When the morning
brief runs, have Jarvis draft a full day plan — classes, work-backward study
blocks sized to upcoming deadlines, workout, meals — and push it. One plan,
once a day, on the job that already exists. Turns Jarvis from "answers when
asked" into "hands you the day." No new polling.

---

## Tier B — strong adds once Tier A is in

### 5. Semantic memory (pgvector) — the multiplier
Already in `SKILLS.md`. Makes every other feature smarter ("what did I
decide about my Roth last month"). Free, no new key (embeddings via the
Gemini API you already use). Build this before the app accumulates a lot of
history you can't search.

### 6. Package & delivery tracking
Parse shipping-confirmation emails, surface a "what's arriving" tile. Small,
genuinely convenient, pure read. Free.

### 7. Auto-drafted replies
You can draft on request today; make it *proactively* draft replies to the
"needs reply" emails so your morning is "approve / edit / skip" instead of
"write from scratch." Sending still hits the approval gate — unchanged
safety. Big daily time-saver.

### 8. Habit & routine tracker
Workout streaks, water, meds, sleep-you-log-manually. Cheap to add (a
`habits` table + a tile), and habit consistency is quietly one of the
highest-ROI life systems. Free.

---

## Tier C — nice, but later or with caveats

- **Grocery automation** — meal plan → auto grocery list already half-exists
  via Mealie; finish the loop. Free.
- **Budget goals / savings tracker** — manual-entry net-worth + savings-goal
  progress (no bank link). Pairs with Money Radar. Free.
- **Voice second-brain** — talk a thought, Jarvis files it as a searchable
  note (needs semantic memory first). Free.
- **Bank sync (Plaid)** — *the* honest gap. Real automated spending tracking
  wants Plaid, but Plaid needs billing + storing bank credentials-adjacent
  tokens, which cuts against this project's no-billing / safety-first rules.
  My recommendation: **stay with the email-receipt approach** (Tier A #1) —
  90% of the value, none of the risk or cost. Revisit only if you decide the
  tradeoff is worth it, and we'd sandbox it hard.

---

## What I'd actually build next, in order

1. **Money Radar** (#1) — real dollars saved, safe, reuses email. Start here.
2. **Paper-Trading Journal** (#2) — the honest path to the trading goal.
3. **Proactive Day Planner** (#4) — biggest "automate my life" feel per hour.
4. **Semantic memory** (#5) — do it before history piles up.

Opportunity Radar and the rest slot in after. None of this needs a paid
service; all of it fits the safety gate and the single-scheduled-job rule.

*Everything here is a proposal — nothing is wired in yet. Point at one and
I'll build it.*
