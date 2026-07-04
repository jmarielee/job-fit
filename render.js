/* ═══════════════════════════════════════════════════════════════════════════
   render.js — All DOM population: score display, loading animation,
               section reveal, report render
   ─────────────────────────────────────────────────────────────────────── */

/* ── RENDER CONSTANTS ────────────────────────────────────────────────────── */

const CIRCUMFERENCE = 345.58;
const RISK_SCORE = { low:18, medium:48, high:76, critical:94 };
const ALL_SECTION_IDS = ['section-hero','section-ledger','section-committee-read','section-benchmark','section-company','section01','section-signals','section02','section-shaperisk','section03','section-actions'];
// Sections collapsed by default — the hero, best-path, and "Fix These" stay open so a skimmer
// gets verdict + odds + the one action without scrolling. Depth is one tap away.
const COLLAPSIBLE_IDS = ['section-ledger','section-committee-read','section-benchmark','section-company','section01','section-signals','section02','section03'];

/* ── SMALL RENDER HELPERS ────────────────────────────────────────────────── */

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function normRisk(raw) {
  const r = (raw || 'medium').toLowerCase();
  if (r.includes('critical')) return 'critical';
  if (r.includes('elevated') || r.includes('high')) return 'high';
  if (r.includes('moderate') || r.includes('medium')) return 'medium';
  if (r.includes('low')) return 'low';
  return 'medium';
}
function evalVerdict(score) {
  const v = (score == null ? 50 : score);
  if (v >= 65) return { label: 'Would advance', cls: 'advance' };
  if (v >= 50) return { label: 'On the fence', cls: 'fence' };
  return { label: 'Would cut', cls: 'cut' };
}
function scoreClass(n) {
  if (n >= 75) return 'hi';
  if (n >= 55) return 'mid';
  if (n >= 35) return 'lo';
  return 'crit';
}
function recClass(rec) {
  if (!rec) return 'caution';
  const r = rec.toLowerCase();
  if (r.includes('do not') || r.includes("don't")) return 'dont';
  if (r.includes('caution')) return 'caution';
  return 'apply';
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}
function showIf(el, on) {
  if (el) el.style.display = on ? '' : 'none';
}
function metaChipsHTML(confidence, evidence) {
  const chips = [];
  if (confidence) chips.push(`<span class="meta-chip">conf: ${esc(confidence)}</span>`);
  if (evidence) chips.push(`<span class="meta-chip">evid: ${esc(evidence)}</span>`);
  return chips.length ? `<div class="meta-chips">${chips.join('')}</div>` : '';
}
function evidenceHTML(items) {
  if (!items || !items.length) return '';
  return `<div class="evidence-block">
    <div class="evidence-label">Why We Think This</div>
    ${items.slice(0,2).map(e=>`<div class="evidence-item">${esc(e)}</div>`).join('')}
  </div>`;
}

/* ── LOADING ANIMATION ───────────────────────────────────────────────────── */

let rafId = null;
let loadingProgress = 0;
let loadingStartTime = null;

const loadingMessages = [
  { threshold:  0, text: 'Reading the job description…' },
  { threshold: 20, text: 'Reading your resume against it…' },
  { threshold: 40, text: 'Labeling every requirement…' },
  { threshold: 60, text: 'Hearing out each evaluator…' },
  { threshold: 80, text: 'Weighing the objections…' },
  { threshold: 90, text: 'Putting the report together…' },
];

