/* ═══════════════════════════════════════════════════════════════════════════
   scoring.js — Scoring brain, two-pass pipeline, majority-vote labeling,
   evidence ledger state, label cache.

   ARCHITECTURE (the honest claim: same labels → same score, always):
     PASS 1 — EXTRACT + VOTE. One anchor call (temperature 0) extracts the
       requirement list and labels it. Two independent relabel calls
       (temperature 1) label the SAME frozen item list. Each score-bearing
       field (tier / centrality / status / obtainable) takes the majority of
       the three votes; ties fall back to the anchor. Items where any voter
       disagreed are flagged CONTESTED in the ledger.
     LEDGER — HUMAN AUDIT. The voted labels are shown before the score is
       final. Every label is editable; edits recompute the score instantly
       in code, no API call. An edited item is marked OPERATOR — the human
       is a voter of last resort, and the ledger says so.
     PASS 2 — NARRATIVE. The locked ledger and the computed score/verdict
       are handed to the adversarial committee, which writes the report
       around numbers it cannot change.
     CACHE — the voted (and human-corrected) ledger is cached per exact
       JD+resume pair, so resubmitting the same inputs reuses the same
       labels and therefore returns the same number. "Re-run Labels"
       bypasses the cache deliberately.
   ─────────────────────────────────────────────────────────────────────── */

/* ── FETCH WITH EXPONENTIAL BACKOFF ─────────────────────────────────────── */

async function fetchWithBackoff(url, options, maxRetries = 5) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status >= 500 || response.status === 429) {
        // Retry on 5xx or rate limits
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Maximum retry threshold exceeded.");
}

/* ===== SCORING BRAIN — required/preferred + centrality + cap + floor =====
   The model LABELS (jdItems / strengths); this computes the score.
   Edit only the constants at the top to tune behaviour. ===== */
const TIER_W   = { required: 1.0, preferred: 0.35 };
const CENT_W   = { core: 1.0, supporting: 0.6, peripheral: 0.3 };
const STATUS_F = { missing: 1.0, partial: 0.5, meets: 0.0 };
const EDGE_BONUS    = { core: 12, supporting: 6, peripheral: 0, none: 0 };
const REALISM_CEIL  = 90;   // the room is never a sure thing
const CAP_VALUE     = 45;   // required-gate cap
const GATE_CORE_CEIL = 74;  // a live CORE required gate can't read as "Strong Candidate" — capped into "Viable but Exposed"
const TIE_FACTOR    = 1.3;  // edge-vs-gap dominance threshold

function _itemWeight(it) {
  const t = TIER_W[it.tier] != null ? TIER_W[it.tier] : TIER_W.required;
  const c = CENT_W[it.centrality] != null ? CENT_W[it.centrality] : CENT_W.supporting;
  return t * c;
}
function _computeGaps(jdItems) {
  let G = 0, total = 0;
  (jdItems || []).forEach(it => {
    const w = _itemWeight(it);
    total += w;
    let sf = STATUS_F[it.status] != null ? STATUS_F[it.status] : 0;
    // Obtainable items (trainable/eligibility) are capped at partial-weight even when labeled missing
    if (it.obtainable && it.status === 'missing') sf = STATUS_F.partial;
    G += w * sf;
  });
  return { G, total, gNorm: total > 0 ? G / total : 0 };
}
function _computeStrength(strengths) {
  let S = 0, best = 'none';
  const rank = { core: 3, supporting: 2, peripheral: 1, none: 0 };
  (strengths || []).forEach(s => {
    if (!s.mapsToNeed) return;
    S += (CENT_W[s.centrality] != null ? CENT_W[s.centrality] : CENT_W.supporting);
    if (rank[s.centrality] > rank[best]) best = s.centrality;
  });
  return { S, best };
}
function _requiredCoreMissing(jdItems) {
  return (jdItems || []).filter(it =>
    it.tier === 'required' &&
    (it.centrality === 'core' || it.centrality === 'supporting') &&
    it.status === 'missing' &&
    !it.obtainable
  ).length;
}
/* ── THE GATE ────────────────────────────────────────────────────────────
   The single requirement most likely to end the application BEFORE a human
   weighs the whole picture — a recruiter/ATS screen-out. This is a SECOND
   deterministic signal alongside the score: the score measures overall match
   strength; the gate measures the one blocking risk. Both come from the same
   honest labels. A gate is REQUIRED only (a preferred gap is never a gate),
   core/supporting, not obtainable, and not already met. partial counts —
   "stated but not demonstrated" is exactly how candidates get screened out. */
