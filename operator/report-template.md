# Report Template — Operator Output Format

When running as the operator (JD + resume pasted in), produce the report in exactly this structure, as plain text/markdown. Compute the score step-by-step using the weights in `rules.md` BEFORE writing any narrative — show the math so the verdict is auditable.

---

## VERDICT: {Apply / Apply with Caution / Do Not Apply}
**Score: {n}/100 — {verdict band}** · Confidence: {ok / low}

### Scoring math (shown work)
| JD item | tier | centrality | status | obtainable | weight | gap |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | t×c | w×sf |

- Total weight: {Σw} · Gap mass: {G} · Normalized gap: {gNorm}
- Base = 100 × (1 − gNorm) = {base}
- Edge bonus: best mapped strength = {centrality} → +{bonus} × (1 − base/100) = +{effective}
- Guards fired: {none / required-gate cap → 45 / confidence floor → clamped 40–65}
- **Final score: {n}** (ceiling 90)

### Strengths ledger (shown work)
| Strength | centrality | mapsToNeed | weight |
|---|---|---|---|
| ... | ... | true/false | {CENT_W, counted only if mapsToNeed} |

- Strength mass **S = {Σ counted weights}** · Gap mass **G = {from above}**
- Edge dominance test: S > 1.3 × G → {S} vs {1.3 × G} → **{dominant / not dominant}**

### The committee
- **Recruiter ({domain-appropriate title}):** score {0–100} → {advance ≥65 / fence 50–64 / cut <50} — {distinct objection}
- **Hiring manager ({title}):** score {n} → {lean} — {distinct objection}
- **Internal peer ({title}):** score {n} → {lean} — {distinct objection}

### Recommendation logic (shown work)
- Apply-lean tally: an evaluator counts as an **apply lean only if score ≥ 55**. Tally: **{x} of 3**. A fence below 55 is NOT an apply lean — when in doubt, the stricter reading wins.
- Per the table in `rules.md`: score {n} ({band}) + {x} apply leans + edge dominance {yes/no} → **{Apply / Apply with Caution / Do Not Apply}**
- The recommendation is COMPUTED from these three inputs. Never assign it by feel.

### Committee read (neutral observer — outside the vote)
{≤3 sentences. Name the consensus or split. If paper labels and committee lean diverge, say so explicitly.}

### Fix these first
1. {highest-leverage action}
2. {...}
3. {...}

### Your first message — drafted, ready to send
**Channel:** {LinkedIn DM / email / referral ask}
> {Complete sendable message, ≤120 words, candidate's plain professional voice, one credibility hook, one low-cost ask, [Name]/[Company] placeholders where unknown.}

---

Rules for this format:
- Never skip the scoring-math, strengths-ledger, or recommendation-logic sections. The shown work is the point — the number AND the label must both be checkable.
- Never ask the user what to do. Decide, then route.
- If inputs are thin (<3 JD items, or either input <200 chars), say so plainly, clamp per rules.md, and still deliver the best available verdict.
- Terse mode on clear rejects: verdict, math, the two highest-leverage facts, stop.
