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
      help: "Describe your interests in your own words \u2014 a sentence or two is plenty. We'll match against what each faculty member lists as their research, plus the same canonical topic list used in the Faculty Explorer. If you'd rather pick from common topics, the list is below.",
      type: 'freetext',
      weightable: true,
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
    // Free-text prompt the user types. The chip set below it stays for users
    // who'd rather pick canonical topics; both signals feed scoring.
    topicsText: '',
    topics: new Set(),
    regions: new Set(),
    states: new Set(),
    rank: 'any',
    openness: 'no',
    weights: Object.assign({}, DEFAULT_WEIGHTS),
    // Cached parse of topicsText — recomputed on Next click
    topicTokens: [],
    topicTaxonomyHits: [], // canonical labels detected in the user's text
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
  //  Dataset stats strip — mirrors the Faculty Explorer's stats block
  // ----------------------------------------------------------------
  (function populateStats() {
    const fac = DATA.faculty;
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const fmt = (n) => n.toLocaleString('en-US');
    setText('stat-faculty', fmt(fac.length));
    setText('stat-institutions', fmt(new Set(fac.map((f) => f.institution)).size));
    setText('stat-consortium', fmt(fac.filter((f) => f.consortium).length));
    // Prefer the explicit build_date (set by build_data.py); fall back to
    // the generated_at timestamp. Render as e.g. "Apr 28, 2026".
    const stamp = DATA.build_date || DATA.generated_at;
    if (stamp) {
      const d = new Date(stamp.length === 10 ? stamp + 'T00:00:00Z' : stamp);
      if (!isNaN(d)) {
        setText('stat-compiled', d.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
        }));
      }
    }
  })();

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
  //  Free-text matching: tokenizer, stemmer, fuzzy matcher
  // ----------------------------------------------------------------
  // The Python builder ships pre-tokenized faculty interests on each record
  // (`_tokens`) and ships the full canonical taxonomy with synonym patterns
  // (`DATA.taxonomy`). Here we tokenize the user's free-text prompt the same
  // way and match it against both signals.
  //
  // Strict substring matching is the foundation. Light stemming makes
  // "police"/"policing"/"policed" all count. Light fuzzy matching tolerates
  // a single-character typo on words >= 5 letters — enough to catch
  // "policng" → "policing" without surfacing nonsense matches.
  // ----------------------------------------------------------------

  const STOPWORDS = new Set((
    'a an and any are as at be been being but by can could did do does doing don ' +
    'for from get had has have having he her hers him his how i in into is it its ' +
    'just me my of on or our ours so some such than that the their theirs them then ' +
    'there these they this those to too us very was we were what when where which ' +
    'who whom why will with would you your yours about above after again all am ' +
    'because before below between both during each few here if more most no nor not ' +
    'only other own same should until up while during also study studying studied ' +
    'research researching researcher work working worker phd mentor mentors ' +
    'mentoring mentorship advisor advisors interest interests interested topic ' +
    'topics area areas focus focuses focused want wanting like'
  ).split(/\s+/));

  // Tokenize free text the same way build_data.py does for faculty interests.
  function tokenize(text) {
    if (!text) return [];
    const cleaned = String(text).toLowerCase().replace(/[^a-z0-9\-' ]+/g, ' ');
    const out = [];
    cleaned.split(/\s+/).forEach((tok) => {
      tok = tok.replace(/^[-']+|[-']+$/g, '');
      if (tok.length < 3) return;
      if (STOPWORDS.has(tok)) return;
      out.push(tok);
    });
    return out;
  }

  // Light suffix stemmer. Returns a short "stem" for matching purposes.
  // Cheap and predictable — we want "policing" ≡ "police" ≡ "policed".
  function stem(word) {
    if (word.length <= 4) return word;
    // Order matters: try longer suffixes first.
    const sufx = ['ization', 'ational', 'tional', 'iveness', 'fulness', 'ousness',
                  'ables', 'ibles', 'ments', 'ingly', 'edly', 'ings',
                  'ization', 'ation', 'ities', 'ment', 'ness', 'less', 'ful',
                  'ies', 'ied', 'ing', 'ers', 'ed', 'es', 's', 'ly', 'er'];
    for (let i = 0; i < sufx.length; i++) {
      const s = sufx[i];
      if (word.length > s.length + 2 && word.endsWith(s)) {
        return word.slice(0, word.length - s.length);
      }
    }
    return word;
  }

  // Levenshtein distance — only used for short comparisons (cap = 1).
  function lev1(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 1) return 2;
    // Allow at most one substitution / insertion / deletion.
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      edits++;
      if (edits > 1) return 2;
      if (a.length === b.length) { i++; j++; }
      else if (a.length > b.length) { i++; }
      else { j++; }
    }
    if (i < a.length || j < b.length) edits++;
    return edits;
  }

  // Does user-token `u` match faculty-token `f`?
  // Strict substring on either side after stemming, plus a single-typo
  // fallback on words >= 5 letters.
  function tokensMatch(u, f) {
    if (!u || !f) return false;
    if (u === f) return true;
    const su = stem(u), sf = stem(f);
    if (su === sf) return true;
    // Substring on stems (catches "policing"/"police-community"-style)
    if (su.length >= 4 && sf.includes(su)) return true;
    if (sf.length >= 4 && su.includes(sf)) return true;
    // One-edit fuzzy on stems, only when both are reasonably long
    if (su.length >= 5 && sf.length >= 5 && lev1(su, sf) <= 1) return true;
    return false;
  }

  // Apply the canonical taxonomy patterns to free text. Mirrors the
  // build_data.py / Explorer logic so users typing "cops" or "law enforcement"
  // both surface the Policing tag. Patterns are matched as substrings on the
  // raw lowercased text (not on tokens) so multi-word phrases like
  // "law enforcement" still work.
  function detectTaxonomyHits(text) {
    if (!text) return [];
    const low = String(text).toLowerCase();
    const hits = [];
    (DATA.taxonomy || []).forEach((entry) => {
      if (entry.patterns.some((p) => low.includes(p))) hits.push(entry.label);
    });
    return hits;
  }

  // For one faculty member, count how many of the user's tokens overlap
  // with their pre-tokenized interests. Returns {hits, matchedUserTokens}.
  // matchedUserTokens is the set of *user words* that landed — these are
  // what we surface in the explanation card.
  function tokenOverlap(userTokens, facultyTokens) {
    if (!userTokens.length || !facultyTokens.length) {
      return { hits: 0, matchedUserTokens: [] };
    }
    const matched = new Set();
    let hits = 0;
    for (const u of userTokens) {
      for (const f of facultyTokens) {
        if (tokensMatch(u, f)) {
          hits += 1;
          matched.add(u);
          break; // each user token counts once max
        }
      }
    }
    return { hits, matchedUserTokens: Array.from(matched) };
  }

  // De-dupe user tokens before matching; preserves order.
  function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) { if (!seen.has(x)) { seen.add(x); out.push(x); } }
    return out;
  }

  // ----------------------------------------------------------------
  //  Question rendering
  // ----------------------------------------------------------------
  // Example prompts for the free-text topic question. Click to fill the
  // textarea — a low-friction nudge for users who don't know where to start.
  const TOPIC_EXAMPLES = [
    'Police use of force and accountability in marginalized communities',
    'Why young people stop offending as they age',
    'Wrongful convictions and prosecutorial decision-making',
    'Cybercrime and online fraud',
    'Race, sentencing, and the death penalty',
    'Gun violence prevention and community-based interventions',
  ];

  function renderQuestion() {
    const q = QUESTIONS[currentStep];

    let bodyHtml;
    if (q.type === 'freetext') {
      bodyHtml = renderFreeTextTopics();
    } else {
      const optionsHtml = q.options().map((opt) => renderOption(q, opt)).join('');
      bodyHtml = `<div class="${q.type === 'multi' ? 'option-grid' : 'option-list'}" role="${q.type === 'multi' ? 'group' : 'radiogroup'}">${optionsHtml}</div>`;
    }

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
      ${bodyHtml}
      ${extraHtml}
      ${weightHtml}
    `;

    // Wire up option inputs
    els.quizCard.querySelectorAll('input[type=checkbox], input[type=radio]').forEach((inp) => {
      inp.addEventListener('change', () => onOptionChange(q, inp));
    });

    // Free-text wiring (textarea + example pills + collapsible chip fallback)
    if (q.type === 'freetext') {
      const ta = $('topics-text');
      if (ta) {
        ta.value = ANSWERS.topicsText;
        ta.addEventListener('input', () => { ANSWERS.topicsText = ta.value; });
      }
      els.quizCard.querySelectorAll('.example-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = btn.getAttribute('data-example') || '';
          ANSWERS.topicsText = v;
          if (ta) { ta.value = v; ta.focus(); }
        });
      });
      const fallbackToggle = $('fallback-topics-toggle');
      const fallbackBox = $('fallback-topics-box');
      if (fallbackToggle && fallbackBox) {
        fallbackToggle.addEventListener('click', () => {
          const open = fallbackBox.style.display !== 'none';
          fallbackBox.style.display = open ? 'none' : 'block';
          fallbackToggle.textContent = open ? 'Or pick from common topics' : 'Hide common topics';
          fallbackToggle.setAttribute('aria-expanded', String(!open));
        });
      }
    }
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

  function renderFreeTextTopics() {
    // Examples — click to populate the textarea
    const exampleChips = TOPIC_EXAMPLES
      .map((ex) => `<button type="button" class="example-pill" data-example="${escapeHtml(ex)}">${escapeHtml(ex)}</button>`)
      .join('');

    // Canonical chip fallback — same labels as the explorer's keyword list
    const fallbackOpen = ANSWERS.topics.size > 0;
    const chips = DATA.topics
      .map((t) => `<label class="topic-chip"><input type="checkbox" value="${escapeHtml(t)}" data-fallback-topic ${ANSWERS.topics.has(t) ? 'checked' : ''} /><span>${escapeHtml(t)}</span></label>`)
      .join('');

    return `
      <div class="freetext-block">
        <textarea
          id="topics-text"
          class="freetext-input"
          rows="4"
          placeholder="For example: I want to study how policing affects immigrant communities, especially around procedural justice and trust."
          autocomplete="off"
          spellcheck="true"
        ></textarea>
        <div class="example-pills-label">Or try one of these:</div>
        <div class="example-pills">${exampleChips}</div>
        <div class="fallback-topics">
          <button type="button" class="fallback-topics-toggle" id="fallback-topics-toggle" aria-expanded="${fallbackOpen}">
            ${fallbackOpen ? 'Hide common topics' : 'Or pick from common topics'}
          </button>
          <div id="fallback-topics-box" style="display:${fallbackOpen ? 'block' : 'none'};margin-top:var(--space-3)">
            <div class="fallback-topics-help">These are the same canonical tags used in the Faculty Explorer. They feed the same scoring as your free-text prompt.</div>
            <div class="topic-chip-grid">${chips}</div>
          </div>
        </div>
      </div>
    `;
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

  // Delegated handlers for chips outside the main option list
  document.addEventListener('change', (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement)) return;
    if (inp.closest('.state-grid')) {
      if (inp.checked) ANSWERS.states.add(inp.value);
      else ANSWERS.states.delete(inp.value);
    }
    if (inp.hasAttribute('data-fallback-topic')) {
      if (inp.checked) ANSWERS.topics.add(inp.value);
      else ANSWERS.topics.delete(inp.value);
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
    ANSWERS.topicsText = '';
    ANSWERS.topicTokens = [];
    ANSWERS.topicTaxonomyHits = [];
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

  // Parse the user's free-text prompt into tokens + canonical taxonomy hits.
  // Called once at finishQuiz() (and also useful if we ever want to preview
  // matches mid-flow). Idempotent.
  function parseTopicPrompt() {
    ANSWERS.topicTokens = uniq(tokenize(ANSWERS.topicsText));
    ANSWERS.topicTaxonomyHits = detectTaxonomyHits(ANSWERS.topicsText);
  }

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

    // --- Topics --------------------------------------------------------
    // Two signals combine into the topic sub-score:
    //   (a) Canonical-tag fit: of the topic tags the user's text triggered
    //       (plus any chips they checked), what fraction does this faculty
    //       member also have?
    //   (b) Phrase overlap: of the meaningful tokens in the user's text,
    //       what fraction appear in this faculty member's interests?
    // We blend (a) and (b). Tag fit is heavier because it rewards conceptual
    // alignment, not just literal word reuse.
    //
    // Effective tag set the user wants = canonical hits from text ∪ checked chips.
    const wantedTags = new Set([...ANSWERS.topicTaxonomyHits, ...ANSWERS.topics]);
    const tagsHit = [];
    wantedTags.forEach((t) => { if (f.topics.includes(t)) tagsHit.push(t); });

    const overlap = tokenOverlap(ANSWERS.topicTokens, f._tokens || []);

    let topicScore = 0;
    let usedAnyTopicSignal = false;
    if (wantedTags.size > 0) {
      topicScore += 0.7 * (tagsHit.length / wantedTags.size);
      usedAnyTopicSignal = true;
    }
    if (ANSWERS.topicTokens.length > 0) {
      // Cap denominator so the score doesn't get diluted by very long prompts;
      // 6 distinct content words is plenty of signal.
      const denom = Math.max(3, Math.min(6, ANSWERS.topicTokens.length));
      topicScore += 0.3 * Math.min(1, overlap.hits / denom);
      usedAnyTopicSignal = true;
    }
    // If only one signal exists, scale up so a strong text-only or chip-only
    // prompt still maxes out at 1.0.
    if (usedAnyTopicSignal) {
      const cap = (wantedTags.size > 0 ? 0.7 : 0) + (ANSWERS.topicTokens.length > 0 ? 0.3 : 0);
      subs.topics = cap > 0 ? Math.min(1, topicScore / cap) : 0;
    } else {
      subs.topics = 0;
    }
    subs._tagsHit = tagsHit;
    subs._wantedTags = Array.from(wantedTags);
    subs._matchedWords = overlap.matchedUserTokens;
    subs._userTokenCount = ANSWERS.topicTokens.length;

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
    parseTopicPrompt();
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

    // Show the user how their topic prompt was parsed — transparent and
    // reassuring. List the canonical topics we detected; if none, fall back
    // to the literal words we'll match against.
    let topicLine = '';
    const detectedTags = uniq([...ANSWERS.topicTaxonomyHits, ...ANSWERS.topics]);
    if (detectedTags.length > 0) {
      const tags = detectedTags.map((t) => `<span class="topic-tag">${escapeHtml(t)}</span>`).join(' ');
      topicLine = ` We read your prompt as covering: ${tags}.`;
    } else if (ANSWERS.topicTokens.length > 0) {
      const words = ANSWERS.topicTokens.slice(0, 8).map((w) => `<em>${escapeHtml(w)}</em>`).join(', ');
      const more = ANSWERS.topicTokens.length > 8 ? '…' : '';
      topicLine = ` Your prompt didn't trigger any of the canonical topic tags, so we matched on your words directly: ${words}${more}.`;
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

    // Topics — surface canonical-tag hits AND the actual words from the
    // user's prompt that landed in the faculty's interests.
    if (w.topics > 0 && (ANSWERS.topicTokens.length > 0 || ANSWERS.topics.size > 0)) {
      const tagsHit = r.subs._tagsHit || [];
      const wantedTagsCount = (r.subs._wantedTags || []).length;
      const matchedWords = r.subs._matchedWords || [];

      if (tagsHit.length > 0) {
        if (wantedTagsCount > 0 && tagsHit.length === wantedTagsCount) {
          reasons.push({
            ok: true,
            html: `Works in every topic your prompt suggested: ${tagsHit.map(tag).join(' ')}.`,
          });
        } else if (wantedTagsCount > 0) {
          reasons.push({
            ok: true,
            html: `Matches ${tagsHit.length} of ${wantedTagsCount} topic ${pluralize(wantedTagsCount, 'area', 'areas')} your prompt suggested: ${tagsHit.map(tag).join(' ')}.`,
          });
        } else {
          reasons.push({
            ok: true,
            html: `Works in ${tagsHit.map(tag).join(' ')}.`,
          });
        }
      }

      if (matchedWords.length > 0) {
        const shown = matchedWords.slice(0, 5).map((w) => `<em>${escapeHtml(w)}</em>`).join(', ');
        const more = matchedWords.length > 5 ? ` +${matchedWords.length - 5} more` : '';
        reasons.push({
          ok: true,
          html: `Your words found in their listed interests: ${shown}${more}.`,
        });
      }

      // No tag hits, no word hits, but they do have *some* interests —
      // surface them so the user sees why this person still ranked well.
      if (tagsHit.length === 0 && matchedWords.length === 0 && f.topics.length > 0) {
        reasons.push({
          ok: false,
          html: `Didn't tag any of your prompt's topics directly, but they work on ${f.topics.slice(0, 3).map(tag).join(' ')}.`,
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