function drawLoadingArc(pct) {
  const canvas = document.getElementById('loadingCanvas');
  const ctx = canvas.getContext('2d');
  const cx = 90, cy = 90, r = 70, lw = 4;
  ctx.clearRect(0, 0, 180, 180);

  // Outer tactical bounding crosshairs
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(90, 5); ctx.lineTo(90, 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(90, 160); ctx.lineTo(90, 175); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 90); ctx.lineTo(20, 90); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(160, 90); ctx.lineTo(175, 90); ctx.stroke();

  // Base circle track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = lw;
  ctx.stroke();

  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pct / 100));
    ctx.strokeStyle = '#0f172a'; // ink — red is reserved for live hazards (cap, gate, missing)
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function startStepper() {
  if (rafId) cancelAnimationFrame(rafId);
  loadingProgress = 0;
  loadingStartTime = null;
  document.getElementById('loadingPercent').textContent = '0%';
  document.getElementById('loadingStatus').textContent = 'Starting the analysis…';
  drawLoadingArc(0);
  function animate(ts) {
    if (!loadingStartTime) loadingStartTime = ts;
    const elapsed = (ts - loadingStartTime) / 1000;
    loadingProgress = 95 * (1 - Math.exp(-elapsed / 14));
    const pct = Math.floor(loadingProgress);
    document.getElementById('loadingPercent').textContent = pct + '%';
    let msg = loadingMessages[0].text;
    for (const m of loadingMessages) { if (pct >= m.threshold) msg = m.text; }
    // Pipeline phases override the canned messages — the loader tells the
    // truth about which pass is actually running.
    if (loadingPhaseStatus) msg = loadingPhaseStatus;
    document.getElementById('loadingStatus').textContent = msg;
    drawLoadingArc(loadingProgress);
    rafId = requestAnimationFrame(animate);
  }
  rafId = requestAnimationFrame(animate);
}

function finishStepper() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  document.getElementById('loadingPercent').textContent = '100%';
  document.getElementById('loadingStatus').textContent = 'Report ready.';
  drawLoadingArc(100);
}

/* ── SECTION REVEAL ──────────────────────────────────────────────────────── */

function revealSections() {
  ALL_SECTION_IDS.forEach((id, i) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el || el.style.display === 'none') return;
      el.classList.add('revealed');
      if (i === 0) el.scrollIntoView({ behavior:'smooth', block:'start' });
    }, i * 300);
  });
}

/* ── COLLAPSIBLE SECTIONS (skim-first) ───────────────────────────────────── */

function toggleSection(section) {
  section.classList.toggle('collapsed');
}

function initCollapsibles() {
  COLLAPSIBLE_IDS.forEach(id => {
    const sec = document.getElementById(id);
    if (!sec || sec.dataset.collapsibleInit) return;
    sec.classList.add('collapsible', 'collapsed');
    const label = sec.querySelector('.section-label');
    if (label) label.addEventListener('click', () => toggleSection(sec));
    sec.dataset.collapsibleInit = '1';
  });
}

/* ── SCORE RECEIPT ────────────────────────────────────────────────────────
   The shown work: every number here comes from d._brain, computed in
   scoring.js. Pure display — proof the score is computed, not generated.
   Collapsed by default (native <details>) so it adds depth, not noise. */
