/* ═══════════════════════════════════════════════════════════════════════════
   app.js — Init, BYOK key handling, demo mode, reset
   ─────────────────────────────────────────────────────────────────────── */

// Always blank. BYOK only: the user's key lives in their browser (localStorage)
// and goes straight to the Anthropic API. No server, no proxy, nothing stored.
const hardcodedApiKey = "";

// --- AUTH MODE LOGIC ---
// BYOK:  user saves a personal key in localStorage → calls the Anthropic API directly from the browser
// Demo:  runDemo() → runs hardcoded sample labels through the real scoring engine locally, no API call

function getSavedApiKey() {
  return hardcodedApiKey || localStorage.getItem('anthropic_api_key') || "";
}

function initAccessTerminal() {
  const activeKey = getSavedApiKey();
  const gate  = document.getElementById('accessGate');
  const label = document.getElementById('accessStatusLabel');
  const input = document.getElementById('apiKeyInput');
  const chip  = document.getElementById('modechip');

  if (activeKey) {
    gate.className = "access-gate secure";
    label.textContent = "KEY SAVED // AUTHORIZED";
    input.value = activeKey;
    chip.textContent = "BYOK Active";
    chip.className = "access-mode-chip mode-byok";
  } else {
    gate.className = "access-gate";
    label.textContent = "NO KEY — BYOK REQUIRED";
    input.value = "";
    chip.textContent = "No Key";
    chip.className = "access-mode-chip mode-none";
  }
}

function saveApiKey() {
  const inputKey = document.getElementById('apiKeyInput').value.trim();
  const errBox = document.getElementById('errorBox');
  errBox.className = '';

  if (inputKey) {
    localStorage.setItem('anthropic_api_key', inputKey);
    initAccessTerminal();
  } else {
    localStorage.removeItem('anthropic_api_key');
    initAccessTerminal();
  }
}

