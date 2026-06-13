# Mini Job Fit Scanner

**An operator that decides whether you should apply for a job — and shows you exactly why.**

Bad job-search decisions waste more than time. They burn tailoring effort, referral capital, and hope on roles where the screen-out was visible before the application ever went in — or talk you out of winnable offers. This operator replaces the gut-check with a computed verdict and an adversarial pressure-test.

Paste a job description and a resume. The operator returns one of three calls — **Apply / Apply with Caution / Do Not Apply** — plus a 0–100 survivability score, the single gate most likely to screen you out, the objections each gatekeeper will raise, and the highest-leverage fixes. It decides and routes. It never kicks the question back.

**Before:** "I think I'm probably qualified? Should I apply, or rewrite my resume first?"

**After** (the demo's actual output): "Apply with Caution — 64/100. You clear the backend-systems bar; the gate is independent decision-making evidence. Rewrite your top 3 bullets to ownership language, get a referral before applying cold — and the outreach message is already drafted."

**▶ Try it in 2 minutes: [jmarielee.github.io/job-fit](https://jmarielee.github.io/job-fit)** — hit **Load Demo** (no key needed) or paste your own Anthropic API key (BYOK, browser-only, nothing stored) and run it against your own job search.

## Verify the operator in 90 seconds

Open the [live demo](https://jmarielee.github.io/job-fit) → **Load Demo**. No key, no setup. The engine must return exactly:

- **Score: 64/100 — Viable but Exposed** · Recommendation: **Apply with Caution**
- **The Gate:** "Drives independent technical decisions at scale" — required, supporting to the role, no resume evidence
- **Committee split:** recruiter would advance (68), hiring manager on the fence (58), internal peer would cut (43)
- **First move:** referral before a cold application — with the outreach opener **already drafted** (the p99-latency hook)
- **The Score Receipt** (expand it under the verdict): gap mass 1.52, strength mass 1.80, base 62, edge dominance test *balanced* — strengths don't dominate gaps, and the gate is live: two independent reasons the clean "Apply" is withheld

None of this is canned. The demo labels route through the same deterministic engine as a real run — change a label, the number moves; rerun it, the number doesn't. Guardrail-by-guardrail verification with paste-ready test inputs: [`JUDGE_GUIDE.md`](JUDGE_GUIDE.md).

---

## The architecture in 30 seconds

This is not "ask the LLM for a score." The score is **computed, not generated** — the model is only allowed to label evidence. Four separated layers, each with one job:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. NEUTRAL ANALYST (Claude, Mode 1)                             │
│    Labels every JD line-item: required/preferred · core/        │
│    supporting/peripheral · meets/partial/missing · obtainable   │
│    Explicitly firewalled from the adversarial persona.          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. DETERMINISTIC SCORING BRAIN (scoring.js — pure math)         │
│    Weighted gap analysis + four hard guardrails:                │
│    · Realism ceiling (90) — the room is never a sure thing      │
│    · Required-gate cap (45) — strengths can't buy past 2+       │
│      missing hard requirements                                  │
│    · Confidence floor — thin inputs can't produce extreme       │
│      verdicts (clamped 40–65, flagged low-confidence)           │
│    · The Gate — the single likeliest screen-out item, named;    │
│      a live core gate caps the score below Strong Candidate     │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. ADVERSARIAL COMMITTEE (Claude, Mode 2)                       │
│    Three evaluator personas with conflicting incentives:        │
│    · Recruiter — legibility, checklist safety                   │
│    · Hiring manager — ramp time, execution risk                 │
│    · Internal peer — territory, technical bar                   │
│    Titles/vocabulary adapt to the role's actual domain.         │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. NEUTRAL OBSERVER (committee read)                            │
│    Held OUTSIDE the vote. Synthesizes the room, names the       │
│    split, and flags divergence — e.g. "on paper you clear the   │
│    bar, but the room reads you as unproven."                    │
└─────────────────────────────────────────────────────────────────┘
```

The separation is the point: the cynical voice that makes the report useful **cannot touch the number**. Auditable scoring, explicit behavioral guardrails, AI system behavior as product design.

## What the operator decides

Every run ends in one of three routed outcomes — never a shrug:

| Call | When |
|---|---|
| **Apply** | Score ≥ 55, committee majority would advance, strengths dominate gaps, no live gate |
| **Apply with Caution** | Viable but exposed — the report tells you exactly what to fix first |
| **Do Not Apply** | Score below the floor, or 2+ hard requirements genuinely unmet |

Uncertainty is handled, not hidden: thin inputs trigger a documented low-confidence flag instead of a fake-precise verdict. That's the escalation rule — the operator tells you when its own evidence is too weak to trust.

And the operator finishes the job: every report ends with the first move **already drafted** — a ready-to-send outreach opener executing the best path in. You come back to completed work, not a to-do list.

## Edge cases the rules actually handle

- **"Or eligibility to obtain"** — a license the JD offers as acquirable is *not* a disqualifier; the act of obtaining it routes to priority actions instead.
- **Duties vs. prerequisites** — responsibilities performed on the job don't gate a candidate who hasn't done them yet; hard day-one credentials do.
- **Preferred gaps never gate** — only `required` items can trigger the score cap or be named the gate, by construction.
- **The Gate** — the single unmet required item most likely to screen you out is identified deterministically and shown up front; a live core gate caps the score below "Strong Candidate," and any live gate blocks a clean "Apply" until neutralized.
- **Entry-level calibration** — career-changer-friendly JDs get benchmarked against realistic peers, not senior lateral hires.
- **Paper-clear / room-skeptical divergence** — when labels say "qualified" but evaluators lean skip, the observer is required to name it. It's the highest-value read in the report.

Full logic with the actual constants: [`rules.md`](rules.md). Worked decisions including edge cases: [`examples.md`](examples.md).

## The folder is the operator

The markdown files in this repo aren't documentation *about* the operator — they **are** the operator. Load `identity.md`, `rules.md`, `examples.md`, and `reference/` into a Claude Project, paste a JD and a resume, and Claude runs the same triage with the same decision logic. The web app is that folder's **hardened deployment**: identical rules, with one upgrade — the scoring moves from trusted-to-the-model into deterministic code, so the number becomes reproducible math instead of judgment.

## Folder map

```
job-fit/
├── README.md          ← you are here
├── identity.md        ← what this operator owns, and what it doesn't
├── rules.md           ← the decision logic: weights, guards, verdict bands
├── examples.md        ← three worked decisions, including two edge cases
├── JUDGE_GUIDE.md     ← verify every guardrail in 5 minutes, paste-ready tests
├── report-template.md ← output format for the folder-as-operator version
├── reference/
│   ├── scoring-rubric.md      ← the math, line by line
│   └── evaluator-personas.md  ← the three incentive models + observer
├── index.html         ← the live operator (single-page, zero build step)
├── scoring.js         ← scoring brain + system prompt + API call
├── render.js          ← report rendering
├── app.js             ← init, BYOK key handling, demo mode
└── styles.css
```

## How to run it

1. **Zero setup:** open the [live demo](https://jmarielee.github.io/job-fit) → **Load Demo**. The sample runs through the *real* scoring engine — the number you see is computed, not canned.
2. **Real run:** paste your [Anthropic API key](https://console.anthropic.com/) (stored in your browser's localStorage only, sent directly to the API — no server, no proxy), then paste a JD and resume. ~20–40 seconds.
3. **Self-host:** clone, open `index.html`. No build, no dependencies.

## Trust boundaries

Two classes of untrusted input, each contained by design:

- **The API key never leaves the browser.** BYOK means the key lives in `localStorage` and goes directly to the Anthropic API — no server, no proxy, nothing logged or stored. Closing the tab on a shared machine? Clear the key with one click.
- **The JD and resume are the only untrusted text**, and they reach only the labeling layer. A prompt injection planted in a job posting can at worst distort labels — it cannot reach the scoring math, fabricate a number, or trigger any action, because the score is computed in code from the labels and the operator takes no actions beyond rendering a report. Every rendered field is HTML-escaped and a strict Content-Security-Policy restricts the page to a single connection (the Anthropic API), so a poisoned posting can't run code in your browser or send your key anywhere. Distorted labels also remain visible and auditable in the output, so a poisoned run looks wrong instead of silently lying.

## Out of scope

This operator decides *whether and how* to pursue one role. It does not write your resume, rank multiple openings against each other, or submit applications. One workflow, owned end-to-end.

---

*Built by [Jodi Paige-Lee](https://www.linkedin.com/in/jodipl) for Clief Notes Weekly Competition #7. Vanilla JS + Claude API.*