function buildScoreReceipt(d) {
  const anchor = document.getElementById('gateFlag');
  if (!anchor || !anchor.parentNode) return;
  let box = document.getElementById('scoreReceipt');
  const b = d._brain;
  if (!b) { if (box) box.style.display = 'none'; return; }
  if (!box) {
    box = document.createElement('details');
    box.id = 'scoreReceipt';
    box.style.cssText = 'margin-top:1.5rem;border:1px dashed var(--border-color);background:var(--bg-surface);';
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }
  box.style.display = '';
  box.open = false;

  const mono = 'font-family:var(--font-mono);';
  const row = (k, v) =>
    `<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.3rem 0;border-top:1px solid var(--border-subtle);${mono}font-size:0.72rem;">`
    + `<span style="color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">${k}</span>`
    + `<span style="color:var(--text-primary);text-align:right;">${v}</span></div>`;

  const G = b.gWeighted, S = b.sWeighted;
  const domWord = b.edgeVsGap === 'edge' ? 'strengths dominate'
                : b.edgeVsGap === 'gap'  ? 'gaps dominate' : 'balanced';
  const domTest = `S ${S} vs 1.3×G ${(1.3 * G).toFixed(2)} → ${domWord}`;

  const guards = [
    `realism ceiling 90 — always on`,
    `required-gate cap 45 — ${b.capped ? 'FIRED: ' + b.capReason : 'not fired'}`,
    `core-gate ceiling 74 — ${b.gateCapped ? 'FIRED: live core required gate' : 'not fired'}`,
    `confidence floor — ${b.lowConfidence ? 'FIRED: clamped 40–65, flagged low confidence' : 'not fired'}`,
  ].map(g => `<div style="${mono}font-size:0.7rem;color:var(--text-secondary);padding:0.15rem 0;line-height:1.45;">· ${g}</div>`).join('');

  const routing = `score ${b.score} + ${b.vote.apply}/3 apply leans + `
    + `${b.edgeVsGap === 'edge' ? 'edge dominance' : 'no edge dominance'}`
    + `${b.gate ? ' + live gate' : ''} → ${b.recommendation}`;

  box.innerHTML =
    `<summary style="cursor:pointer;padding:0.8rem 1.25rem;${mono}font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-primary);">⬡ Score Receipt — how this number was computed</summary>`
    + `<div style="padding:0 1.25rem 1rem;">`
    + row('Gap mass (G)', G)
    + row('Strength mass (S)', S)
    + row('Base = 100 × (1 − G/Σw)', b.base)
    + row('Edge bonus', '+' + b.bonus + ' max, scaled by headroom')
    + row('Edge dominance test', domTest)
    + `<div style="${mono}font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;padding:0.5rem 0 0.15rem;border-top:1px solid var(--border-subtle);margin-top:0.3rem;">Guardrails</div>`
    + guards
    + row('Committee', b.committeeNote || '—')
    + row('Routing', routing)
    + row('Final score', b.score + ' / 100')
    + `<div style="${mono}font-size:0.65rem;color:var(--text-muted);padding-top:0.6rem;line-height:1.5;">The model only labeled the evidence. Every value above was computed deterministically in scoring.js — same labels, same number, every run.</div>`
    + `</div>`;
}

/* ── MAIN REPORT RENDER ──────────────────────────────────────────────────── */