// --- DEMO DATA ---
const DEMO_DATA = {"survivabilityScore":68,"verdict":"Viable but Exposed","recommendation":"Apply with Caution","confidenceLevel":"HIGH","evidenceStrength":"MODERATE","resumeLen":1600,"jdLen":1400,"jdItems":[{"text":"5+ years backend systems experience","tier":"required","centrality":"core","status":"meets"},{"text":"Senior-level ownership of services end-to-end","tier":"required","centrality":"core","status":"partial"},{"text":"Distributed systems / data pipeline experience","tier":"required","centrality":"core","status":"meets"},{"text":"Drives independent technical decisions at scale","tier":"required","centrality":"supporting","status":"missing"},{"text":"Go / Rust production fluency (team stack)","tier":"preferred","centrality":"supporting","status":"missing"},{"text":"Public portfolio / open-source presence","tier":"preferred","centrality":"peripheral","status":"missing"},{"text":"Technical writing / thought leadership","tier":"preferred","centrality":"peripheral","status":"missing"}],"strengths":[{"text":"Deep backend systems experience at scale","centrality":"supporting","mapsToNeed":true},{"text":"Quantified delivery metrics (latency, throughput)","centrality":"supporting","mapsToNeed":true},{"text":"Data-infrastructure domain knowledge","centrality":"supporting","mapsToNeed":true}],"angle":"Strong execution background, weak on leadership and ownership signals","hook":"Deep IC contributor with tangible delivery record — but gaps in scope narrative and public presence will surface fast in committee review.","bestPathIn":{"path":"Direct application + internal referral from existing engineering team member","reason":"Recruiter screen will likely flag the title gap. An internal referral bypasses the ATS cold-open and gets the resume into hiring manager hands directly.","firstMove":"Identify 2nd-degree LinkedIn connections at the company before submitting. Request a 15-minute informational call first."},"companyReality":{"read":"Series B startup, ~60-person eng org, recently restructured after layoffs 8 months ago. Hiring for execution now, not exploration. Every new headcount is a committee debate.","risk":"Post-layoff orgs carry political scar tissue. New hires face heightened scrutiny from surviving senior engineers who now own more surface area and are protective of team quality.","watchFor":["Long interview loops (6+ rounds) signal indecisiveness — an internal candidate may already exist","Multiple rounds with same-level ICs is a tell that hiring authority is unclear","Vague answers on team structure suggest the reorg is still actively settling"]},"strategicBrief":{"credibility":["3 years of backend systems work at scale is directly legible to a hiring engineer in this domain","The data pipeline project aligns precisely with the core technical requirements stated in the JD","Measurable delivery metrics (latency reduction, throughput increase) will survive recruiter-level screening"],"risks":["No tech lead or staff-level title — will benchmark below the target for a mid-senior IC role","Python-heavy profile in a Go/Rust shop raises a quiet execution risk flag in the hiring manager's mind","No public portfolio or open-source signal makes the technical quality claim completely unverifiable pre-screen"]},"signalDeficits":[{"signal":"TECHNICAL WRITING / PUBLIC PORTFOLIO","whyItMatters":"Hiring managers at this level want proof of thought leadership. No blog, no talks, no OSS contributions means the technical quality claim is entirely unverifiable.","fix":"Publish one technical deep-dive on the data pipeline architecture before applying. Link it in the resume header under a 'Technical Writing' field."},{"signal":"OWNERSHIP SCOPE LANGUAGE","whyItMatters":"Every bullet reads as 'I contributed to X' or 'I helped build Y'. Zero instances of 'I owned', 'I led', or 'I decided'. This signals pure IC track, not senior.","fix":"Rewrite the top 3 resume bullets to lead with ownership: 'Led design and delivery of…', 'Owned the migration from…', 'Drove the decision to…'"}],"rejectionRisk":{"stages":[{"stage":"ATS / Resume Screen","riskLevel":"medium","confidenceLevel":"HIGH","evidenceStrength":"STRONG","headline":"Title mismatch may trigger auto-filter before human review","evidence":["Job requires 'Senior Engineer' equivalent — current title is 'Software Engineer II', a structural mismatch","ATS keyword scan may miss 'distributed systems' if the phrase isn't explicitly present in the resume text"]},{"stage":"Hiring Manager Review","riskLevel":"high","confidenceLevel":"MODERATE","evidenceStrength":"MODERATE","headline":"Ownership narrative gap will be interrogated immediately","evidence":["HM will compare against candidates who have demonstrably led teams or owned entire services end-to-end","Python background in a Go shop signals 60+ days before full productivity — HM wants someone effective in 30"]},{"stage":"Technical Interview","riskLevel":"low","confidenceLevel":"HIGH","evidenceStrength":"STRONG","headline":"Domain knowledge is a genuine differentiator in this loop","evidence":["Data pipeline experience maps directly to the system design questions expected at this seniority level","Latency optimization history will surface strong in infrastructure-focused technical rounds"]}]},"shapeRisk":{"level":"medium","headline":"Specialist shape in a role that rewards generalist signaling","evidence":["Profile reads as deep backend specialist — no signal of cross-functional exposure or upstream product thinking","Zero mention of stakeholder communication, requirements gathering, or driving decisions without direction"],"fix":"Add one bullet per role that references non-engineering collaboration: 'Worked with product to define SLAs for…' or 'Partnered with data science to align schema design with…'"},"evaluators":[{"id":"recruiter","name":"Priya V.","title":"Technical Recruiter","agenda":"Fill the req fast with someone who clears the title bar and won't confuse the committee.","score":55,"confidenceLevel":"HIGH","evidenceStrength":"STRONG","gutTake":"The experience is there, but the title gap is going to make me hesitate before I send this forward. I need the HM to explicitly tell me it's okay to proceed.","objections":["Title doesn't match the level we're actively hiring for — requires HM pre-approval to advance","No public GitHub or portfolio makes it impossible for me to pre-qualify before a technical screen"],"evidence":["Recruiter checklist: title match, years of exp, required tech stack — only 2 of 3 pass cleanly","Portfolio gap is a real blocker at this stage without an internal referral to offset it"]},{"id":"hiring","name":"Marcus T.","title":"Engineering Manager","agenda":"Get someone productive in 30 days who can take full ownership without daily check-ins.","score":63,"confidenceLevel":"MODERATE","evidenceStrength":"MODERATE","gutTake":"The data pipeline work is genuinely interesting. But I need to hear this person say 'I owned it end-to-end' — not 'I was part of the team that built it'. That distinction is everything here.","objections":["Python in a Go shop means at minimum 60 days before full productivity — not acceptable given current team bandwidth","No evidence of having driven independent technical decisions at meaningful scope"],"evidence":["HM values self-directed execution above all — resume shows collaborative contribution, not independent ownership","Tech stack mismatch is a concrete productivity risk the HM will weigh explicitly in the committee meeting"]},{"id":"internal","name":"Sasha R.","title":"Staff Engineer (Technical Loop)","agenda":"Protect the team's technical bar. Deeply skeptical of anyone who can't demonstrate depth fast.","score":58,"confidenceLevel":"MODERATE","evidenceStrength":"MODERATE","gutTake":"The metrics are fine. But 'reduced latency by 40%' is a claim I hear in every interview. I want to know the exact mechanism — what did you change, what did you explicitly not do, and what were the failure modes you considered.","objections":["Quantified metrics without mechanism detail read as rehearsed — will probe hard on system design fundamentals","No OSS or writing samples means I have zero visibility into code quality or architectural reasoning history"],"evidence":["Staff engineers run the technical screen here — they filter hard for depth, not breadth or polish","Without public artifacts, technical quality is entirely unverifiable until the live coding session"]}],"benchmarkProfile":{"title":"The Canonical Senior IC at This Company","summary":"Candidates who consistently advance have shipped features end-to-end with no hand-holding, maintain a public technical presence, and can articulate system tradeoffs without prompting. Most have 5–7 years with at least one tech lead or staff-adjacent credit on their record.","likelySignals":["Active GitHub with recent, substantive, non-tutorial contributions","A technical blog post or conference talk in the last 18 months","At least one clearly stated 'I owned X from design through production' project"],"whereYouCompete":["Domain depth in data infrastructure is rare and directly valued at this company","Delivery metrics are specific and credible — not generic filler","Years of experience clears the floor threshold without question"],"whereYouLag":["No public technical presence vs. shortlisted candidates who have established one","Title differential creates a structural scoring disadvantage in the hiring committee","Language stack mismatch adds perceived ramp risk that other candidates don't carry"],"marketReality":"At Series B companies post-restructure, the bar for new headcount is high and politically charged. Every hire is a budget commitment the team debates. You are competing against candidates who have already de-risked the ownership and productivity questions.","fastestUpgrade":"Publish one technical deep-dive post and rewrite the top 3 resume bullets to lead with ownership language. These two changes address approximately 80% of the stated objections across all three evaluators."},"priorityActions":["Rewrite top 3 resume bullets to lead with ownership language — 'Owned', 'Led', 'Drove' — eliminate 'Contributed to' and 'Helped build' entirely","Publish one technical post on the data pipeline architecture before submitting — link it in the resume header as a 'Technical Writing' entry","Find a referral before applying cold — check LinkedIn for 2nd-degree connections and request a 15-minute informational call to bypass ATS screening"]};