function _identifyGate(jdItems) {
  const SEVERITY = { missing: 2, partial: 1 };
  const candidates = (jdItems || []).filter(it =>
    it.tier === 'required' &&
    (it.centrality === 'core' || it.centrality === 'supporting') &&
    (it.status === 'missing' || it.status === 'partial') &&
    !it.obtainable
  );
  if (!candidates.length) return null;
  // Rank: most severe status first, then most central, then by combined weight.
  candidates.sort((a, b) => {
    const sev = (SEVERITY[b.status] || 0) - (SEVERITY[a.status] || 0);
    if (sev) return sev;
    const cent = (CENT_W[b.centrality] || 0) - (CENT_W[a.centrality] || 0);
    if (cent) return cent;
    return _itemWeight(b) - _itemWeight(a);
  });
  const g = candidates[0];
  return { text: g.text, status: g.status, centrality: g.centrality };
}
function _confidence(o) {
  if ((o.jdItemCount || 0) < 3) return 'low';
  if ((o.resumeLen || 0) < 200) return 'low';
  if ((o.jdLen || 0) < 200)     return 'low';
  return 'ok';
}
function _edgeVsGap(S, G) {
  if (S > TIE_FACTOR * G) return 'edge';
  if (G > TIE_FACTOR * S) return 'gap';
  return 'balanced';
}
function _tallyVote(evaluators) {
  let apply = 0, skip = 0;
  (evaluators || []).forEach(e => {
    const l = (e.lean || '').toLowerCase();
    if (l.indexOf('skip') !== -1) skip++;
    else if (l.indexOf('apply') !== -1) apply++;
  });
  return { apply, skip };
}
function computeScore(model) {
  const gaps = _computeGaps(model.jdItems);
  const str  = _computeStrength(model.strengths);

  const base          = 100 * (1 - gaps.gNorm);
  const bonus         = EDGE_BONUS[str.best] || 0;
  const effectiveBonus = bonus * (1 - base / 100);
  let score = Math.min(REALISM_CEIL, base + effectiveBonus);
  score = Math.max(0, score);

  // Guard 1 — required-gate cap (preferred items can NEVER trigger this)
  const reqMiss = _requiredCoreMissing(model.jdItems);
  let capped = false, capReason = '';
  if (reqMiss >= 2) {
    capped = true;
    if (score > CAP_VALUE) score = CAP_VALUE;
    capReason = reqMiss + ' core required qualifications unmet — score capped regardless of other strengths.';
  }

  // Guard 3 — confidence floor (thin inputs can't produce an extreme verdict)
  const conf = _confidence({
    jdItemCount: (model.jdItems || []).length,
    resumeLen: model.resumeLen || 0,
    jdLen: model.jdLen || 0,
  });
  let lowConfidence = false;
  if (conf === 'low') { lowConfidence = true; score = Math.max(40, Math.min(65, score)); }

  // THE GATE — the single unmet required item most likely to screen you out
  // before a human weighs the whole picture. Identified BEFORE the verdict so a
  // CORE gate can constrain the score, exactly like the required-gate cap and
  // realism ceiling do. Math-owned, derived from the same honest labels.
  // Rule: a live CORE required gate can't read as a "Strong Candidate" match —
  // capped into "Viable but Exposed" until the gate is neutralized. A supporting
  // gate doesn't cap the number (less likely to be a hard screen-out) but still
  // forces caution below. A gate NEVER rescues a weak score.
  const gate = _identifyGate(model.jdItems);
  let gateCapped = false;
  if (gate && gate.centrality === 'core' && score > GATE_CORE_CEIL) {
    score = GATE_CORE_CEIL;
    gateCapped = true;
  }

  score = Math.round(score);

  const evg  = _edgeVsGap(str.S, gaps.G);
  const vote = _tallyVote((model.evaluators || []).filter(e => e.id !== 'benchmark'));

  // verdict follows score bands only — committee split is nuance, not a veto
  let verdict;
  if (score >= 75) verdict = 'Strong Candidate';
  else if (score >= 55) verdict = 'Viable but Exposed';
  else if (score >= 35) verdict = 'Long Shot';
  else verdict = 'Do Not Apply';

  // recommendation: score is the floor; committee split can add caution but cannot override a healthy score
  let recommendation;
  if (score >= 55) {
    recommendation = (vote.apply >= 2 && evg === 'edge') ? 'Apply' : 'Apply with Caution';
  } else if (score >= 45) {
    recommendation = vote.apply >= 2 ? 'Apply with Caution' : 'Do Not Apply';
  } else {
    recommendation = 'Do Not Apply';
  }

  // A live gate (core or supporting) is never a clean "Apply".
  if (gate && recommendation === 'Apply') recommendation = 'Apply with Caution';

  // committeeNote: honest plain-English statement of the evaluator split when they diverge
  const total = vote.apply + vote.skip;
  let committeeNote = '';
  if (total > 0) {
    if (vote.apply === total) {
      committeeNote = `Committee aligned — all ${total} evaluators would advance you.`;
    } else if (vote.skip === total) {
      committeeNote = `Committee aligned against — all ${total} evaluators would pass.`;
    } else {
      committeeNote = `Committee divided — ${vote.apply} of ${total} would advance you; the other ${vote.skip} would pass.`;
    }
  }

  const divergent = vote.apply >= 1 && vote.skip >= 1;

  return {
    score, base: Math.round(base), bonus,
    gWeighted: +gaps.G.toFixed(2), sWeighted: +str.S.toFixed(2),
    edgeVsGap: evg, capped, capReason, lowConfidence,
    vote, recommendation, verdict, divergent, reqMiss, committeeNote, gate, gateCapped,
  };
}
/* ===== END SCORING BRAIN ===== */