function render(d) {
  // CORE METRIC ENGINE
  const sc = scoreClass(d.survivabilityScore ?? 50);
  const rc = recClass(d.recommendation);

  const hero = document.getElementById('scoreHero');
  hero.className = 'score-hero ' + sc;

  const score = d.survivabilityScore ?? 0;
  document.getElementById('scoreNum').textContent = score || '—';
  const arc = document.getElementById('scoreArc');
  arc.style.strokeDashoffset = CIRCUMFERENCE * (1 - score / 100);
  const arcColors = { hi: '#16a34a', mid: '#ca8a04', lo: '#ea580c', crit: '#e11d48' };
  arc.style.stroke = arcColors[sc] || arcColors.crit;

  document.getElementById('scoreVerdict').textContent = d.verdict || '—';
  document.getElementById('scoreAngle').textContent = d.angle || '';
  document.getElementById('scoreHook').textContent = d.hook || '';

  // Terse rejects can return empty narrative fields — hide orphan labels
  const angleOn = !!(d.angle || '').trim();
  showIf(document.querySelector('.score-angle-label'), angleOn);
  showIf(document.getElementById('scoreAngle'), angleOn);
  showIf(document.querySelector('.score-meta-grid'), !!(d.hook || '').trim());

  const badge = document.getElementById('scoreRecBadge');
  badge.className = 'score-rec-badge ' + rc;
  document.getElementById('scoreRecText').textContent = d.recommendation || '—';

  document.getElementById('scoreMetaChips').innerHTML =
    [d.confidenceLevel ? `<span class="meta-chip">CONFIDENCE: ${esc(d.confidenceLevel)}</span>` : '',
     d.evidenceStrength ? `<span class="meta-chip">EVIDENCE STRENGTH: ${esc(d.evidenceStrength)}</span>` : '']
    .filter(Boolean).join('');

  // THE GATE — the single unmet required item most likely to screen the candidate out.
  // Restored: this block was dropped in the redesign. Reads d._brain.gate from computeScore.
  const gateFlag = document.getElementById('gateFlag');
  const gate = d._brain && d._brain.gate;
  if (gate) {
    const statusWord = gate.status === 'partial' ? 'stated but not demonstrated' : 'no evidence in your resume';
    document.getElementById('gateFlagText').textContent = gate.text;
    document.getElementById('gateFlagNote').textContent =
      `Required, ${gate.centrality} to the role, ${statusWord}. A screen runs on requirements like this before a human ever weighs the rest of your fit. Neutralize it before you apply.`;
    gateFlag.style.display = '';
  } else {
    gateFlag.style.display = 'none';
  }

  // Score Receipt — the shown work, collapsed under the hero
  buildScoreReceipt(d);

  // Committee Read
  const commSection = document.getElementById('section-committee-read');
  if (d.committeeRead) {
    document.getElementById('committeeReadText').textContent = d.committeeRead;
    const evals = d.evaluators || [];
    const evalResults = evals.map(ev => ({ ev, verdict: evalVerdict(ev.score) }));
    // Count strip removed; per-evaluator rows kept — the read names WHO is in the
    // room and where each one lands.
    let tallyHTML = '';
    evalResults.forEach(({ ev, verdict }) => {
      const nameRole = ev.name ? `${ev.name}${ev.title ? ' · ' + ev.title : ''}` : ev.id;
      tallyHTML += `<div class="committee-eval-row">`
                 + `<span class="committee-eval-name">${esc(nameRole)}</span>`
                 + `<span class="eval-verdict-badge ${verdict.cls}">${esc(verdict.label)}</span>`
                 + `</div>`;
    });
    document.getElementById('committeeTally').innerHTML = tallyHTML;
    commSection.style.display = '';
  } else {
    commSection.style.display = 'none';
  }

  // Access Strategy Path
  const bpi = d.bestPathIn || {};
  const bpCard = document.getElementById('bestPathCard');
  if (bpi.path) {
    document.getElementById('bestPathPath').textContent = bpi.path;
    document.getElementById('bestPathReason').textContent = bpi.reason || '';
    document.getElementById('bestPathFirstMove').textContent = bpi.firstMove || '';
    const moveOn = !!(bpi.firstMove || '').trim();
    showIf(document.querySelector('.bestpath-move-label'), moveOn);
    showIf(document.getElementById('bestPathFirstMove'), moveOn);
    bpCard.style.display = '';
  } else {
    bpCard.style.display = 'none';
  }

  // Drafted Opener — ready-to-send artifact; never shown for Do Not Apply
  // (restored: this block was dropped in the redesign)
  const openerCard = document.getElementById('openerCard');
  const opener = (d.draftedOpener || '').trim();
  const isDoNotApply = (d.recommendation || '').toLowerCase().includes('do not');
  if (opener && !isDoNotApply) {
    document.getElementById('openerBody').textContent = opener;
    openerCard.style.display = '';
  } else {
    openerCard.style.display = 'none';
  }

  // Company Topology
  const cr = d.companyReality || {};
  const crSection = document.getElementById('section-company');
  if (cr.read) {
    document.getElementById('companyRead').textContent = cr.read;
    document.getElementById('companyRisk').textContent = cr.risk || '';
    document.getElementById('companyWatchFor').innerHTML =
      (cr.watchFor||[]).map(w=>`<div class="company-watchfor-item">${esc(w)}</div>`).join('');
    showIf(document.getElementById('companyRisk').parentElement, !!(cr.risk || '').trim());
    showIf(document.getElementById('companyWatchFor').parentElement, (cr.watchFor||[]).length > 0);
    crSection.style.display = '';
  } else {
    crSection.style.display = 'none';
  }

  // Strategic Brief columns
  const sb = d.strategicBrief || {};
  const credList = (sb.credibility||[]).slice(0,3);
  const riskList = (sb.risks||[]).slice(0,3);
  document.getElementById('credBullets').innerHTML =
    credList.map(c=>`<div class="brief-bullet">${esc(c)}</div>`).join('');
  document.getElementById('riskBullets').innerHTML =
    riskList.map(r=>`<div class="brief-bullet">${esc(r)}</div>`).join('');
  showIf(document.querySelector('.brief-col.cred'), credList.length > 0);
  showIf(document.querySelector('.brief-col.risk'), riskList.length > 0);
  showIf(document.getElementById('section01'), credList.length > 0 || riskList.length > 0);

  // Critical Signal Deficits
  const sdEl = document.getElementById('signalDeficits');
  const sdSection = document.getElementById('section-signals');
  const deficits = d.signalDeficits || [];
  if (deficits.length) {
    sdEl.innerHTML = deficits.map(s=>`
      <div class="signal-deficit">
        <div class="signal-name">${esc(s.signal)}</div>
        <div>
          <div class="signal-meta-label">Why This Matters</div>
          <div class="signal-meta">${esc(s.whyItMatters)}</div>
        </div>
        <div>
          <div class="signal-meta-label">How To Fix It</div>
          <div class="signal-fix">${esc(s.fix)}</div>
        </div>
      </div>`).join('');
    sdSection.style.display = '';
  } else {
    sdSection.style.display = 'none';
  }

  // Rejection stages (threat matrix)
  const stagesEl = document.getElementById('riskStages');
  stagesEl.innerHTML = '';
  (d.rejectionRisk?.stages||[]).forEach(s => {
    const rawLevel = (s.riskLevel||'medium');
    const lv = normRisk(rawLevel);
    const pct = RISK_SCORE[lv] || 48;
    const card = document.createElement('div');
    card.className = 'risk-stage-card';
    card.innerHTML = `
      <div class="risk-stage-head">
        <div class="risk-headline">${esc(s.headline || s.stage)}</div>
        <div class="risk-meta-row">
          <div class="risk-stage-name">${esc(s.stage)}</div>
          <div class="risk-bar-wrap">
            <div class="risk-bar-track">
              <div class="risk-bar-fill ${lv}" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="risk-pill ${lv}">${esc(rawLevel)}</div>
        </div>
        ${metaChipsHTML(s.confidenceLevel, s.evidenceStrength)}
      </div>
      ${evidenceHTML(s.evidence)}`;
    stagesEl.appendChild(card);
  });

  // Shape Risks
  const sr2 = d.shapeRisk || {};
  const srSection = document.getElementById('section-shaperisk');
  if (sr2.level && sr2.level !== 'low') {
    const lvEl = document.getElementById('shapeRiskLevel');
    lvEl.textContent = sr2.level;
    lvEl.className = 'risk-pill ' + sr2.level;
    document.getElementById('shapeRiskHeadline').textContent = sr2.headline || '';
    document.getElementById('shapeRiskEvidence').innerHTML =
      (sr2.evidence||[]).map(e=>`<div class="shaperisk-evidence-item">${esc(e)}</div>`).join('');
    document.getElementById('shapeRiskFix').textContent = sr2.fix || '';
    const fixOn = !!(sr2.fix || '').trim();
    showIf(document.querySelector('.shaperisk-fix-label'), fixOn);
    showIf(document.getElementById('shapeRiskFix'), fixOn);
    srSection.style.display = '';
  } else {
    srSection.style.display = 'none';
  }

  // Market Calibration Targets
  const bp = d.benchmarkProfile || {};
  const bpSection = document.getElementById('section-benchmark');
  if (bp.summary || bp.title) {
    document.getElementById('benchTitle').textContent = bp.title || '';
    document.getElementById('benchSummary').textContent = bp.summary || '';

    // ── THE BAR gauge ──
    // The bar sits at 75: the system's own 'hi' threshold in scoreClass().
    // Same deterministic score in demo and real runs — both route through computeScore.
    const THE_BAR = 75;
    const gScore = Math.max(0, Math.min(100, d.survivabilityScore ?? 0));
    const gaugeColors = { hi: '#16a34a', mid: '#ca8a04', lo: '#ea580c', crit: '#e11d48' };
    document.getElementById('benchGaugeYou').textContent = `YOU — ${gScore}`;
    const fill = document.getElementById('benchGaugeFill');
    fill.style.width = gScore + '%';
    fill.style.background = gaugeColors[scoreClass(gScore)] || gaugeColors.crit;
    document.getElementById('benchGaugeMarker').style.left = THE_BAR + '%';
    document.getElementById('benchGaugeMarkerTag').textContent = `THE BAR · ${THE_BAR}`;
    const gapEl = document.getElementById('benchGaugeGap');
    const gap = gScore - THE_BAR;
    gapEl.textContent = gap >= 0
      ? `${gap} PTS ABOVE THE BAR`
      : `${Math.abs(gap)} PTS BELOW THE BAR`;
    gapEl.classList.toggle('above', gap >= 0);
    const noteEl = document.getElementById('benchGaugeNote');
    if (d._brain && d._brain.capped) {
      noteEl.textContent = `⬡ Survivability cap engaged — ${d._brain.capReason || 'required-skill gap limits the ceiling'}`;
      noteEl.style.display = '';
    } else {
      noteEl.style.display = 'none';
    }

    document.getElementById('benchCompete').innerHTML =
      (bp.whereYouCompete||[]).slice(0,3).map(s=>`<div class="bench-item">${esc(s)}</div>`).join('');
    document.getElementById('benchLag').innerHTML =
      (bp.whereYouLag||[]).slice(0,3).map(s=>`<div class="bench-item">${esc(s)}</div>`).join('');
    document.getElementById('benchSignals').innerHTML =
      (bp.likelySignals||[]).slice(0,3).map(s=>`<div class="bench-signal-item">${esc(s)}</div>`).join('');
    document.getElementById('benchReality').textContent = bp.marketReality || '';
    document.getElementById('benchUpgrade').textContent = bp.fastestUpgrade || '';
    showIf(document.querySelector('.bench-col.compete'), (bp.whereYouCompete||[]).length > 0);
    showIf(document.querySelector('.bench-col.lag'), (bp.whereYouLag||[]).length > 0);
    showIf(document.getElementById('benchSignals').parentElement, (bp.likelySignals||[]).length > 0);
    showIf(document.getElementById('benchReality').parentElement, !!(bp.marketReality || '').trim());
    showIf(document.querySelector('.bench-upgrade'), !!(bp.fastestUpgrade || '').trim());
    bpSection.style.display = '';
  } else {
    bpSection.style.display = 'none';
  }

  // Evaluators (The Committee)
  const evalEl = document.getElementById('evaluators');
  evalEl.innerHTML = '';
  const evalOrder = ['recruiter','hiring','internal'];

  evalOrder.forEach(id => {
    const ev = (d.evaluators||[]).find(e => e.id === id);
    if (!ev) return;
    const verdict = evalVerdict(ev.score);
    const card = document.createElement('div');
    card.className = 'eval-card';

    card.innerHTML = `
      <div class="eval-card-head">
        <div class="eval-avatar">${esc(initials(ev.name))}</div>
        <div class="eval-identity">
          <div class="eval-name">${esc(ev.name || '—')}</div>
          <div class="eval-title">${esc(ev.title || '—')}</div>
          <div class="eval-agenda">
            <div class="eval-agenda-label">What They Care About</div>
            ${esc(ev.agenda || '')}
          </div>
        </div>
        <div class="eval-verdict-wrap">
          <span class="eval-verdict-badge ${verdict.cls}">${esc(verdict.label)}</span>
        </div>
      </div>
      <div class="eval-card-body">
        ${metaChipsHTML(ev.confidenceLevel, ev.evidenceStrength)}
        <div class="eval-take">${esc(ev.gutTake || '')}</div>
        ${(ev.objections||[]).length ? `<div class="eval-objections-label">Questions They'll Probably Ask You</div>
        <div class="eval-objections">
          ${(ev.objections||[]).slice(0,2).map(o=>`<div class="eval-objection">${esc(o)}</div>`).join('')}
        </div>` : ''}
        ${evidenceHTML(ev.evidence)}
      </div>`;
    evalEl.appendChild(card);
  });

  // Action Priorities
  document.getElementById('actions').innerHTML =
    (d.priorityActions||[]).slice(0,3).map((a,i)=>`
      <div class="priority-action">
        <span class="priority-num">ACTION-0${i+1}</span>
        <span class="priority-text">${esc(a)}</span>
      </div>`).join('');

  // Collapse the deep sections by default — skim-first
  initCollapsibles();
}

