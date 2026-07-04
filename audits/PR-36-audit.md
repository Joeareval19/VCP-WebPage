**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 23/25 | No CI registered yet (#9), no local lint — normal pre-#9, nothing failed. Substitute: headless render of all 7 routes, zero page/console errors (one favicon.ico 404 is site-wide and pre-existing on main). |
| Spec compliance | 17/25 | Criteria 1–3 demonstrably met. Criterion 4 (responsive) fails on detail pages at 320–414px — see finding 1. Design-system-only holds: every CSS var used resolves in `tokens.css`, new components documented in `demo.html` per DESIGN.md rule 6. |
| Correctness under stress | 22/25 | 46/46 logic/injection/malformed-data harness checks passed. −3: the browser-level responsive stress pass is what surfaced finding 1. |
| Platform integrity | 15/15 | `index.html` diff is six href-only changes; `components.css` additions are append-only with zero selector collisions vs main; `demo.html` `#details` anchors still resolve after section renumber; all assets serve 200; no other page touched. |
| Security | 9/10 | Hostile-input escaping verified end-to-end. −1: rich-text fields are a by-design raw-HTML surface (finding 3). |

Raw sum 86; BLOCKER rule caps the score at 69.

### Machine checks
- `gh pr checks`: only the audit run itself (pending) — CI not yet configured (#9), not a finding per lint-first.
- Local lint/build/test: no package.json — no toolchain pre-#9, not a finding.
- Substitute checks run on the branch: `data/projects.json` parses clean (3 projects, timelines of exactly 1/5/20); all 12 site assets return 200 over a local server; headless Edge render of index, projects index, all 3 detail slugs, bad-slug, and no-slug routes: zero page errors, zero console errors attributable to this PR.

### Spec compliance
- [x] Index renders from structured data; detail pages generated from the same source — both renderers read `data/projects.json` via the shared `js/projects-data.js` loader; detail is one template keyed by `?slug=`, no per-project HTML.
- [x] Detail template renders all 7 sections; empty optional sections collapse cleanly — verified by executing the actual renderer against all 3 placeholder projects: sections present/absent exactly matching each project's data, no orphan headings (signal-relay renders 3 sections, meridian all 7).
- [x] Timeline renders correctly with 1, 5, and 20 milestones — one placeholder project per case, milestone dot count verified equal to data length in both the DOM harness and headless browser. Also survived 200 milestones (10× spec max).
- [ ] **Responsive**; design-system components only — the components half holds (tokens verified, `.vcp-kv` reused, new `.vcp-chip`/`.vcp-timeline`/`.vcp-panel`/`.vcp-prose`/`.vcp-detail-header` added to `components.css` and documented in `demo.html`). The responsive half fails: every detail page has 62px of horizontal scroll at 320–414px viewports (finding 1). The projects index is clean at all 8 widths tested (320–1440).

### Stress tests performed
- **Renderer harness (Node, executing the PR's actual JS against a DOM stub): 46/46 passed.** All 3 real slugs (section presence, milestone counts, title); no-slug and unknown-slug → not-found state; 500-char and `<script>`-bearing slugs never echoed into the DOM; hostile record with script tags in name/status/client/timeline/specifics keys+values/related labels+hrefs → everything escaped, no attribute breakout, no live `<script>`; 600-char note + emoji fine; 200-milestone timeline renders fully; record missing required `timeline` and record with only a slug both degrade to the error message instead of half-rendering; fetch 404 and network rejection show error states on both pages.
- **Index interaction (headless Edge, real click events):** filter Active → exactly 1 card, back to All → 3; zero-match filter shows the empty message; 0-project dataset shows empty state.
- **Responsive sweep (headless Edge, 8 widths 320–1440, all 7 routes):** index, landing, and not-found routes: zero overflow, zero viewport escapees at every width. All 3 detail routes fail at 320/375/414 — `documentElement.scrollWidth` 437 vs viewport, and meridian's business-model table escapes the viewport by ~19px (11 escaping elements at 375px). Culprits isolated by element probe (finding 1).

### Integrity sweep
- `index.html`: diff vs origin/main is exactly six `href` swaps `/projects` → `/projects.html` (nav, 4 card links, footer) — no structural change; page renders headless with zero errors and zero overflow at all widths. No stale `/projects` hrefs remain anywhere.
- `css/components.css`: additions are append-only; grepped origin/main for `.vcp-chip|.vcp-panel|.vcp-timeline|.vcp-detail-header|.vcp-prose` — no pre-existing definitions, so no existing page can change appearance. `.vcp-kv` correctly reused rather than redefined. Raw px paddings and rgba shadow tints match 33 pre-existing instances of the same idiom on main.
- `demo.html`: section 08 inserted, old Details renumbered 08→09; all `href="#details"`/`#cards`/`#narrative` anchors still resolve.
- Untouched pages: diff vs fresh origin/main touches only the 9 declared files.
- Unverified: nothing consumes the new JS/CSS outside the two new pages; `/research` and `/library` nav links are dead until #3/#5 land — pre-existing on main, not this PR's doing.

### Findings
1. **BLOCKER — responsive criterion fails on detail pages at mobile widths (320–414px).** Two independent culprits, both measured in headless Edge:
   (a) `data/projects.json` + `project-detail.html:27` — the unbreakable token `[PLACEHOLDER]` in every project name renders at 56px (`.vcp-detail-header h1`, no step-down below `--fs-56`, no `overflow-wrap`), giving the h1 a 413px min-content width → 62px of horizontal scroll on every detail page at iPhone widths. Measured: realistic names ("Atlas Underwriting Engine") fit at 375px; the shipped placeholder data does not — and the site merges with the placeholder data live. A one-line `overflow-wrap: anywhere` on the h1 (or a mobile font step-down) also future-proofs against any long real name.
   (b) `css/components.css` `.vcp-prose table` — no mobile overflow strategy; the 3-column business-model table's intrinsic min-content width (~394px) escapes 320–375px viewports with realistic cell text. Needs `overflow-x: auto` on the table or a wrapper. This one is template-level and survives real content.
   Precedent: the PR-22 landing-page audit held this same criterion to zero overflow at 320–1440.
2. NOTE — `projects.html:73` — comment says the grid is rendered by `js/projects.js`; the actual file is `js/projects-index.js`. Trivial, fix when touching the file.
3. NOTE — `js/projects-detail.js:53-58` — `overview`/`moat`/`business_model` are injected as raw HTML by documented design. Correct for this content model, but it makes `data/projects.json` an HTML-injection surface: future content-only PRs to that file must be reviewed as code, not prose. Escaping of every other field was verified against hostile input and held.
4. NOTE — the `/projects.html` vs `/projects` URL convention (author self-flagged): agreed this needs one reconciliation pass across #3/#5/#29/#30 after all wing PRs land; the six `index.html` link updates here are minimal, correct integration, not scope creep.

The work is close — the data architecture is right, escaping discipline is genuinely good, and the section-collapse logic survived everything I threw at it. Fix the two mobile overflow culprits (both are one-liners) and this clears.