/* ═════════════════════════════════════════════════════════════════════════
   MAJORITY VOTE — stabilizing the labeling layer
   The math was always deterministic; the labels weren't. A borderline item
   flipping between partial and missing is enough to cross the reqMiss >= 2
   threshold and swing the score between the 45 cap and the 74 ceiling.
   Fix: three independent label readings, per-field majority, ties resolved
   by the temperature-0 anchor, disagreements surfaced — never hidden.
   ═══════════════════════════════════════════════════════════════════════ */

const VOTE_FIELDS = ['tier', 'centrality', 'status', 'obtainable'];

function _fieldMode(values, anchorValue) {
  const counts = {};
  values.forEach(v => { const k = String(v); counts[k] = (counts[k] || 0) + 1; });
  let best = null, bestN = 0, tie = false;
  Object.keys(counts).forEach(k => {
    if (counts[k] > bestN) { best = k; bestN = counts[k]; tie = false; }
    else if (counts[k] === bestN) { tie = true; }
  });
  // Tie → the anchor decides. The anchor is the temperature-0 extraction run:
  // the most reproducible single reading we have.
  const winner = tie ? String(anchorValue) : best;
  const agree = counts[winner] || 0;
  return { value: winner === 'true' ? true : winner === 'false' ? false : winner, agree };
}

/* voters: array of jdItems arrays, all the same length/order.
   voters[0] is the anchor. Returns { items, consensus }. */
function majorityVoteItems(voters) {
  const anchor = voters[0];
  const n = voters.length;
  const items = [];
  const consensus = [];
  anchor.forEach((anchorItem, i) => {
    const voted = { text: anchorItem.text };
    const fields = {};
    let contested = false;
    VOTE_FIELDS.forEach(f => {
      const vals = voters.map(v => v[i][f]);
      const { value, agree } = _fieldMode(vals, anchorItem[f]);
      voted[f] = value;
      fields[f] = agree;
      if (agree < n) contested = true;
    });
    items.push(voted);
    consensus.push({ voters: n, fields, contested, human: false });
  });
  return { items, consensus };
}

/* ═════════════════════════════════════════════════════════════════════════
   LABEL CACHE — same JD + resume pair → same ledger → same number.
   Human corrections are written back to the cache: the audited ledger is
   the durable artifact, not the raw model output.
   ═══════════════════════════════════════════════════════════════════════ */