/* ── DRAFTED OPENER COPY (restored) ─────────────────────────────────────── */
function copyOpener() {
  const body = document.getElementById('openerBody');
  const btn  = document.getElementById('openerCopyBtn');
  if (!body) return;
  const text = body.textContent || '';
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = o, 1500); } };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {});
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVIDENCE LEDGER — the human-audit stage between labeling and scoring.
   The model extracts. The vote stabilizes. The human corrects. The math
   scores ONLY what this ledger says. Every control here re-runs
   computeScore() locally — no API call, no drift, no surprises.
   ─────────────────────────────────────────────────────────────────────── */

let loadingPhaseStatus = null;

function setLoadingLabel(label, status) {
  const lab = document.querySelector('.loading-label');
  if (lab) lab.textContent = label;
  loadingPhaseStatus = status || null;
}

const TIER_OPTS   = ['required', 'preferred'];
const CENT_OPTS   = ['core', 'supporting', 'peripheral'];
const STATUS_OPTS = ['meets', 'partial', 'missing'];

function _selectHTML(kind, index, field, opts, current) {
  const options = opts.map(o =>
    `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('');
  // status is the score-moving control — it carries a value class for color
  const cls = field === 'status' ? ` class="val-${current}"` : '';
  return `<label class="ledger-ctl"><span class="ledger-ctl-label">${field}</span>` +
         `<select${cls} data-kind="${kind}" data-index="${index}" data-field="${field}">${options}</select></label>`;
}
function _checkHTML(kind, index, field, current, labelText) {
  return `<label class="ledger-ctl ledger-ctl-check"><span class="ledger-ctl-label">${labelText}</span>` +
         `<input type="checkbox" data-kind="${kind}" data-index="${index}" data-field="${field}"${current ? ' checked' : ''}></label>`;
}
function _consensusChip(c) {
  if (!c) return '';
  if (c.human) return `<span class="ledger-chip chip-human">OPERATOR</span>`;
  if (c.voters <= 1) return `<span class="ledger-chip chip-single">1 READING</span>`;
  if (c.contested) {
    const minAgree = Math.min.apply(null, Object.values(c.fields));
    return `<span class="ledger-chip chip-contested">${minAgree}/${c.voters} SPLIT</span>`;
  }
  return `<span class="ledger-chip chip-unanimous">${c.voters}/${c.voters} UNANIMOUS</span>`;
}

function renderLedgerRows() {
  const itemsEl = document.getElementById('ledgerItems');
  const strengthsEl = document.getElementById('ledgerStrengths');
  const L = RUN.ledger;

  itemsEl.innerHTML = L.jdItems.map((it, i) => {
    const c = L.consensus[i];
    return `<div class="ledger-row${c && c.contested ? ' contested' : ''}${c && c.human ? ' human' : ''}">
      <div class="ledger-row-head">
        <span class="ledger-item-text">${esc(it.text)}</span>
        ${_consensusChip(c)}
      </div>
      <div class="ledger-row-ctls">
        ${_selectHTML('item', i, 'status', STATUS_OPTS, it.status)}
        ${_selectHTML('item', i, 'tier', TIER_OPTS, it.tier)}
        ${_selectHTML('item', i, 'centrality', CENT_OPTS, it.centrality)}
        ${_checkHTML('item', i, 'obtainable', it.obtainable, 'obtainable')}
      </div>
    </div>`;
  }).join('');

  strengthsEl.innerHTML = (L.strengths || []).map((s, i) => {
    return `<div class="ledger-row${s._human ? ' human' : ''}">
      <div class="ledger-row-head">
        <span class="ledger-item-text">${esc(s.text)}</span>
        ${s._human ? '<span class="ledger-chip chip-human">OPERATOR</span>' : ''}
      </div>
      <div class="ledger-row-ctls">
        ${_selectHTML('strength', i, 'centrality', CENT_OPTS, s.centrality)}
        ${_checkHTML('strength', i, 'mapsToNeed', s.mapsToNeed, 'maps to a real need')}
      </div>
    </div>`;
  }).join('');

  // One delegated listener per container; change → edit → recompute → repaint chips
  [itemsEl, strengthsEl].forEach(el => {
    el.onchange = (e) => {
      const t = e.target;
      const kind = t.dataset.kind, index = +t.dataset.index, field = t.dataset.field;
      if (!kind || !field) return;
      const value = t.type === 'checkbox' ? t.checked : t.value;
      applyLedgerEdit(kind, index, field, value);
      renderLedgerRows(); // repaint so the row's chip flips to OPERATOR
    };
  });
}

function updateLedgerPreview(brain) {
  const num = document.getElementById('ledgerScoreNum');
  num.textContent = brain.score;
  document.getElementById('ledgerScoreVerdict').textContent = brain.verdict;
  // the cause-and-effect moment: the number visibly reacts to the edit
  num.classList.remove('pulse');
  void num.offsetWidth; // restart the animation
  num.classList.add('pulse');
  const bar = document.getElementById('ledgerScorebar');
  if (bar) bar.classList.toggle('capped', !!(brain.capped || brain.gateCapped));
  const notes = [];
  if (brain.capped)       notes.push(`⬡ ${CAP_VALUE}-cap engaged — ${brain.reqMiss} required core/supporting items missing`);
  if (brain.gateCapped)   notes.push(`⬡ ${GATE_CORE_CEIL} core-gate ceiling engaged`);
  if (brain.gate && !brain.gateCapped) notes.push(`⚠ live gate: ${brain.gate.text}`);
  if (brain.lowConfidence) notes.push('⬡ low-confidence clamp active — thin inputs');
  if (!notes.length) notes.push('no caps engaged');
  document.getElementById('ledgerScoreNote').innerHTML = notes.map(esc).join('<br>');
}

function renderLedgerSection() {
  const section = document.getElementById('section-ledger');
  if (!RUN || !RUN.ledger) { if (section) section.style.display = 'none'; return; } // demo mode has no ledger
  const cacheNote = document.getElementById('ledgerCacheNote');
  if (RUN.ledger.fromCache) {
    cacheNote.style.display = '';
    cacheNote.textContent = '⬡ Labels reused from cache for this exact JD + resume pair — same ledger, same number. Use Re-run Labels for a fresh extraction.';
  } else {
    cacheNote.style.display = 'none';
  }
  const contested = (RUN.ledger.consensus || []).filter(c => c.contested).length;
  const chip = section.querySelector('.section-chip');
  if (chip) chip.textContent = contested > 0 ? String(contested) + '⚠' : '⬡';
  renderLedgerRows();
  updateLedgerPreview(LAST_REPORT && LAST_REPORT._brain ? LAST_REPORT._brain : ledgerScore());
  section.style.display = '';
  document.getElementById('rewriteReportBtn').style.display = 'none';
}
