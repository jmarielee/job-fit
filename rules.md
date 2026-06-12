# Rules — The Decision Logic

This is the heart of the operator. Every rule below is enforced in code (`scoring.js`) or in the system prompt's labeling instructions — none of it is "use good judgment."

## Division of labor: the model labels, the math decides

The LLM's only scoring-relevant output is a set of labels on JD line-items and candidate strengths. The number, verdict, and recommendation are computed deterministically from those labels. Identical labels always produce an identical score. This makes the verdict auditable and immune to the adversarial persona's mood.

## 1. Labeling rules (Mode 1 — neutral analyst)

Each JD line-item gets four labels:

**tier** — from the JD's own words, not interpretation:
- `required`: "required", "must have", "minimum", "X+ years"
- `preferred`: "preferred", "strongly preferred", "a plus", "nice to have", "ideally". *Strongly preferred is still preferred.* Ambiguous → preferred.

**centrality** — judged against the role's primary function:
- `core`: what the role primarily exists to do
- `supporting`: enables the core work
- `peripheral`: tools/frameworks incidental to the role's judgment (a specific framework is usually peripheral for a design-judgment role)

**status** — strictly from resume evidence:
- `meets`: demonstrated work that genuinely satisfies the requirement — even when described in the JD's own language. Vocabulary overlap *alone* is never meets, but real capability is never downgraded merely for sharing the JD's wording.
- `partial`: evidence is adjacent or incomplete
- `missing`: no evidence at all

**obtainable** — true in exactly two cases, both read from JD text:
1. The JD offers the credential as acquirable: "or eligibility to obtain", "willingness to learn", "training provided"
2. The item is a *duty* — work performed on the job (appears under Responsibilities/Day-to-Day, or uses performance verbs: administer, record, prepare, maintain, draft) — **unless** the JD demands prior performance of that specific duty ("X years doing Y", "experience administering X required")

Hard prerequisites (active credential now, mandatory years threshold, license with no "or obtain" escape hatch) are always `obtainable: false`.

## 2. Scoring math (deterministic, in code)

Weights:

| Tier | Weight | | Centrality | Weight | | Status | Gap factor |
|---|---|---|---|---|---|---|---|
| required | 1.00 | | core | 1.00 | | missing | 1.0 |
| preferred | 0.35 | | supporting | 0.60 | | partial | 0.5 |
| | | | peripheral | 0.30 | | meets | 0.0 |

- Item weight = tier × centrality. Gap `G` = Σ(weight × gap factor); normalized against total weight.
- **Obtainable softener:** an obtainable item labeled `missing` is scored as `partial` (0.5). Trainable gaps are friction, not gates.
- Base score = 100 × (1 − normalized gap).
- **Edge bonus:** best strength that maps to a real JD need adds +12 (core) or +6 (supporting), scaled by remaining headroom — a bonus can polish a strong case, never rescue a weak one.

## 3. Hard guardrails (in order)

1. **Realism ceiling — 90.** The room is never a sure thing. No output exceeds 90.
2. **Required-gate cap — 45.** If **2+** items that are `required` AND (`core` or `supporting`) AND `missing` AND `obtainable: false`, the score is capped at 45 regardless of strengths. **Preferred items can never trigger this cap.**
3. **Confidence floor.** If the JD decomposes into fewer than 3 items, or either input is under 200 characters, the score is clamped to 40–65 and the report is flagged `low confidence`. Thin evidence cannot produce an extreme verdict in either direction.

## 4. Verdict and routing

Verdict follows score bands only — the committee adds nuance, never a veto:

| Score | Verdict |
|---|---|
| ≥ 75 | Strong Candidate |
| 55–74 | Viable but Exposed |
| 35–54 | Long Shot |
| < 35 | Do Not Apply |

Recommendation combines score (the floor) with the committee vote (evaluators scoring ≥ 55 lean *apply*):

- **Score ≥ 55:** "Apply" only if 2+ evaluators lean apply AND strengths dominate gaps (S > 1.3 × G); otherwise "Apply with Caution"
- **Score 45–54:** "Apply with Caution" only if 2+ evaluators lean apply; otherwise "Do Not Apply"
- **Score < 45:** "Do Not Apply" — no committee vote can override

## 5. Escalation rules

- **Low confidence → flag, don't fake.** Clamped score + visible `low` confidence chip. The user is told the evidence is thin.
- **Divergence → must be named.** When labels say the candidate clears the bar on paper but the committee leans skeptical (or vice versa), the observer's committee read is *required* to state the divergence explicitly. It is the highest-value observation in the report.
- **Committee split → reported honestly.** "Committee divided — 2 of 3 would advance you" appears verbatim; the split shades the recommendation but cannot veto a healthy score.

## 6. Framing constraints

- A `preferred` gap is friction to neutralize — never "table stakes," never "a wall."
- A `required` gap on a core or supporting item is a real gate and is said plainly.
- Clear rejects get **terse** reports: verdict + the two highest-leverage facts. No padding an unwinnable case with exhaustive analysis.
- Every narrative field has hard caps (≤3 items per list, ≤160 chars per string) and must add new information — the report never says the same thing three times.
