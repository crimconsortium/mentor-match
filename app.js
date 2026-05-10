/* =============================================================
   Mentor Match — companion to the Criminology PhD Faculty Explorer
   Pure client-side. No backend, no storage, no analytics.

   EDITING GUIDE
   -------------
   • Quiz questions and labels:        QUESTIONS array (below)
   • Per-dimension scoring weight:     DEFAULT_WEIGHTS (importance sliders adjust at runtime)
   • Scoring math:                     scoreFaculty()
   • Result-card explanation text:     explainMatch()
   • CrimRxiv / Consortium CTA copy:   edit index.html (#cta-* and footer blocks)
   • US regions / state mapping:       build_data.py (rebuild faculty.js after edits)
   • Topic taxonomy:                   build_data.py KEYWORD_TAXONOMY
   ============================================================= */

(function () {
  'use strict';

  const DATA = window.__MM_DATA__;
  if (!DATA || !Array.isArray(DATA.faculty)) {
    document.body.innerHTML =
      '<p style="padding:2rem;font-family:Inter,sans-serif">Faculty data failed to load.</p>';
    return;
  }

  // ----------------------------------------------------------------
  //  Constants — taxonomies and labels
  // ----------------------------------------------------------------

  // US census-style regions used by the location question
  const REGIONS = [
    {
      key: 'Northeast',
      label: 'Northeast',
      help: 'NY, PA, MA, NJ, CT, plus DC and the Mid-Atlantic.',
    },
    {
      key: 'South',
      label: 'South',
      help: 'TX, FL, GA, VA, MD, the Carolinas, the Gulf states, and the DC area.',
    },
    {
      key: 'Midwest',
      label: 'Midwest',
      help: 'OH, MI, IL, IN, MO, NE, ND, and the Great Plains.',
    },
    {
      key: 'West',
      label: 'West',
      help: 'CA, AZ, NV, WA, HI, and the Mountain West.',
    },
    {
      key: 'International',
      label: 'International',
      help: 'CrimRxiv Consortium members in the UK, EU, Canada, Australia/NZ, and more.',
    },
  ];

  const RANK_PREFS = [
    {
      key: 'higher',
      label: 'Established faculty',
      help: 'Full professors, distinguished/named chairs, and senior leadership — deep records of advising.',
    },
    {
      key: 'middle',
      label: 'Mid-career faculty',
      help: 'Associate professors and clinical/research professors — active labs and growing track records.',
    },
    {
      key: 'lower',
      label: 'Early-career faculty',
      help: 'Assistant professors and newer faculty — building research agendas; often more hands-on with PhD students.',
    },
    {
      key: 'any',
      label: 'No preference',
      help: "Don't weight rank at all. Score everyone equally on this dimension.",
    },
  ];

  const OPENNESS_PREFS = [
    {
      key: 'yes',
      label: 'Yes, this matters to me',
      help: 'I want to work with faculty whose institution is actively making criminology more open and freely available.',
    },
    {
      key: 'maybe',
      label: 'Nice to have',
      help: 'I appreciate it, but I want it weighted lightly compared to research fit.',
    },
    {
      key: 'no',
      label: "Doesn't matter",
      help: "Don't weight this dimension at all.",
    },
  ];

  // Default weights for each dimension. Sliders on each question adjust the
  // weight at runtime (1 = "matters a little", 3 = "matters most").
  const DEFAULT_WEIGHTS = {
    topics:   3,
    location: 2,
    rank:     2,
    openness: 2,
  };

  // ----------------------------------------------------------------
  //  Quiz questions
  // ----------------------------------------------------------------
  // To add a question, append an object here AND extend scoreFaculty().
  // Each question reads/writes ANSWERS[id]. `weightable` adds the importance slider.
  // ----------------------------------------------------------------
  const QUESTIONS = [
    {
      id: 'topics',
      eyebrow: 'Question 1 of 4',
      title: 'What do you want to study?',
      help: 'Pick up to six topics. Faculty who work in your chosen areas will score higher. These tags are the same canonical list used in the Criminology PhD Faculty Explorer — pick the closest fit even if your interest is more specific.',
      type: 'multi',
      weightable: true,
      options: () => DATA.topics.map((t) => ({ key: t, label: t })),
      max: 6,
    },
    {
      id: 'regions',
      eyebrow: 'Question 2 of 4',
      title: 'Where would you like to study?',
      help: 'Select any U.S. region that works for you. Pick "International" to include CrimRxiv Consortium members outside the U.S. Location is weighted — faculty outside your selected regions can still appear if they match strongly on other dimensions.',
      type: 'multi',
      weightable: true,
      options: () => REGIONS.map((r) => ({ key: r.key, label: r.label, help: r.help })),
      // Below the region grid we also render an optional state picker
      extra: 'states',
    },
    {
      id: 'rank',
      eyebrow: 'Question 3 of 4',
      title: 'What kind of mentor do you want?',
      help: 'Pick one. Established faculty often have longer track records; early-career faculty may have more time and energy for new students. This is a soft preference, not a filter.',
      type: 'single',
      weightable: true,
      options: () => RANK_PREFS.map((r) => ({ key: r.key, label: r.label, help: r.help })),
    },
    {
      id: 'openness',
      eyebrow: 'Question 4 of 4',
      title: 'How much does open scholarship matter to you?',
      help: 'Some institutions are leaders in making criminology research free to read and share. We can prioritize faculty at those institutions if that matters to you.',
      type: 'single',
      weightable: true,
      options: () => OPENNESS_PREFS.map((r) => ({ key: r.key, label: r.label, help: r.help })),
    },
  ];

  // ----------------------------------------------------------------
  //  State
  // ----------------------------------------------------------------
  // We deliberately do not persist this anywhere. Refreshing the page wipes everything.
  const ANSWERS = {
    topics: new Set(),
    regions: new Set(),
    states: new Set(),
    rank: 'any',
    openness: 'no',
    weights: Object.assign({}, DEFAULT_WEIGHTS),
  };
  let currentStep = 0;

  // ----------------------------------------------------------------
  //  DOM refs
  // ----------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    quizCard: $('quiz-card'),
    progressFill: $('progress-fill'),
    progressStep: $('progress-step'),
    progressTotal: $('progress-total'),
    btnNext: $('btn-next'),
    btnBack: $('btn-back'),
    btnSkip: $('btn-skip'),
    btnRestart: $('btn-restart'),
    results: $('results'),
    resultsGrid: $('results-grid'),
    resultsSummary: $('results-summary'),
    quiz: $('quiz'),
    hero: $('hero'),
    footerNote: $('footer-note'),
  };

  els.progressTotal.textContent = QUESTIONS.length;

  // ----------------------------------------------------------------
  //  Theme — same toggle behavior as the Explorer
  // ----------------------------------------------------------------
  function preferredTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    renderThemeIcon();
  }
  function renderThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    btn.innerHTML = isDark
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  applyTheme(preferredTheme());

  // ----------------------------------------------------------------
  //  Helpers
  // ----------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function pluralize(n, one, many) {
    return n === 1 ? one : many;
  }

  function weightLabel(w) {
    return w === 0 ? 'Off'
      : w === 1 ? 'Minor'
      : w === 2 ? 'Important'
      : 'Most important';
  }

  // List of unique US states present in the dataset, sorted
  const US_STATES = Array.from(new Set(
    DATA.faculty.filter((f) => f.country === 'United States' && f.state).map((f) => f.state)
  )).sort();

  // ----------------------------------------------------------------
  //  Question rendering
  // ----------------------------------------------------------------
  function renderQuestion() {
    const q = QUESTIONS[currentStep];
    const optionsHtml = q.options().map((opt) => renderOption(q, opt)).join('');

    let extraHtml = '';
    if (q.extra === 'states') {
      extraHtml = renderStatePicker();
    }

    let weightHtml = '';
    if (q.weightable) {
      const w = ANSWERS.weights[q.id];
      weightHtml = `
        <div class="importance">
          <div class="importance-label">
            <span>How much does this matter?</span>
            <span class="importance-value" id="weight-val">${escapeHtml(weightLabel(w))}</span>
          </div>
          <input type="range" min="0" max="3" step="1" value="${w}" class="importance-input" id="weight-input"
                 aria-label="Importance weight" />
          <div class="importance-ticks">
            <span>Off</span><span>Minor</span><span>Important</span><span>Most</span>
          </div>
        </div>`;
    }

    els.quizCard.innerHTML = `
      <div class="q-eyebrow">${escapeHtml(q.eyebrow)}</div>
      <h2 class="q-title">${escapeHtml(q.title)}</h2>
      <p class="q-help">${escapeHtml(q.help)}</p>
      <div class="${q.type === 'multi' ? 'option-grid' : 'option-list'}" role="${q.type === 'multi' ? 'group' : 'radiogroup'}">
        ${optionsHtml}
      </div>
      ${extraHtml}
      ${weightHtml}
    `;

    // Wire up option inputs
    els.quizCard.querySelectorAll('input[type=checkbox], input[type=radio]').forEach((inp) => {
      inp.addEventListener('change', () => onOptionChange(q, inp));
    });
    // Importance slider
    const slider = $('weight-input');
    if (slider) {
      slider.addEventListener('input', () => {
        ANSWERS.weights[q.id] = parseInt(slider.value, 10);
        $('weight-val').textContent = weightLabel(ANSWERS.weights[q.id]);
      });
    }
    // State picker toggle
    const refineToggle = $('state-refine-toggle');
    const refineBox = $('state-refine-box');
    if (refineToggle && refineBox) {
      refineToggle.addEventListener('click', () => {
        const open = refineBox.style.display !== 'none';
        refineBox.style.display = open ? 'none' : 'block';
        refineToggle.textContent = open ? 'Refine by state (optional)' : 'Hide state filter';
      });
    }

    // Progress + buttons
    const pct = ((currentStep + 1) / QUESTIONS.length) * 100;
    els.progressFill.style.width = pct + '%';
    els.progressStep.textContent = currentStep + 1;
    els.btnBack.disabled = currentStep === 0;
    els.btnNext.textContent = currentStep === QUESTIONS.length - 1 ? 'See my matches →' : 'Next →';
  }

  function renderOption(q, opt) {
    const checked = q.type === 'multi'
      ? ANSWERS[q.id].has(opt.key)
      : ANSWERS[q.id] === opt.key;
    const inputType = q.type === 'multi' ? 'checkbox' : 'radio';
    const inputName = q.id;
    return `
      <label class="option">
        <input type="${inputType}" name="${inputName}" value="${escapeHtml(opt.key)}" ${checked ? 'checked' : ''} />
        <span class="option-body">
          <span class="option-label">${escapeHtml(opt.label)}</span>
          ${opt.help ? `<span class="option-help">${escapeHtml(opt.help)}</span>` : ''}
        </span>
      </label>`;
  }

  function renderStatePicker() {
    const chips = US_STATES
      .map((s) => `<label class="state-chip"><input type="checkbox" value="${s}" ${ANSWERS.states.has(s) ? 'checked' : ''} /><span>${s}</span></label>`)
      .join('');
    const startOpen = ANSWERS.states.size > 0;
    return `
      <div class="state-refine">
        <button type="button" class="state-refine-toggle" id="state-refine-toggle">
          ${startOpen ? 'Hide state filter' : 'Refine by U.S. state (optional)'}
        </button>
        <div id="state-refine-box" style="display:${startOpen ? 'block' : 'none'};margin-top:var(--space-3)">
          <div class="state-grid" id="state-grid">${chips}</div>
        </div>
      </div>`;
  }

  function onOptionChange(q, inp) {
    if (q.id === 'topics') {
      if (inp.checked) {
        if (ANSWERS.topics.size >= (q.max || 999)) {
          // Enforce max selection by un-checking this one
          inp.checked = false;
          return;
        }
        ANSWERS.topics.add(inp.value);
      } else {
        ANSWERS.topics.delete(inp.value);
      }
    } else if (q.id === 'regions') {
      if (inp.checked) ANSWERS.regions.add(inp.value);
      else ANSWERS.regions.delete(inp.value);
    } else if (q.type === 'single') {
      ANSWERS[q.id] = inp.value;
      // re-render to reflect radio visual state across the group
      renderQuestion();
    }

    // State chips live outside the main option list
    if (inp.closest('.state-grid')) {
      if (inp.checked) ANSWERS.states.add(inp.value);
      else ANSWERS.states.delete(inp.value);
    }
  }

  // Delegated handler for state chips (they sit inside .state-grid)
  document.addEventListener('change', (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement)) return;
    if (inp.closest('.state-grid')) {
      if (inp.checked) ANSWERS.states.add(inp.value);
      else ANSWERS.states.delete(inp.value);
    }
  });

  // ----------------------------------------------------------------
  //  Navigation
  // ----------------------------------------------------------------
  els.btnNext.addEventListener('click', () => {
    if (currentStep < QUESTIONS.length - 1) {
      currentStep += 1;
      renderQuestion();
      els.quizCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      finishQuiz();
    }
  });
  els.btnBack.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep -= 1;
      renderQuestion();
      els.quizCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  els.btnSkip.addEventListener('click', () => {
    els.btnNext.click();
  });
  els.btnRestart.addEventListener('click', () => {
    ANSWERS.topics.clear();
    ANSWERS.regions.clear();
    ANSWERS.states.clear();
    ANSWERS.rank = 'any';
    ANSWERS.openness = 'no';
    ANSWERS.weights = Object.assign({}, DEFAULT_WEIGHTS);
    currentStep = 0;
    els.results.hidden = true;
    els.quiz.hidden = false;
    renderQuestion();
    els.hero.scrollIntoView({ behavior: 'smooth' });
  });

  // ----------------------------------------------------------------
  //  Scoring
  // ----------------------------------------------------------------
  // Each dimension produces a sub-score in [0, 1]. The total is a weighted
  // sum normalized by the sum of weights, so the score is always in [0, 1].
  //
  // We do NOT use hard filters. Faculty who don't match a dimension simply
  // earn 0 on that dimension, but can still surface via strong scores elsewhere.
  // ----------------------------------------------------------------
  function scoreFaculty(f) {
    const w = ANSWERS.weights;
    const subs = {};

    // --- Topics (set overlap, fraction of user's picks that the faculty covers)
    if (ANSWERS.topics.size > 0) {
      let hits = 0;
      ANSWERS.topics.forEach((t) => { if (f.topics.includes(t)) hits += 1; });
      subs.topics = hits / ANSWERS.topics.size;
      subs._topicHits = hits;
    } else {
      subs.topics = 0;
    }

    // --- Location
    // Full credit for a region match. Bonus for a state match when the user
    // refined to specific states (state match implies region match).
    if (ANSWERS.regions.size > 0 || ANSWERS.states.size > 0) {
      let s = 0;
      const regionMatch = ANSWERS.regions.size === 0 || ANSWERS.regions.has(f.region);
      const stateMatch = ANSWERS.states.size > 0 && f.state && ANSWERS.states.has(f.state);
      if (ANSWERS.states.size > 0) {
        // User has refined to states. State match = full, region-only match = partial.
        if (stateMatch) s = 1;
        else if (regionMatch) s = 0.6;
        else s = 0;
      } else {
        s = regionMatch ? 1 : 0;
      }
      subs.location = s;
      subs._locRegion = regionMatch;
      subs._locState = stateMatch;
    } else {
      subs.location = 0;
    }

    // --- Rank
    if (ANSWERS.rank === 'any') {
      subs.rank = 0; // weight is also typically lowered, but score 0 either way
    } else {
      subs.rank = f.rank_tier === ANSWERS.rank ? 1 : (adjacentTier(ANSWERS.rank, f.rank_tier) ? 0.5 : 0);
    }

    // --- Openness (Consortium membership)
    if (ANSWERS.openness === 'no') {
      subs.openness = 0;
    } else if (ANSWERS.openness === 'maybe') {
      subs.openness = f.consortium ? 1 : 0.3; // soft bonus
    } else {
      subs.openness = f.consortium ? 1 : 0;
    }

    // Weighted sum
    const weightSum =
      w.topics + w.location + w.rank + w.openness;
    const numer =
      subs.topics * w.topics +
      subs.location * w.location +
      subs.rank * w.rank +
      subs.openness * w.openness;
    const total = weightSum === 0 ? 0 : numer / weightSum;

    // Small deterministic tiebreaker so identical scores rank by name
    return {
      faculty: f,
      score: total,
      subs,
      _tie: f.name.toLowerCase(),
    };
  }

  function adjacentTier(pref, tier) {
    // Soft credit for adjacent ranks (e.g. user wants "higher" but a strong
    // "middle" might still be worth surfacing).
    const adj = {
      higher:  ['middle'],
      middle:  ['higher', 'lower'],
      lower:   ['middle'],
    };
    return (adj[pref] || []).includes(tier);
  }

  function rankAll() {
    const scored = DATA.faculty.map(scoreFaculty);
    scored.sort((a, b) => (b.score - a.score) || a._tie.localeCompare(b._tie));
    return scored;
  }

  // ----------------------------------------------------------------
  //  Results
  // ----------------------------------------------------------------
  function finishQuiz() {
    const ranked = rankAll();
    const top = ranked.slice(0, 10);

    els.resultsSummary.innerHTML = renderSummary();
    els.resultsGrid.innerHTML = top.map((r, i) => renderResultCard(r, i + 1)).join('');

    els.quiz.hidden = true;
    els.results.hidden = false;
    els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSummary() {
    // Sort the four dimensions by weight (descending), show user the priority order
    const w = ANSWERS.weights;
    const labels = {
      topics: 'topic fit',
      location: 'location',
      rank: 'faculty rank',
      openness: 'open-criminology leadership',
    };
    const ordered = ['topics', 'location', 'rank', 'openness']
      .map((k) => ({ k, w: w[k] }))
      .filter((x) => x.w > 0)
      .sort((a, b) => b.w - a.w);

    let priorityLine;
    if (ordered.length === 0) {
      priorityLine = 'You turned off every dimension. <strong>Showing the field alphabetically.</strong> Retake the quiz and dial a few sliders up to get a ranked list.';
    } else {
      const named = ordered.map((x, i) => {
        if (i === 0) return `<strong>${labels[x.k]}</strong>`;
        return labels[x.k];
      });
      let joined;
      if (named.length === 1) joined = `You said ${named[0]} mattered most.`;
      else if (named.length === 2) joined = `You said ${named[0]} mattered most, followed by ${named[1]}.`;
      else {
        const last = named[named.length - 1];
        const rest = named.slice(0, -1).join(', ');
        joined = `You said ${rest}, and ${last} all mattered, with ${named[0]} ranking highest.`;
      }
      priorityLine = joined;
    }

    let topicLine = '';
    if (ANSWERS.topics.size > 0) {
      const tags = Array.from(ANSWERS.topics).map((t) => `<span class="topic-tag">${escapeHtml(t)}</span>`).join(' ');
      topicLine = ` Your topic picks: ${tags}`;
    }

    return `${priorityLine} These matches rose to the top because they aligned best with your selected priorities — no one was excluded by a hard filter.${topicLine}`;
  }

  function renderResultCard(r, rank) {
    const f = r.faculty;
    const reasons = explainMatch(r);
    const badge = f.consortium
      ? `<span class="crimrxiv-badge" title="CrimRxiv Consortium member institution">CrimRxiv</span>`
      : '';

    // Links: profile first, then department/directory, then email
    const links = [];
    if (f.profile_url) links.push(`<a class="result-link" href="${escapeHtml(f.profile_url)}" target="_blank" rel="noopener">Official profile ↗</a>`);
    if (f.department_url) links.push(`<a class="result-link" href="${escapeHtml(f.department_url)}" target="_blank" rel="noopener">Department ↗</a>`);
    // Always link back to the Faculty Explorer so the two tools stay connected
    const explorerUrl = (DATA.explorer_site_url || 'https://crimconsortium.github.io/criminology-faculty-explorer/')
      + '?q=' + encodeURIComponent(f.name);
    links.push(`<a class="result-link" href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener">See in Faculty Explorer ↗</a>`);
    if (f.email) links.push(`<a class="result-link" href="mailto:${escapeHtml(f.email)}">${escapeHtml(f.email)}</a>`);

    const scorePct = Math.round(r.score * 100);

    return `
      <article class="result-card ${f.consortium ? 'crimrxiv-card' : ''}" aria-label="Match ${rank}: ${escapeHtml(f.name)}">
        <div class="result-rank">${rank}</div>
        <div class="result-body">
          <div class="result-name">${escapeHtml(f.name)} ${badge}</div>
          <div class="result-title">${escapeHtml(f.title || f.title_category)}</div>
          <div class="result-institution">${escapeHtml(f.institution)}${f.state ? ' · ' + escapeHtml(f.state) : (f.country !== 'United States' ? ' · ' + escapeHtml(f.country) : '')}</div>
        </div>
        <div class="result-score">
          <div class="result-score-value">${scorePct}<span style="font-size:0.55em;color:var(--color-text-muted);font-weight:500;">%</span></div>
          <div class="result-score-label">Match</div>
        </div>
        <ul class="result-reasons">${reasons}</ul>
        <div class="result-links">${links.join('')}</div>
      </article>`;
  }

  // ----------------------------------------------------------------
  //  Explanations — drives the "Why this match?" bullets per card
  // ----------------------------------------------------------------
  // Edit the language below to tune the voice. Each bullet should answer one
  // of: (a) what the user weighted most, (b) which priorities matched, (c) why
  // a partial match still rose to the top.
  // ----------------------------------------------------------------
  function explainMatch(r) {
    const f = r.faculty;
    const reasons = [];
    const w = ANSWERS.weights;

    // Topics
    if (ANSWERS.topics.size > 0 && w.topics > 0) {
      const hits = Array.from(ANSWERS.topics).filter((t) => f.topics.includes(t));
      if (hits.length === ANSWERS.topics.size && hits.length > 0) {
        reasons.push({
          ok: true,
          html: `Works in every topic you picked: ${hits.map(tag).join(' ')}.`,
        });
      } else if (hits.length > 0) {
        reasons.push({
          ok: true,
          html: `Matches ${hits.length} of your ${ANSWERS.topics.size} topic ${pluralize(ANSWERS.topics.size, 'pick', 'picks')}: ${hits.map(tag).join(' ')}.`,
        });
      } else if (f.topics.length > 0) {
        // No direct topic hit but they have adjacent interests worth surfacing
        reasons.push({
          ok: false,
          html: `Their listed interests didn't tag any of your picks, but they work on ${f.topics.slice(0, 3).map(tag).join(' ')}.`,
        });
      }
    }

    // Location
    if ((ANSWERS.regions.size > 0 || ANSWERS.states.size > 0) && w.location > 0) {
      if (r.subs._locState) {
        reasons.push({ ok: true, html: `In <strong>${escapeHtml(f.state)}</strong>, which you flagged as a preferred state.` });
      } else if (r.subs._locRegion) {
        const loc = f.country === 'United States'
          ? `the <strong>${escapeHtml(f.region)}</strong>${f.state ? ' (' + escapeHtml(f.state) + ')' : ''}`
          : `<strong>International</strong> (${escapeHtml(f.country)})`;
        reasons.push({ ok: true, html: `Based in ${loc}, which matches one of your preferred regions.` });
      } else {
        const loc = f.country === 'United States'
          ? `${escapeHtml(f.region)}${f.state ? ' (' + escapeHtml(f.state) + ')' : ''}`
          : escapeHtml(f.country);
        reasons.push({ ok: false, html: `Outside your preferred regions (${loc}), but scored well enough on other dimensions to surface here.` });
      }
    }

    // Rank
    if (ANSWERS.rank !== 'any' && w.rank > 0) {
      const want = (RANK_PREFS.find((r) => r.key === ANSWERS.rank) || {}).label || 'mentor';
      if (r.subs.rank === 1) {
        reasons.push({ ok: true, html: `Fits your preference for <strong>${escapeHtml(want.toLowerCase())}</strong> — they're an ${escapeHtml(f.title_category)}.` });
      } else if (r.subs.rank === 0.5) {
        reasons.push({ ok: false, html: `Close to your rank preference — ${escapeHtml(f.title_category)} is adjacent to <em>${escapeHtml(want.toLowerCase())}</em>.` });
      } else {
        reasons.push({ ok: false, html: `Different rank than you asked for (${escapeHtml(f.title_category)}), but strong topic or location fit kept them in the list.` });
      }
    }

    // Openness
    if (ANSWERS.openness !== 'no' && w.openness > 0) {
      if (f.consortium) {
        reasons.push({ ok: true, html: `At a <strong>CrimRxiv Consortium</strong> institution — your "open scholarship matters" preference applied.` });
      } else if (ANSWERS.openness === 'yes') {
        reasons.push({ ok: false, html: `Their institution isn't in the CrimRxiv Consortium, but they ranked well on your other priorities.` });
      }
    }

    // Render
    const bullets = reasons.map((r) =>
      `<li${r.ok ? '' : ' class="reason-muted"'}>${r.html}</li>`
    );

    // Always close with a one-line interests preview so users have substance to read
    if (f.research_interests) {
      const preview = f.research_interests.length > 200
        ? f.research_interests.slice(0, 197) + '…'
        : f.research_interests;
      bullets.push(`<li class="reason-muted"><em>Listed interests:</em> ${escapeHtml(preview)}</li>`);
    }

    return bullets.join('');
  }

  function tag(t) {
    return `<span class="topic-tag">${escapeHtml(t)}</span>`;
  }

  // ----------------------------------------------------------------
  //  Footer note
  // ----------------------------------------------------------------
  const facultyCount = DATA.faculty.length.toLocaleString();
  const institutionCount = new Set(DATA.faculty.map((f) => f.institution)).size;
  const consortiumCount = DATA.faculty.filter((f) => f.consortium).length.toLocaleString();
  els.footerNote.innerHTML = `
    Built on the same faculty dataset as the
    <a href="${escapeHtml(DATA.explorer_site_url || 'https://crimconsortium.github.io/criminology-faculty-explorer/')}" target="_blank" rel="noopener">Criminology PhD Faculty Explorer</a>.
    Currently indexing ${facultyCount} faculty across ${institutionCount} departments,
    including ${consortiumCount} at <a href="https://crimrxiv.com/consortium" target="_blank" rel="noopener">CrimRxiv Consortium</a> institutions.
    Data compiled ${escapeHtml(DATA.build_date || '—')}.
  `;

  // ----------------------------------------------------------------
  //  Boot
  // ----------------------------------------------------------------
  renderQuestion();
})();
