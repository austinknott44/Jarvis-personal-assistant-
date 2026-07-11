# SKILLS.md — capability upgrades for Jarvis, and dev-workflow skills for building it

Distinct from `SETUP_APIS.md` (data sources / keys), this is about **capability
patterns and tooling** — things that make Jarvis itself smarter, and things
that make Claude Code sessions on this repo faster and more reliable.

---

## Part 1 — capability skills for Jarvis itself

These are the "advanced" items already named in CLAUDE.md Phase 8
(wake word, semantic memory) plus one architectural idea. None are wired in
yet — this is the research pass; say the word and I'll build any of them.

### Wake word ("Hey Jarvis") — use livekit-wakeword, not openWakeWord

CLAUDE.md names openWakeWord as the free option, and it's still solid, but
**[livekit-wakeword](https://github.com/livekit/livekit-wakeword)** is a
newer, better pick: it's built on openWakeWord's approach but benchmarks
meaningfully better, and — important — it **exports standard ONNX models
that are drop-in compatible with anything expecting openWakeWord**, so
there's no lock-in either way. Training a custom "Hey Jarvis" model is a
single YAML config (synthetic data generation → augment → train → export).
Runs on-device, ~5-15ms inference, no audio ever leaves the machine, $0.
This would plug into `backend/agent/voice.py` as a lightweight always-on
listener that opens the real Gemini Live session only after the wake phrase
fires — keeping the "no idling" cost model intact.

### Semantic memory — pgvector (already the right call)

CLAUDE.md already flags this for later; confirming it's still the correct
free choice. Postgres has native vector similarity search via the
`pgvector` extension — no new service, no new cost, just an extra column on
`conversations`/`facts` (embedding vector) plus a similarity-search query
instead of (or alongside) the current recency-based `get_recent_history()`.
Embeddings themselves would come from the same free Gemini API
(`text-embedding-004` or current equivalent) — zero new keys needed. This
is what would let Jarvis answer "what did I say about my internship search
last month" instead of only ever seeing the last 20 turns.

### Package Jarvis's own complex tools using the Agent Skills pattern

This is the one genuinely new idea from this research pass. Anthropic's
**Agent Skills** format (`SKILL.md` + bundled scripts/reference docs) has
become an open, cross-agent standard in 2026 — supported natively by Claude
Code, and the pattern itself (not the literal loader) is worth stealing for
Jarvis regardless of Gemini vs Claude underneath. The core idea is
**progressive disclosure**: an agent's system prompt only ever holds a
one-line name + description per capability; the *full* how-to-do-this
instructions and any bundled scripts only get pulled into context when that
specific capability is actually invoked.

Right now every tool in `backend/tools/registry.py` puts its full
description in the Gemini system prompt on *every single turn*, which will
get expensive and noisy as more tools get added (email cleanup, syllabus
parsing, and options strategy already have fairly involved logic). The fix:
keep the registry's one-line tool descriptions as-is for the always-loaded
list Gemini sees, but for the handful of tools with real complexity (syllabus
parsing, the strategist brief, email cleanup's confidence rules), move their
detailed "how to reason about this" instructions into a small markdown file
the tool function reads and injects into its *own* prompt only when that
tool actually runs — instead of bloating every turn's system prompt. Same
progressive-disclosure benefit, adapted to a Gemini function-calling loop
instead of Claude's literal Skill loader. Worth doing once the tool count
grows past what it is now; not urgent today.

Reference: [Anthropic's Agent Skills engineering post](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) explains the progressive-disclosure mechanism in detail.

---

## Part 2 — Claude Code skills to actually use while building this repo

These are already available to me in this environment — no install needed,
just worth using more deliberately going forward:

| Skill | When to invoke it on this repo |
|---|---|
| **`/verify`** | After any nontrivial change — actually drives the running app (start servers, hit the change) instead of trusting a build pass. Already used this to catch the calendar timezone bug and the mobile chat-scroll bug. |
| **`/run`** | Fastest way to boot backend + frontend and eyeball a change in a real browser. |
| **`/code-review`** | Run before anything you consider "done" — catches correctness bugs and reuse/simplification issues at a chosen effort level. |
| **`/security-review`** | Worth running once email sending, OAuth token storage, and the encrypted iCloud password path are all live — those are exactly the surfaces this skill is built to catch. |
| **`/simplify`** | Good periodic pass once a feature has grown organically across a few sessions (the widget registry or the strategist brief would both be reasonable targets after more use). |

### Building a custom "jarvis-project" skill (worth doing)

There's a meta-skill called **Skill Creator** that builds other skills. It's
not pre-installed in Claude Code — one-time setup:
```
/plugin install skill-creator@anthropic-agent-skills
```
Once installed, I could build a project-scoped skill that encodes this
repo's specific shape: where the safety gate lives and why, how the tool
registry pattern works, the run-dev workflow, the widget-grid architecture.
The payoff: **a brand new Claude Code session with zero prior context** (a
fresh session on your laptop, or after this conversation ages out) would
load that skill automatically and ramp up in one read instead of
re-deriving the architecture from scratch. Given this project spans many
sessions across your phone and laptop, this is probably the single highest-
leverage "skill" to actually add — happy to build it next session.

---

## Priority if you only do one thing from this doc

Build the **jarvis-project Claude Code skill** first — it compounds every
session after it. The wake word and semantic memory upgrades are pure
capability additions with no urgency; do them whenever Phase 8 rolls around
per the original build plan.