function hashInputs(jd, resume) {
  const s = jd + '\u0000' + resume;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'jobfit_ledger_v1_' + h.toString(36) + '_' + s.length.toString(36);
}
function loadCachedLedger(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function saveCachedLedger(key, ledger) {
  try {
    localStorage.setItem(key, JSON.stringify({
      jdItems: ledger.jdItems, strengths: ledger.strengths,
      consensus: ledger.consensus, savedAt: new Date().toISOString(),
    }));
  } catch (e) { /* storage full or blocked — cache is a convenience, not a dependency */ }
}

/* ═════════════════════════════════════════════════════════════════════════
   SYSTEM PROMPTS — one per pass. The labeling prompt carries zero
   adversarial persona: Mode 1 is now structurally firewalled from Mode 2,
   not just instructed to be.
   ═══════════════════════════════════════════════════════════════════════ */

const LABEL_RULES = `LABELING RULES (neutral calibrated analyst):
jdItems: break the JD into real line-items. tier = required or preferred, from the JD OWN words (required / must have / minimum / X+ years => required; preferred / strongly preferred / a plus / nice to have / bonus / ideally / a major advantage => preferred; strongly preferred is STILL preferred; ambiguous => preferred). centrality = core (what the role primarily exists to do) / supporting / peripheral, judged against THIS role primary function (a tool or framework is usually peripheral for a judgment or design role). status = meets / partial / missing, strictly from the resume: vocabulary overlap ALONE is not meets, but demonstrated work, projects, or experience that genuinely satisfies the requirement IS meets — even when described in the JD's own language. Downgrade to partial only when evidence is adjacent or incomplete; missing only when there is no evidence at all. Do not downgrade a real, demonstrated capability merely because it shares wording with the JD.
obtainable: true in two cases — (1) the JD explicitly offers the credential as acquirable: "or eligibility to obtain", "or ability to obtain", "willingness to learn", "or willing to acquire", or training/credentials provided during onboarding; (2) the item is a RESPONSIBILITY or DUTY — work the role performs on the job, not a prerequisite the candidate must bring to day one. Duty signals: item appears under a "Responsibilities", "Duties", "What You'll Do", or "Day-to-Day" section heading; or uses verbs of role performance — administer, record, annotate, transcribe, prepare, attend, operate, maintain, draft, coordinate, file, complete. Duties are trained and performed on the job; a candidate who has never done them yet is not disqualified. Exception: mark obtainable=false if the JD explicitly demands prior performance of that specific duty ("X years doing Y", "proven track record of Z", "experience administering X required"). Hard prerequisites are always obtainable=false regardless of section: active credential currently required, mandatory years-of-experience threshold, prior license with no escape hatch. Both cases are JD-text readings, not candidate judgments.
CONDITIONAL REQUIREMENTS: Distinguish requirements the candidate must already POSSESS from requirements satisfiable by ELIGIBILITY or WILLINGNESS. When a JD requirement is phrased as "or eligibility to obtain", "or the ability to obtain", "or willing to acquire", "familiarity with or willingness to learn", "comfortable with or willing to", or describes training/credentials provided during onboarding, the requirement is meets as long as the candidate is plausibly eligible/able/willing and nothing disqualifies them. The act of obtaining the credential belongs in recommended actions, NOT as a disqualifying deficit. Reserve partial or missing status for HARD requirements the candidate genuinely lacks: active possession demanded now ("must hold a current X", "X required"), specific years of experience, or a mandatory prior license with no "or obtain" escape hatch. Do not mark a hard must-possess-now requirement as meets just because it is theoretically obtainable — the distinction is whether the JD itself offers the credential as obtainable, not whether it exists in the world.
BORDERLINE DISCIPLINE: when evidence sits between two statuses, apply the rule text above mechanically rather than intuitively — partial requires SOME adjacent evidence in the resume; missing requires NONE. Cite-to-yourself: you should be able to point at the resume line (or its absence) that justifies each status.
Framing: a PREFERRED gap is friction to neutralize, never a disqualifier. A REQUIRED gap on a core or supporting item is a real gate.`;

const extractSystemPrompt = `You are a neutral, calibrated analyst. Follow the evidence exactly. Labels must reflect reality neither cynically nor generously. Label honestly even when it helps the candidate; label accurately even when it hurts. These labels drive a computed survivability score — you label evidence, code computes the number.

${LABEL_RULES}

strengths: the candidate real strengths for this role, each with centrality (core/supporting/peripheral) and mapsToNeed (true only if it answers a real JD need).

Respond with a single JSON object only. No explanation, no markdown, no code fences. Exactly this structure:
{"jdItems":[{"text":"string","tier":"required|preferred","centrality":"core|supporting|peripheral","status":"meets|partial|missing","obtainable":boolean}],"strengths":[{"text":"string","centrality":"core|supporting|peripheral","mapsToNeed":true}]}`;

const relabelSystemPrompt = `You are a neutral, calibrated analyst performing an independent second reading. You will receive a job description, a resume, and a FIXED numbered list of requirement line-items already extracted from the JD. Do not add, remove, merge, split, or reword items. For each item, independently assign tier, centrality, status, and obtainable using the rules below. Judge each label fresh from the JD and resume text — this is an audit, not a confirmation.

${LABEL_RULES}

Respond with a single JSON object only. No explanation, no markdown, no code fences. Exactly this structure, with one entry per item in the SAME order, and "i" equal to each item's given index:
{"labels":[{"i":0,"tier":"required|preferred","centrality":"core|supporting|peripheral","status":"meets|partial|missing","obtainable":boolean}]}`;

const narrativeSystemPrompt = `You are the adversarial intelligence layer of a job-fit operator. The evidence has already been labeled, audited by the candidate, and scored by deterministic code. You will receive the frozen evidence ledger and the computed results. YOUR NUMBERS ARE HANDED TO YOU AND ARE FINAL: never state, imply, or invent a different score, verdict, or recommendation, and never contradict a ledger label. Your job is the narrative around those fixed facts.

VOICE — CYNICAL ADVERSARIAL (all narrative fields):
Analytical, precise, no corporate pleasantries, no cheerleading, no generic encouragement. Highlight hard realities. Avoid generic phrases: "strong communication skills", "cross-functional collaboration", "fast-paced environment", "passionate", "proven track record". Give deep empirical insights.

For Evaluators:
- recruiter: wants safety, legibility, instant matching, checklist verification. Fears making a weird or confusing choice.
- hiring: wants immediate execution value, team relief. Fears someone who requires 90 days to hold their own.
- internal: wants territory defense, status quo preservation, direct peer comparisons. Skeptical of external hires.

DOMAIN ADAPTATION — the three evaluators are fixed ROLES, not fixed people. Keep their core motivations constant (recruiter = gatekeeping, slate quality, legibility; hiring = execution risk, ramp time, delivery; internal = territory, peer comparison, status), but derive each evaluator's job title, vocabulary, and specific fears from the actual field of the role in the job description. Examples: for a physician role, the hiring manager is a department chair or CMO weighing clinical competence and liability, and the internal is a peer attending guarding the service line; for an HR generalist, the hiring manager is an HR director weighing compliance and culture fit, and the internal is a senior generalist protecting established process; for a teacher, a principal and a department lead; for sales, a sales director and a top-quota rep. Never use engineering titles unless the role is actually in engineering. The three ids must remain exactly "recruiter", "hiring", and "internal".

COMMITTEE READ — committeeRead field (neutral measured observer voice, NOT the cynical voice):
Write a single paragraph, maximum 3 sentences, under 320 characters total. Synthesize the three evaluators: name the consensus or the split; name the one thing that would move the room. When they agree, say so plainly. When split, say what the split hinges on. Do NOT restate the verdict or repeat objections verbatim.
DIVERGENCE ALERT: When the ledger labels suggest the candidate clears the requirements on paper but the evaluator scores lean skeptical (majority below 55), or when evaluators lean positive but significant required items are labeled missing, committeeRead MUST name that divergence explicitly — it is the highest-value observation in the report. Example shape: "On paper you clear the bar, but the room reads you as unproven; the gap here is evidence, not eligibility."

Ensure every string is clean plain text. Output exact fields requested in the structured schema. You MUST include exactly 3 evaluators with ids "recruiter", "hiring", and "internal" — all three are required, never omit any.

COMPRESSION — applies to EVERY narrative field. People skim; long fields get skipped:
- Lead with the conclusion. No preamble, no restating the JD or the verdict, no throat-clearing.
- HARD CAPS: every list has at most 3 items; every string is 160 characters or fewer; gutTake is 220 characters or fewer. Cut adjectives before you cut facts.
- Every field must add NEW information. Never repeat the central gap, the verdict, or a fix that already appears in another field. If two fields would say the same thing, the second must say something new or stay short.

DISTINCT LENSES — each field has ONE job, so the report does not say the same thing three times:
- strategicBrief (credibility / risks): the candidate's ABSOLUTE strengths and risks, standalone.
- benchmarkProfile (whereYouCompete / whereYouLag): ONLY framed relative to the named benchmark candidate — a comparison, never a re-list of the absolute strengths and risks above.
ROLE-LEVEL CALIBRATION: Detect when the JD frames itself as entry-level, trainee, transition, or career-changer-friendly (signals: "transitioning from", "entry-level", "no experience required", "training provided", or requirements dominated by "willingness to learn" / "or eligibility to obtain"). When it does, calibrate the benchmark candidate to a REALISTIC applicant for that level — a fellow career-changer or trainee — NOT a senior lateral hire holding credentials the role explicitly says are optional or trainable. whereYouCompete / whereYouLag must compare against that level-appropriate benchmark.
- signalDeficits: ONLY fixable missing signals, each with a concrete one-line fix. Not a restatement of risks.
- evaluators[].objections: each evaluator raises their OWN distinct concern flowing from their distinct motivation. The three must NOT all name the same gap.
- priorityActions: the single canonical to-do list. Do not duplicate, verbatim, a fix already stated in signalDeficits or shapeRisk — if it is the same action, it lives in priorityActions only.

DRAFTED OPENER — draftedOpener field: A ready-to-send outreach opener of EXACTLY 3 sentences, addressed to the hiring manager or a referral, that the candidate could paste and send. Lead with the single strongest mapped outcome (a shipped result, a measured number) — not a greeting, not "I'm writing to express interest." Sentence 2 connects that outcome to this role's core need. Sentence 3 acknowledges and pre-empts the gate honestly without apologizing for it (e.g. naming the in-progress fix), turning the screen-out risk into a handled item. Plain text, first person, no salutation line, no signature, under 80 words total. If the provided recommendation is "Do Not Apply", set draftedOpener to an empty string — do not draft outreach for an application that should not be sent.

DECISIVENESS SCALING — match effort to the verdict:
- When the ledger shows most required + core items missing (a clear reject), be TERSE. Short objections, no elaborate counter-narratives for an unwinnable application. Give the verdict facts and the two highest-leverage points, then stop. Do not pad a weak case with exhaustive analysis.

Framing: a PREFERRED gap is friction to neutralize, never a disqualifier. Never call a preferred gap table stakes, a bottleneck, or a wall. A REQUIRED gap on a core or supporting item is a real gate.`;

/* ═════════════════════════════════════════════════════════════════════════
   API PLUMBING
   ═══════════════════════════════════════════════════════════════════════ */

async function callClaude(apiKey, system, userContent, temperature) {
  const payload = {
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    temperature: temperature,
    system: system,
    messages: [{ role: "user", content: userContent }]
  };
  const response = await fetchWithBackoff(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(payload)
    }
  );
  if (!response.ok) throw new Error(`Couldn\'t reach the API (status ${response.status})`);
  const result = await response.json();
  const rawText = result?.content?.[0]?.text;
  if (!rawText) throw new Error("Empty content payload from inference engine.");
  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'');
  return JSON.parse(cleaned);
}

