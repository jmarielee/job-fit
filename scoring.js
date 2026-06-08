/* ═══════════════════════════════════════════════════════════════════════════
   scoring.js — Scoring brain, API call, system prompt, response parse
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
    G += w * (STATUS_F[it.status] != null ? STATUS_F[it.status] : 0);
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
    it.status === 'missing'
  ).length;
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
    vote, recommendation, verdict, divergent, reqMiss, committeeNote,
  };
}
/* ===== END SCORING BRAIN ===== */

/* ── SYSTEM PROMPT ───────────────────────────────────────────────────────── */

const systemPrompt = `You operate in two explicit modes during this analysis. Stay in each mode for its designated output — do not let one bleed into the other.

MODE 1 — NEUTRAL CALIBRATED ANALYST (jdItems, strengths labels only):
When assigning tier, centrality, status, and mapsToNeed, you are a neutral, calibrated analyst. Follow the evidence exactly. Labels must reflect reality neither cynically nor generously — the cynical persona has zero influence here. Label honestly even when it helps the candidate; label accurately even when it hurts. This is the instruction that drives the computed survivability score.

MODE 2 — CYNICAL ADVERSARIAL VOICE (all narrative fields):
For evaluators, objections, rejectionRisk, signalDeficits, shapeRisk, companyReality, strategicBrief, angle, hook, bestPathIn, and priorityActions — this is where the adversarial intelligence system operates. Analytical, precise, no corporate pleasantries, no cheerleading, no generic encouragement. Highlight hard realities. Avoid generic phrases: "strong communication skills", "cross-functional collaboration", "fast-paced environment", "passionate", "proven track record". Give deep empirical insights.

For Evaluators (Mode 2):
- recruiter: wants safety, legibility, instant matching, checklist verification. Fears making a weird or confusing choice.
- hiring: wants immediate execution value, team relief. Fears someone who requires 90 days to hold their own.
- internal: wants territory defense, status quo preservation, direct peer comparisons. Skeptical of external hires.

Ensure every string is clean plain text. Output exact fields requested in the structured schema. You MUST include exactly 3 evaluators with ids "recruiter", "hiring", and "internal" — all three are required, never omit any.

COMPRESSION — applies to EVERY narrative field. People skim; long fields get skipped:
- Lead with the conclusion. No preamble, no restating the JD or the verdict, no throat-clearing.
- HARD CAPS: every list has at most 3 items; every string is 160 characters or fewer; gutTake is 220 characters or fewer. Cut adjectives before you cut facts.
- Every field must add NEW information. Never repeat the central gap, the verdict, or a fix that already appears in another field. If two fields would say the same thing, the second must say something new or stay short.

DISTINCT LENSES — each field has ONE job, so the report does not say the same thing three times:
- strategicBrief (credibility / risks): the candidate's ABSOLUTE strengths and risks, standalone.
- benchmarkProfile (whereYouCompete / whereYouLag): ONLY framed relative to the named benchmark candidate — a comparison, never a re-list of the absolute strengths and risks above.
- signalDeficits: ONLY fixable missing signals, each with a concrete one-line fix. Not a restatement of risks.
- evaluators[].objections: each evaluator raises their OWN distinct concern flowing from their distinct motivation. The three must NOT all name the same gap.
- priorityActions: the single canonical to-do list. Do not duplicate, verbatim, a fix already stated in signalDeficits or shapeRisk — if it is the same action, it lives in priorityActions only.

DECISIVENESS SCALING — match effort to the verdict:
- When most required + core JD items are missing (a clear reject), be TERSE. Short objections, no elaborate counter-narratives for an unwinnable application. Give the verdict and the two highest-leverage facts, then stop. Do not pad a weak case with exhaustive analysis.

LABELING RULES (Mode 1 — neutral analyst):
jdItems: break the JD into real line-items. tier = required or preferred, from the JD OWN words (required / must have / minimum / X+ years => required; preferred / strongly preferred / a plus / nice to have / bonus / ideally / a major advantage => preferred; strongly preferred is STILL preferred; ambiguous => preferred). centrality = core (what the role primarily exists to do) / supporting / peripheral, judged against THIS role primary function (a tool or framework is usually peripheral for a judgment or design role). status = meets / partial / missing, strictly from the resume: vocabulary overlap ALONE is not meets, but demonstrated work, projects, or experience that genuinely satisfies the requirement IS meets — even when described in the JD's own language. Downgrade to partial only when evidence is adjacent or incomplete; missing only when there is no evidence at all. Do not downgrade a real, demonstrated capability merely because it shares wording with the JD.
strengths: the candidate real strengths for this role, each with centrality (core/supporting/peripheral) and mapsToNeed (true only if it answers a real JD need).
Framing: a PREFERRED gap is friction to neutralize, never a disqualifier. Never call a preferred gap table stakes, a bottleneck, or a wall. A REQUIRED gap on a core or supporting item is a real gate.`;

