/* ═══════════════════════════════════════════════════════════════════════════
   render.js — All DOM population: score display, loading animation,
               section reveal, report render
   ─────────────────────────────────────────────────────────────────────── */

/* ── RENDER CONSTANTS ────────────────────────────────────────────────────── */

const CIRCUMFERENCE = 345.58;
const RISK_SCORE = { low:18, medium:48, high:76, critical:94 };
const ALL_SECTION_IDS = ['section-hero','section-committee-read','section-benchmark','section-company','section01','section-signals','section02','section-shaperisk','section03','section-actions'];
// Sections collapsed by default — the hero, best-path, and "Fix These" stay open so a skimmer
// gets verdict + odds + the one action without scrolling. Depth is one tap away.
const COLLAPSIBLE_IDS = ['section-benchmark','section-company','section01','section-signals','section02','section03'];

/* ── SMALL RENDER HELPERS ────────────────────────────────────────────────── */

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
function metaChipsHTML(confidence, evidence) {
  const chips = [];
  if (confidence) chips.push(`<span class="meta-chip">conf: ${confidence}</span>`);
  if (evidence) chips.push(`<span class="meta-chip">evid: ${evidence}</span>`);
  return chips.length ? `<div class="meta-chips">${chips.join('')}</div>` : '';
}
function evidenceHTML(items) {
  if (!items || !items.length) return '';
  return `<div class="evidence-block">
    <div class="evidence-label">Why We Think This</div>
    ${items.slice(0,2).map(e=>`<div class="evidence-item">${e}</div>`).join('')}
  </div>`;
}

/* ── LOADING ANIMATION ───────────────────────────────────────────────────── */

let rafId = null;
let loadingProgress = 0;
let loadingStartTime = null;

