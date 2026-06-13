# Scoring Rubric — The Math, Line by Line

Everything below lives in `scoring.js` as the constants and functions named here. Change the constants at the top of the file to retune behavior; nothing else needs to move.

## Constants

```js
TIER_W   = { required: 1.0, preferred: 0.35 }
CENT_W   = { core: 1.0, supporting: 0.6, peripheral: 0.3 }
STATUS_F = { missing: 1.0, partial: 0.5, meets: 0.0 }
EDGE_BONUS   = { core: 12, supporting: 6, peripheral: 0 }
REALISM_CEIL = 90    // the room is never a sure thing
CAP_VALUE    = 45    // required-gate cap
TIE_FACTOR   = 1.3   // edge-vs-gap dominance threshold
```

## Pipeline

1. **Item weight** `w = TIER_W[tier] × CENT_W[centrality]`
   - e.g. a preferred/peripheral item weighs 0.35 × 0.3 = **0.105** — about a tenth of a required/core item.
2. **Gap mass** `G = Σ w × STATUS_F[status]`, with one softener: if `obtainable && status === 'missing'`, the factor is downgraded to `partial` (0.5).
3. **Normalized gap** `gNorm = G / Σw`
4. **Base** `base = 100 × (1 − gNorm)`
5. **Edge bonus** From the *best* strength with `mapsToNeed: true`: +12 core / +6 supporting, scaled by headroom:
   `effectiveBonus = bonus × (1 − base/100)`
   A 75-base case gets a quarter of the bonus; a 40-base case gets most of it — but the cap and bands below keep that from rescuing a gated case.
6. **Ceiling** `score = min(90, base + effectiveBonus)`

## Guards

- **Guard 1 — required-gate cap:** count items where `tier === 'required'` AND centrality ∈ {core, supporting} AND `status === 'missing'` AND `obtainable === false`. If count ≥ 2 → `score = min(score, 45)`. The cap reason is surfaced in the report.
- **Guard 2 — confidence floor:** if JD items < 3, or resume < 200 chars, or JD < 200 chars → `score = clamp(score, 40, 65)` and confidence is flagged `low`.

## Verdict bands (score only)

`≥75` Strong Candidate · `55–74` Viable but Exposed · `35–54` Long Shot · `<35` Do Not Apply

## Recommendation (score floor + committee vote)

Each evaluator with `score ≥ 55` counts as an *apply* lean. Edge dominance: `S > 1.3 × G` (S = summed mapped-strength weight).

| Score | Condition | Recommendation |
|---|---|---|
| ≥ 55 | 2+ apply leans AND edge dominance | Apply |
| ≥ 55 | otherwise | Apply with Caution |
| 45–54 | 2+ apply leans | Apply with Caution |
| 45–54 | otherwise | Do Not Apply |
| < 45 | always | Do Not Apply |

## Properties this buys

- **Reproducible:** same labels → same score, every run.
- **Auditable:** every point lost traces to a labeled item with a weight.
- **Persona-proof:** the adversarial narrative voice has no channel into the number.
- **Honest at the extremes:** the ceiling kills false certainty upward; the confidence floor kills it in both directions on thin input; the cap kills wishful thinking past hard gates.
- **Demo-honest:** demo mode routes the sample labels through this same engine — the demo score is computed live, not hardcoded.
