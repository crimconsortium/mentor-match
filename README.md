# Mentor Match — Criminology PhD Companion

A short, transparent quiz that helps prospective criminology and criminal-justice PhD students discover likely mentors among faculty across the field.

A companion to the [Criminology PhD Faculty Explorer](https://crimconsortium.github.io/criminology-faculty-explorer/), supported by [CrimConsortium](https://crimconsortium.com).

**Live site:** https://crimconsortium.github.io/mentor-match/

## What it is

- Four quick questions: research interests, location, faculty rank, openness to open scholarship.
- A weighted scoring engine — no hard filters, no vetoes. A faculty member can still appear even if they're not a perfect match on every dimension.
- Each result card explains *why* that person ranked where they did.
- Results link out to the faculty member's official profile, their department page, and their entry in the Faculty Explorer.

## Privacy

- Fully client-side (HTML/CSS/vanilla JS).
- No backend, no database, no cookies, no `localStorage` or `sessionStorage`, no analytics.
- Your answers stay in your browser and are never sent or saved.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure, header/footer, CTA copy. |
| `style.css` | Design system — copied from the Faculty Explorer (warm-paper light + true-black dark, `#f68212` accent). |
| `app.js` | Quiz flow, weighted scoring, explanation generator. **Most edits happen here.** |
| `faculty.js` | Auto-generated faculty dataset. Do not edit by hand — rerun `build_data.py`. |
| `build_data.py` | Rebuilds `faculty.js` from the Explorer's `data.json`, adding state / US-region / country fields. |

## Editing

Common edits, with file pointers:

- **Quiz questions, options, labels** → `QUESTIONS` array in `app.js`
- **Default weights per dimension** → `DEFAULT_WEIGHTS` in `app.js`
- **Scoring math** → `scoreFaculty()` in `app.js`
- **Card explanations** → `explainMatch()` in `app.js`
- **CrimConsortium CTA copy** → `index.html` (`.hero-cta` blocks)
- **Topic taxonomy** → `KEYWORD_TAXONOMY` in `build_data.py` (rerun after editing)
- **Institution → state / region / country map** → `INSTITUTIONS` in `build_data.py`

## Rebuilding the faculty data

```bash
python3 build_data.py
```

This pulls the latest `data.json` from the [`criminology-faculty-explorer`](https://github.com/crimconsortium/criminology-faculty-explorer) repo and writes a fresh `faculty.js`. The two sites always share the same underlying records.

## Deploying

Pushes to `main` are published automatically by GitHub Pages. No build step.

## Credit

Supported by [CrimConsortium](https://crimconsortium.com). Make your criminology research open at [CrimRxiv](https://crimrxiv.com).