function runDemo() {
  // Instantly render hardcoded sample data — no API call, no key needed
  document.getElementById('stage-input').classList.remove('active');
  document.getElementById('stage-loading').classList.add('active');
  startStepper();

  // Short fake delay so the loading animation actually plays
  setTimeout(() => {
    const demo = JSON.parse(JSON.stringify(DEMO_DATA));
    // route the demo through the SAME engine a real run uses — genuine output, not a fake number
    if (demo.jdItems && demo.jdItems.length) {
      const _vote = (demo.evaluators || []).map(e => ({ id: e.id, lean: (e.score ?? 50) >= 55 ? "apply" : "skip" }));
      const _b = computeScore({ jdItems: demo.jdItems, strengths: demo.strengths, evaluators: _vote, resumeLen: demo.resumeLen || 1500, jdLen: demo.jdLen || 1400 });
      demo.survivabilityScore = _b.score;
      demo.recommendation     = _b.recommendation;
      demo.verdict            = _b.verdict;
      demo._brain = _b;
    }
    render(demo);
    finishStepper();
    setTimeout(() => {
      document.getElementById('stage-loading').classList.remove('active');
      document.getElementById('stage-result').classList.add('active');

      // Prepend a demo banner to the results nav
      const nav = document.querySelector('.stage-result-nav');
      if (!document.getElementById('demoBanner')) {
        const banner = document.createElement('div');
        banner.id = 'demoBanner';
        banner.style.cssText = 'font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);background:var(--bg-surface);border:1px dashed var(--border-color);padding:0.6rem 1rem;margin-bottom:1rem;';
        banner.textContent = '⬡ Demo Mode — Sample analysis. Paste your own data and run a real analysis to replace this.';
        nav.prepend(banner);
      }

      window.scrollTo(0, 0);
      revealSections();
    }, 650);
  }, 2200);
}

function resetToInput() {
  document.getElementById('stage-result').classList.remove('active');
  ['credBullets','riskBullets','riskStages','evaluators','actions',
   'signalDeficits','companyWatchFor','scoreMetaChips','shapeRiskEvidence',
   'benchCompete','benchLag','benchSignals'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  ['scoreAngle','scoreHook',
   'bestPathPath','bestPathReason','bestPathFirstMove',
   'companyRead','companyRisk','shapeRiskHeadline','shapeRiskFix',
   'benchTitle','benchSummary','benchReality','benchUpgrade'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  const sn = document.getElementById('scoreNum'); if (sn) sn.textContent = '—';
  const sv = document.getElementById('scoreVerdict'); if (sv) sv.textContent = '—';
  const sr = document.getElementById('scoreRecText'); if (sr) sr.textContent = '—';
  ['section-benchmark','section-company','section-signals','section-shaperisk','bestPathCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ALL_SECTION_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('revealed');
  });
  document.getElementById('stage-input').classList.add('active');
  const banner = document.getElementById('demoBanner');
  if (banner) banner.remove();
}

// --- GLOBAL INIT ---
window.addEventListener('DOMContentLoaded', () => {
  initAccessTerminal();
  document.getElementById('stage-input').classList.add('active');
});