/* ── PASS 1a — anchor extraction (temperature 0: the reproducible reading) ── */
async function extractLabels(apiKey, jd, resume) {
  const user = `JOB SPECIFICATIONS:\n${jd}\n\n---\n\nCANDIDATE RESUME:\n${resume}\n\n---\n\nExtract and label. JSON only.`;
  const parsed = await callClaude(apiKey, extractSystemPrompt, user, 0);
  if (!parsed.jdItems || !parsed.jdItems.length) throw new Error("Extraction returned no requirement items.");
  return parsed;
}

/* ── PASS 1b — independent relabel of the frozen item list (temperature 1:
   independent samples are what make a majority vote mean something) ── */
async function relabelItems(apiKey, jd, resume, itemTexts) {
  const list = itemTexts.map((t, i) => `${i}. ${t}`).join('\n');
  const user = `JOB SPECIFICATIONS:\n${jd}\n\n---\n\nCANDIDATE RESUME:\n${resume}\n\n---\n\nFIXED REQUIREMENT LINE-ITEMS (label each, same order, do not modify the list):\n${list}\n\n---\n\nJSON only.`;
  const parsed = await callClaude(apiKey, relabelSystemPrompt, user, 1);
  const labels = parsed && parsed.labels;
  if (!Array.isArray(labels) || labels.length !== itemTexts.length) return null; // invalid voter — dropped, never guessed
  return itemTexts.map((t, i) => {
    const L = labels.find(x => x.i === i) || labels[i];
    return { text: t, tier: L.tier, centrality: L.centrality, status: L.status, obtainable: !!L.obtainable };
  });
}