/* ── MAIN API CALL ───────────────────────────────────────────────────────── */

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
    errTxt.textContent = 'Ingress parameters empty. Input both Target Specifications and Candidate Profile.';
    errBox.className = 'visible';
    return;
  }

  btn.disabled = true;
  btn.classList.add('loading');
  btn.querySelector('.btn-label').textContent = 'Deconstructing…';
  document.getElementById('stage-input').classList.remove('active');
  document.getElementById('stage-loading').classList.add('active');
  startStepper();

  const userQuery = `JOB SPECIFICATIONS:\n${jd}\n\n---\n\nCANDIDATE RESUME:\n${resume}\n\n---\n\nRespond with a single JSON object only. No explanation, no markdown, no code fences. Use exactly this structure:\n{"survivabilityScore":integer,"jdItems":[{"text":"string","tier":"required|preferred","centrality":"core|supporting|peripheral","status":"meets|partial|missing"}],"strengths":[{"text":"string","centrality":"core|supporting|peripheral","mapsToNeed":true}],"verdict":"string","recommendation":"string","confidenceLevel":"string","evidenceStrength":"string","angle":"string","hook":"string","bestPathIn":{"path":"string","reason":"string","firstMove":"string"},"companyReality":{"read":"string","risk":"string","watchFor":["string"]},"strategicBrief":{"credibility":["string"],"risks":["string"]},"signalDeficits":[{"signal":"string","whyItMatters":"string","fix":"string"}],"rejectionRisk":{"stages":[{"stage":"string","riskLevel":"string","confidenceLevel":"string","evidenceStrength":"string","headline":"string","evidence":["string"]}]},"shapeRisk":{"level":"string","headline":"string","evidence":["string"],"fix":"string"},"evaluators":[{"id":"string","name":"string","title":"string","agenda":"string","score":integer,"confidenceLevel":"string","evidenceStrength":"string","gutTake":"string","objections":["string"],"evidence":["string"]}],"benchmarkProfile":{"title":"string","summary":"string","likelySignals":["string"],"whereYouCompete":["string"],"whereYouLag":["string"],"marketReality":"string","fastestUpgrade":"string"},"priorityActions":["string"]}`;

  const requestPayload = {
    model: "claude-sonnet-4-5",
    max_tokens: 6000,
    system: systemPrompt,
    messages: [{ role: "user", content: userQuery }]
  };

  try {
    let response;
    if (activeKey) {
      response = await fetchWithBackoff(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify(requestPayload)
        }
      );
    }

    if (!response.ok) {
      throw new Error(`Inference engine connection failure: STATUS ${response.status}`);
    }

    const result = await response.json();
    const rawText = result?.content?.[0]?.text;

    if (!rawText) {
      throw new Error("Diagnostic report generated empty content payload.");
    }

    const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'');
    const parsedData = JSON.parse(cleaned);
    // ── deterministic scoring: the model labelled; the number is COMPUTED ──
    if (parsedData.jdItems && parsedData.jdItems.length) {
      const _vote = (parsedData.evaluators || []).map(e => ({ id: e.id, lean: (e.score ?? 50) >= 55 ? "apply" : "skip" }));
      const _b = computeScore({ jdItems: parsedData.jdItems, strengths: parsedData.strengths, evaluators: _vote, resumeLen: resume.length, jdLen: jd.length });
      parsedData.survivabilityScore = _b.score;
      parsedData.recommendation     = _b.recommendation;
      parsedData.verdict            = _b.verdict;
      if (_b.lowConfidence) parsedData.confidenceLevel = "low";
      parsedData._brain = _b;
    }
    render(parsedData);
    finishStepper();

    setTimeout(() => {
      document.getElementById('stage-loading').classList.remove('active');
      document.getElementById('stage-result').classList.add('active');
      window.scrollTo(0, 0);
      revealSections();
    }, 650);

  } catch(err) {
    finishStepper();
    errTxt.textContent = 'Diagnostic Execution Halted: ' + err.message + '. Verify your API key credentials.';
    errBox.className = 'visible';
    document.getElementById('stage-loading').classList.remove('active');
    document.getElementById('stage-input').classList.add('active');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.querySelector('.btn-label').textContent = 'Analyze Target';
  }
}