const loadingMessages = [
  { threshold:  0, text: 'Executing raw content ingestion…' },
  { threshold: 20, text: 'Deconstructing resume payload…' },
  { threshold: 40, text: 'Executing structural compliance matching…' },
  { threshold: 60, text: 'Running evaluator behavioral simulations…' },
  { threshold: 80, text: 'Formulating threat matrix variables…' },
  { threshold: 90, text: 'Finalizing intelligence file…' },
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
    ctx.strokeStyle = '#e11d48'; // Stark hazard warning color
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function startStepper() {
  if (rafId) cancelAnimationFrame(rafId);
  loadingProgress = 0;
  loadingStartTime = null;
  document.getElementById('loadingPercent').textContent = '0%';
  document.getElementById('loadingStatus').textContent = 'Loading payload analyzer…';
  drawLoadingArc(0);
  function animate(ts) {
    if (!loadingStartTime) loadingStartTime = ts;
    const elapsed = (ts - loadingStartTime) / 1000;
    loadingProgress = 95 * (1 - Math.exp(-elapsed / 14));
    const pct = Math.floor(loadingProgress);
    document.getElementById('loadingPercent').textContent = pct + '%';
    let msg = loadingMessages[0].text;
    for (const m of loadingMessages) { if (pct >= m.threshold) msg = m.text; }
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
  document.getElementById('loadingStatus').textContent = 'Dossier generated.';
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

  const badge = document.getElementById('scoreRecBadge');
  badge.className = 'score-rec-badge ' + rc;
  document.getElementById('scoreRecText').textContent = d.recommendation || '—';

  document.getElementById('scoreMetaChips').innerHTML =
    [d.confidenceLevel ? `<span class="meta-chip">CONFIDENCE: ${d.confidenceLevel}</span>` : '',
     d.evidenceStrength ? `<span class="meta-chip">EVIDENCE STRENGTH: ${d.evidenceStrength}</span>` : '']
    .filter(Boolean).join('');

  // Committee Read
  const commSection = document.getElementById('section-committee-read');
  if (d.committeeRead) {
    document.getElementById('committeeReadText').textContent = d.committeeRead;
    const evals = d.evaluators || [];
    const evalResults = evals.map(ev => ({ ev, verdict: evalVerdict(ev.score) }));
    const advCount   = evalResults.filter(r => r.verdict.cls === 'advance').length;
    const fenceCount = evalResults.filter(r => r.verdict.cls === 'fence').length;
    const cutCount   = evalResults.filter(r => r.verdict.cls === 'cut').length;
    let tallyHTML = `<span class="eval-verdict-badge advance">${advCount} advance</span> `
                  + `<span class="eval-verdict-badge fence">${fenceCount} on the fence</span> `
                  + `<span class="eval-verdict-badge cut">${cutCount} would cut</span>`;
    evalResults.forEach(({ ev, verdict }) => {
      tallyHTML += ` <span class="eval-verdict-badge ${verdict.cls}">${ev.name || ev.id} — ${verdict.label}</span>`;
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
    bpCard.style.display = '';
  } else {
    bpCard.style.display = 'none';
  }

  // Company Topology
  const cr = d.companyReality || {};
  const crSection = document.getElementById('section-company');
  if (cr.read) {
    document.getElementById('companyRead').textContent = cr.read;
    document.getElementById('companyRisk').textContent = cr.risk || '';
    document.getElementById('companyWatchFor').innerHTML =
      (cr.watchFor||[]).map(w=>`<div class="company-watchfor-item">${w}</div>`).join('');
    crSection.style.display = '';
  } else {
    crSection.style.display = 'none';
  }

  // Strategic Brief columns
  const sb = d.strategicBrief || {};
  document.getElementById('credBullets').innerHTML =
    (sb.credibility||[]).slice(0,3).map(c=>`<div class="brief-bullet">${c}</div>`).join('');
  document.getElementById('riskBullets').innerHTML =
    (sb.risks||[]).slice(0,3).map(r=>`<div class="brief-bullet">${r}</div>`).join('');

  // Critical Signal Deficits
  const sdEl = document.getElementById('signalDeficits');
  const sdSection = document.getElementById('section-signals');
  const deficits = d.signalDeficits || [];
  if (deficits.length) {
    sdEl.innerHTML = deficits.map(s=>`
      <div class="signal-deficit">
        <div class="signal-name">${s.signal||''}</div>
        <div>
          <div class="signal-meta-label">Why This Matters</div>
          <div class="signal-meta">${s.whyItMatters||''}</div>
        </div>
        <div>
          <div class="signal-meta-label">How To Fix It</div>
          <div class="signal-fix">${s.fix||''}</div>
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
        <div class="risk-headline">${s.headline || s.stage}</div>
        <div class="risk-meta-row">
          <div class="risk-stage-name">${s.stage}</div>
          <div class="risk-bar-wrap">
            <div class="risk-bar-track">
              <div class="risk-bar-fill ${lv}" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="risk-pill ${lv}">${rawLevel}</div>
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
      (sr2.evidence||[]).map(e=>`<div class="shaperisk-evidence-item">${e}</div>`).join('');
    document.getElementById('shapeRiskFix').textContent = sr2.fix || '';
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
    document.getElementById('benchCompete').innerHTML =
      (bp.whereYouCompete||[]).slice(0,3).map(s=>`<div class="bench-item">${s}</div>`).join('');
    document.getElementById('benchLag').innerHTML =
      (bp.whereYouLag||[]).slice(0,3).map(s=>`<div class="bench-item">${s}</div>`).join('');
    document.getElementById('benchSignals').innerHTML =
      (bp.likelySignals||[]).slice(0,3).map(s=>`<div class="bench-signal-item">${s}</div>`).join('');
    document.getElementById('benchReality').textContent = bp.marketReality || '';
    document.getElementById('benchUpgrade').textContent = bp.fastestUpgrade || '';
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
        <div class="eval-avatar">${initials(ev.name)}</div>
        <div class="eval-identity">
          <div class="eval-name">${ev.name || '—'}</div>
          <div class="eval-title">${ev.title || '—'}</div>
          <div class="eval-agenda">
            <div class="eval-agenda-label">What They Care About</div>
            ${ev.agenda || ''}
          </div>
        </div>
        <div class="eval-verdict-wrap">
          <span class="eval-verdict-badge ${verdict.cls}">${verdict.label}</span>
        </div>
      </div>
      <div class="eval-card-body">
        ${metaChipsHTML(ev.confidenceLevel, ev.evidenceStrength)}
        <div class="eval-take">${ev.gutTake || ''}</div>
        <div class="eval-objections-label">Questions They'll Probably Ask You</div>
        <div class="eval-objections">
          ${(ev.objections||[]).slice(0,2).map(o=>`<div class="eval-objection">${o}</div>`).join('')}
        </div>
        ${evidenceHTML(ev.evidence)}
      </div>`;
    evalEl.appendChild(card);
  });

  // Action Priorities
  document.getElementById('actions').innerHTML =
    (d.priorityActions||[]).slice(0,3).map((a,i)=>`
      <div class="priority-action">
        <span class="priority-num">ACTION-0${i+1}</span>
        <span class="priority-text">${a}</span>
      </div>`).join('');

  // Collapse the deep sections by default — skim-first
  initCollapsibles();
}