/* ── PASS 1 ORCHESTRATION — extract, vote, hand to the ledger ── */
async function buildLedger(apiKey, jd, resume) {
  const anchor = await extractLabels(apiKey, jd, resume);
  const itemTexts = anchor.jdItems.map(it => it.text);

  setLoadingLabel('Checking Labels', 'Two more independent readings — majority decides each label…');

  const [runB, runC] = await Promise.all([
    relabelItems(apiKey, jd, resume, itemTexts).catch(() => null),
    relabelItems(apiKey, jd, resume, itemTexts).catch(() => null),
  ]);

  const voters = [anchor.jdItems];
  if (runB) voters.push(runB);
  if (runC) voters.push(runC);

  const { items, consensus } = majorityVoteItems(voters);

  return {
    jdItems: items,
    strengths: anchor.strengths || [],
    consensus: consensus,
    voterCount: voters.length,
    fromCache: false,
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   RUN STATE + PIPELINE ENTRY POINTS (called from app.js / ledger UI)
   ═══════════════════════════════════════════════════════════════════════ */

let RUN = null;         // { jd, resume, cacheKey, ledger }
let LAST_REPORT = null; // the rendered report — live re-scored when the ledger is edited

function ledgerScore() {
  // Score preview from labels alone. Verdict is a pure function of the score;
  // the recommendation can only be finalized once the committee votes exist,
  // and the committee can only add caution — it can never raise the number.
  return computeScore({
    jdItems: RUN.ledger.jdItems,
    strengths: RUN.ledger.strengths,
    evaluators: [],
    resumeLen: RUN.resume.length,
    jdLen: RUN.jd.length,
  });
}

async function runBrief() {
  const jd = document.getElementById('jdInput').value.trim();
  const resume = document.getElementById('resumeInput').value.trim();
  const btn = document.getElementById('runBtn');
  const errBox = document.getElementById('errorBox');
  const errTxt = document.getElementById('errorText');
  const activeKey = getSavedApiKey();

  errBox.className = '';
  ALL_SECTION_IDS.forEach(id => {
    document.getElementById(id).classList.remove('revealed');
  });

  // Key guard — BYOK only
  if (!activeKey) {
    errTxt.textContent = 'No API key saved. Enter your Anthropic key above, or use Load Demo to preview the tool.';
    errBox.className = 'visible';
    document.getElementById('accessGate').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!jd || !resume) {
    errTxt.textContent = 'Both fields are needed — paste the job description and your resume.';
    errBox.className = 'visible';
    return;
  }

  const cacheKey = hashInputs(jd, resume);
  RUN = { jd, resume, cacheKey, ledger: null };

  // Cache hit → same inputs get the same audited ledger, hence the same number.
  const cached = loadCachedLedger(cacheKey);
  if (cached && cached.jdItems && cached.jdItems.length) {
    RUN.ledger = { jdItems: cached.jdItems, strengths: cached.strengths || [], consensus: cached.consensus || [], voterCount: (cached.consensus && cached.consensus[0] && cached.consensus[0].voters) || 1, fromCache: true, cachedAt: cached.savedAt };
    document.getElementById('stage-input').classList.remove('active');
    await writeReport();
    return;
  }

  btn.disabled = true;
  btn.classList.add('loading');
  btn.querySelector('.btn-label').textContent = 'Extracting…';
  document.getElementById('stage-input').classList.remove('active');
  document.getElementById('stage-loading').classList.add('active');
  setLoadingLabel('Reading Evidence', 'First reading of the job description and resume…');
  startStepper();

  try {
    RUN.ledger = await buildLedger(activeKey, jd, resume);
    saveCachedLedger(cacheKey, RUN.ledger);
    await writeReport();
  } catch (err) {
    finishStepper();
    errTxt.textContent = 'Extraction failed: ' + err.message + '. Check your API key and try again.';
    errBox.className = 'visible';
    document.getElementById('stage-loading').classList.remove('active');
    document.getElementById('stage-input').classList.add('active');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.querySelector('.btn-label').textContent = 'Run the Analysis';
  }
}

/* Re-run labels deliberately: bypasses the cache, rebuilds the ledger. */
async function rerunLabels() {
  if (!RUN) return;
  const activeKey = getSavedApiKey();
  const errTxt = document.getElementById('errorText');
  const errBox = document.getElementById('errorBox');
  document.getElementById('stage-result').classList.remove('active');
  document.getElementById('stage-loading').classList.add('active');
  setLoadingLabel('Reading Evidence', 'Fresh reading — saved labels set aside…');
  startStepper();
  try {
    RUN.ledger = await buildLedger(activeKey, RUN.jd, RUN.resume);
    saveCachedLedger(RUN.cacheKey, RUN.ledger);
    await writeReport();
  } catch (err) {
    finishStepper();
    errTxt.textContent = 'Extraction failed: ' + err.message;
    errBox.className = 'visible';
    document.getElementById('stage-loading').classList.remove('active');
    document.getElementById('stage-input').classList.add('active');
  }
}

/* Human edit from the ledger UI: apply, mark OPERATOR, persist, re-score. */
function applyLedgerEdit(kind, index, field, value) {
  if (!RUN || !RUN.ledger) return;
  if (kind === 'item') {
    const it = RUN.ledger.jdItems[index];
    if (!it) return;
    it[field] = (field === 'obtainable') ? !!value : value;
    const c = RUN.ledger.consensus[index];
    if (c) { c.human = true; c.contested = false; }
  } else if (kind === 'strength') {
    const s = RUN.ledger.strengths[index];
    if (!s) return;
    s[field] = (field === 'mapsToNeed') ? !!value : value;
    s._human = true;
  }
  saveCachedLedger(RUN.cacheKey, RUN.ledger); // the corrected ledger is the artifact of record

  // Re-score the live report: same math, new labels, hero and receipt update
  // in place. The narrative was written against the previous labels, so the
  // rewrite button appears — the number never waits for the model.
  if (LAST_REPORT) {
    const vote = (LAST_REPORT.evaluators || []).map(e => ({ id: e.id, lean: (e.score ?? 50) >= 55 ? "apply" : "skip" }));
    const brain = computeScore({
      jdItems: RUN.ledger.jdItems, strengths: RUN.ledger.strengths,
      evaluators: vote, resumeLen: RUN.resume.length, jdLen: RUN.jd.length,
    });
    LAST_REPORT.survivabilityScore = brain.score;
    LAST_REPORT.verdict            = brain.verdict;
    LAST_REPORT.recommendation     = brain.recommendation;
    LAST_REPORT._brain             = brain;
    render(LAST_REPORT);
    updateLedgerPreview(brain);
    const rw = document.getElementById('rewriteReportBtn');
    if (rw) rw.style.display = '';
  } else {
    updateLedgerPreview(ledgerScore());
  }
}

/* ── PASS 2 — narrative around frozen numbers ── */
async function writeReport() {
  if (!RUN || !RUN.ledger) return;
  const activeKey = getSavedApiKey();
  const errTxt = document.getElementById('errorText');
  const errBox = document.getElementById('errorBox');
  errBox.className = '';

  const brain = ledgerScore();

  document.getElementById('stage-result').classList.remove('active');
  document.getElementById('stage-loading').classList.add('active');
  setLoadingLabel('Writing Report', 'The committee is writing around your locked score…');
  startStepper();

  const gateLine = brain.gate
    ? `THE GATE (math-identified): "${brain.gate.text}" — ${brain.gate.status}, ${brain.gate.centrality}.`
    : 'THE GATE: none — no live required gate.';

  const userQuery = `JOB SPECIFICATIONS:\n${RUN.jd}\n\n---\n\nCANDIDATE RESUME:\n${RUN.resume}\n\n---\n\nFROZEN EVIDENCE LEDGER (labeled, human-audited, immutable):\n${JSON.stringify({ jdItems: RUN.ledger.jdItems, strengths: RUN.ledger.strengths })}\n\n---\n\nCOMPUTED RESULTS (deterministic code — FINAL, do not restate differently):\nsurvivabilityScore: ${brain.score}\nverdict: ${brain.verdict}\nrecommendation (provisional, pending committee vote): ${brain.recommendation}\n${gateLine}\n${brain.capped ? 'REQUIRED-GATE CAP ENGAGED: ' + brain.capReason : ''}\n${brain.lowConfidence ? 'LOW-CONFIDENCE FLAG: thin inputs — verdict clamped by the confidence floor.' : ''}\n\n---\n\nWrite the narrative report around these fixed facts. Respond with a single JSON object only. No explanation, no markdown, no code fences. Use exactly this structure:\n{"confidenceLevel":"string","evidenceStrength":"string","angle":"string","hook":"string","bestPathIn":{"path":"string","reason":"string","firstMove":"string"},"companyReality":{"read":"string","risk":"string","watchFor":["string"]},"strategicBrief":{"credibility":["string"],"risks":["string"]},"signalDeficits":[{"signal":"string","whyItMatters":"string","fix":"string"}],"rejectionRisk":{"stages":[{"stage":"string","riskLevel":"string","confidenceLevel":"string","evidenceStrength":"string","headline":"string","evidence":["string"]}]},"shapeRisk":{"level":"string","headline":"string","evidence":["string"],"fix":"string"},"evaluators":[{"id":"string","name":"string","title":"string","agenda":"string","score":integer,"confidenceLevel":"string","evidenceStrength":"string","gutTake":"string","objections":["string"],"evidence":["string"]}],"committeeRead":"string","benchmarkProfile":{"title":"string","summary":"string","likelySignals":["string"],"whereYouCompete":["string"],"whereYouLag":["string"],"marketReality":"string","fastestUpgrade":"string"},"draftedOpener":"string","priorityActions":["string"]}`;

  try {
    const narrative = await callClaude(activeKey, narrativeSystemPrompt, userQuery, 1);

    // Merge: labels and numbers come from the ledger + math, never the narrative.
    const data = narrative;
    data.jdItems   = RUN.ledger.jdItems;
    data.strengths = RUN.ledger.strengths;

    // Final scoring pass WITH committee votes: identical labels → identical
    // score and verdict; the vote can only nuance the recommendation.
    const vote = (data.evaluators || []).map(e => ({ id: e.id, lean: (e.score ?? 50) >= 55 ? "apply" : "skip" }));
    const finalBrain = computeScore({
      jdItems: RUN.ledger.jdItems,
      strengths: RUN.ledger.strengths,
      evaluators: vote,
      resumeLen: RUN.resume.length,
      jdLen: RUN.jd.length,
    });
    data.survivabilityScore = finalBrain.score;
    data.verdict            = finalBrain.verdict;
    data.recommendation     = finalBrain.recommendation;
    if (finalBrain.lowConfidence) data.confidenceLevel = "low";
    data._brain  = finalBrain;
    data._ledger = RUN.ledger; // provenance: consensus + human edits travel with the report
    LAST_REPORT  = data;

    render(data);
    renderLedgerSection();
    finishStepper();

    setTimeout(() => {
      document.getElementById('stage-loading').classList.remove('active');
      document.getElementById('stage-result').classList.add('active');
      window.scrollTo(0, 0);
      revealSections();
    }, 650);
  } catch (err) {
    finishStepper();
    errTxt.textContent = 'The report step failed: ' + err.message + '. Your labels are saved — running the same inputs again skips re-extraction.';
    errBox.className = 'visible';
    document.getElementById('stage-loading').classList.remove('active');
    document.getElementById('stage-input').classList.add('active');
  }
}
