# Judge Guide — Verify the Operator in 5 Minutes

Every test below states the decision the operator **must** reach before you run it.
The scoring is deterministic code (`scoring.js`), so the guardrail assertions are
checkable facts, not vibes. The model only labels evidence; the math owns the number.

**Zero-setup path:** open the [live demo](https://jmarielee.github.io/job-fit) →
**Load Demo**. No API key needed. The sample runs through the real scoring engine —
expand the **Score Receipt** under the verdict to see the shown work (gap mass,
strength mass, base, dominance test, every guardrail's fired/not-fired status) and
confirm the score is computed, not canned. While you're there, confirm
**The Gate** card in the hero names the single likeliest screen-out item
("Drives independent technical decisions at scale" — required, supporting, missing).
That card is math-identified, not narrated.

For Tests 1–5, paste your Anthropic API key (browser-only, never stored on a server),
then paste each JD + resume pair below.

| # | Guardrail under test | Must happen |
|---|---|---|
| 0 | Engine sanity (demo) | Full report, computed score, gate card, shown work |
| 1 | Required-gate cap | Cap engages — score ≤ **45**, cap reason shown, Do Not Apply |
| 2 | Confidence floor | Low-confidence flag, score clamped **40–65** |
| 3 | "Eligibility to obtain" escape hatch | License gap does **not** disqualify; routes to actions |
| 4 | Preferred gaps never gate | Cap does **not** fire despite 3 missing preferred items |
| 5 | Observer divergence alert | Paper-clear / room-skeptical split named explicitly |

---

## Test 1 — Strengths can't buy past two missing hard requirements

A genuinely strong candidate in the wrong field. The resume is impressive; the cap
must fire anyway.

**Must happen:** the required-gate cap **engages** — the score lands at or below
**45** and the cap reason is displayed (expand "Who You're Actually Competing
Against" to see it on the gauge: "core required qualifications unmet — score capped
regardless of other strengths"). The cap is a ceiling, not a floor: with this many
core requirements missing, the base math typically lands well *under* 45 on its own —
the cap is what guarantees no amount of charisma can climb above it. **The Gate**
card must name one of the missing hard credentials. Recommendation: **Do Not Apply**.

**Paste this JD:**

```
Senior Clinical Data Manager — BioVance Therapeutics

Required qualifications:
- Must hold an active CCDM (Certified Clinical Data Manager) credential
- Minimum 7+ years of clinical trial data management experience required
- Must hold current SAS Base Programmer certification
- Bachelor's degree required

Preferred:
- Python scripting a plus
- Experience with Medidata Rave ideally

Responsibilities: oversee data cleaning and query resolution across Phase II/III
trials; coordinate with CROs; maintain audit-ready documentation.
```

**Paste this resume:**

```
Award-winning Senior Product Designer with 12 years of experience leading design
for enterprise software. Shipped design systems used by 40,000+ daily users.
Led a 6-person design team; presented quarterly to C-suite stakeholders.
Expert in Figma, prototyping, accessibility standards, and design ops.
BFA in Design. Strong Python scripting skills from personal automation projects.
Known for rigorous documentation and cross-functional coordination with
engineering and QA teams.
```

The candidate's strengths are real. The math doesn't care: two-plus core required
credentials are missing, so the cap fires. This is the rule most "rate my fit"
tools don't have — charisma can't out-vote a hard gate.

---

## Test 2 — Thin inputs can't produce extreme verdicts

**Must happen:** a **low-confidence flag** appears, and the score is clamped into
**40–65** — the operator refuses to deliver a fake-precise verdict on weak evidence,
but still delivers its best available call (it never shrugs).

**Paste this JD:**

```
Product Designer — early-stage fintech startup.

Required: 4+ years product design experience; strong portfolio; Figma required.
Preferred: fintech background a plus.

You'll own design end-to-end across mobile and web.
```

**Paste this resume:**

```
10 years of product design.
```

One line of resume is not evidence — it's a claim. The confidence floor catches it.

---

## Test 3 — "Or eligibility to obtain" is not a disqualifier

The most common false rejection in naive scoring: treating an acquirable license
as a missing hard requirement.

**Must happen:** the cap does **not** fire, and no gate card appears — an obtainable
item can never be a gate. The license requirement is satisfied via the JD's own
escape hatch, and *obtaining the license* routes to the action plan - the cover note callout, the drafted opener, or the priority actions - never to the deficit column.

**Paste this JD:**

```
Field Claims Adjuster — Great Lakes Mutual Insurance

Required:
- Valid Michigan adjuster license, OR eligibility to obtain within 90 days
  (licensing training provided during onboarding)
- 3+ years of customer-facing experience required
- Strong written communication skills required
- Valid driver's license required

Responsibilities: inspect property damage on site, document findings, draft
settlement recommendations, communicate timelines to policyholders.
```

**Paste this resume:**

```
Customer Success Lead with 6 years of client-facing experience at a regional
home-services company. Handled escalations end-to-end: on-site visits,
documentation with photos, written incident reports, and resolution timelines
communicated directly to customers. Recognized twice for clearest written case
notes in the department. Valid Michigan driver's license. No adjuster license
yet — eligible to obtain.
```

---

## Test 4 — Preferred gaps never trigger the cap

By construction, only `required` items can fire the required-gate cap — and only
`required` items can be a gate. This test misses three preferred items on purpose.

**Must happen:** no cap fires and no gate appears. The missing preferred items show
up as weighted gaps in the scoring math (visible in the shown work), but the cap
reason is absent and the score is not forced to 45.

**Paste this JD:**

```
UX Designer — HealthTech SaaS

Required:
- 5+ years UX design experience required
- Portfolio demonstrating shipped product work required
- Figma proficiency required

Preferred:
- SQL a plus
- MBA ideally
- Healthcare industry background preferred

You'll lead design for our patient-scheduling platform.
```

**Paste this resume:**

```
UX Designer with 8 years of experience shipping B2B SaaS products. Portfolio at
[link] includes three shipped platforms, including a scheduling and dispatch
system with documented 85% adoption. Daily Figma user; built and maintained the
team's component library. Led usability testing programs and translated findings
into roadmap decisions with product and engineering.
```

No SQL, no MBA, no healthcare background — and no cap. Preferred means preferred.

---

## Test 5 — The observer must name the paper/room divergence

The highest-value read in the report: when the labels say "qualified" but the
simulated room leans skeptical, the neutral observer — held outside the vote —
is required to say so explicitly.

**Expected:** the committee read names the divergence in plain language (shape:
"on paper you clear the bar, but the room reads you as unproven"). Evaluator
objections should be distinct, not three rewordings of one concern. Even at a
high score, a skeptical room means the recommendation reads **Apply with
Caution**, not a clean Apply — the committee shades the routing without vetoing
the number.

**Paste this JD:**

```
AI Interaction Designer — applied AI product team

Required:
- Demonstrated experience designing AI system behavior: persona logic, routing,
  escalation rules, or guardrails required
- Experience prototyping with LLM APIs required
- Strong written design documentation required

Preferred:
- Prior employment at an AI-first company preferred
```

**Paste this resume:**

```
Designer with hands-on AI behavioral architecture work: built a four-persona
AI system with safety guardrails and human escalation triggers for a higher-ed
client (shipped, contract signed); designed routing logic and confidence
thresholds for an agricultural insurance AI workflow (45-minute task reduced
to 5 minutes, 85% adoption). Currently building open tools on the Claude API,
including a multi-layer evaluation system with deterministic scoring and
adversarial review personas. Writing samples and system documentation available.
No employment history at an AI-first company; this work was done inside a
traditional IT services firm and independently.
```

The labels will read **meets** on every required item. The room may still hesitate
on pedigree. The observer's job is to put that tension in writing instead of
letting it hide inside a number.

---

## What the model can and can't change

The labeling layer is an LLM, so labels on genuinely ambiguous text can vary
slightly between runs. These test inputs are written to be unambiguous
("required," "must hold," "or eligibility to obtain"). What can never vary:
given the same labels, `scoring.js` produces the same number, the same caps,
the same gate, and the same recommendation — and all of it is shown work you can
recompute by hand from [`reference/scoring-rubric.md`](reference/scoring-rubric.md).
