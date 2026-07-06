**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

_Re-audit after fix commit 2df39e7. The prior audit's two findings (destination cross-fade no-op; dropped hash bail) are resolved: the destination now raises a distinct `html.vcp-fade--in` veil (components.css) and `if (url.hash) return;` is restored (page-dip.js:138). One new BLOCKER surfaced under stress — it was present in the branch the prior pass reviewed but not caught._

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 23/25 | No CI yet (#9, expected pre-pipeline); `node --check` passes on both changed JS files; no package.json/lint (normal pre-#9). No failures; reduced automated signal. |
| Spec compliance | 18/25 | Triangle fully removed, dip/fade unified, seen-set re-keyed on pathname+search, demo rewritten. Docked because the bfcache guard defect breaks "never a hard cut" / "go back and reopen → cross-fade" on the spec's own named QA flow. |
| Correctness under stress | 17/25 | 15/15 origin-side decision cases correct against the real IIFE. Docked for the stuck-`navigating` flag after bfcache restore (BLOCKER). |
| Platform integrity | 14/15 | Clean deletion; all 8 pages updated (script tag + pre-paint snippet); consumers verified. |
| Security | 10/10 | `data-dip-title` is `escapeHtml`-wrapped at the injection site (projects-index.js:26); no secrets; no new injection surface. |

BLOCKER present → capped at 69.

### Machine checks
- `gh pr checks`: no checks reported — CI not yet configured (#9), not a finding.
- Local lint/build/test: no package.json — no lint configured pre-#9, not a finding.
- `node --check js/page-dip.js`: pass.
- `node --check js/projects-index.js`: pass.

### Spec compliance
- [x] No triangle anywhere — `js/page-loader.js` deleted from disk; grep for `vcp-loader`/`vcp-loading`/`page-loader`/`penrose`/`metal-dark`/`metal-mid` returns zero hits in shipped html/css/js (only a components.css comment, demo prose, and prior audit files). Pre-paint loader snippet + `<script>` tag removed from all 8 pages; `--metal-dark`/`--metal-mid` tokens removed.
- [~] Project card first visit dips with the project name, repeat cross-fades — decision logic correct in simulation; degrades to native hard-cut after a bfcache Back (Finding 1).
- [~] Nav tabs: first visit dips, repeat cross-fades, never a hard cut — holds on fresh loads; violated after bfcache restore (Finding 1).
- [x] `prefers-reduced-motion` → native immediate — click handler bails on `reduced.matches`; fade `::before` is `display:none` under reduced-motion; `--dur-med` collapses to 0ms. Modified clicks, `target`, `download`, cross-origin, hash, current-page all → native (verified in simulation).
- [x] bfcache restore never resurfaces a stale overlay — `pageshow` persisted handler clears all dip+fade classes and both sessionStorage keys.
- [x] sessionStorage unavailable → no errors — every access try/caught; degrades to always-first-visit + no veil persistence, a consistent default.
- [x] demo.html documents fade + first-visit-dip, not the loader — section 11 rewritten, Penrose figure and its script tag removed.

### Stress tests performed
- Extracted the exact origin-side decision function from `js/page-dip.js` and ran 15 cases (nav-tab first/repeat, project card first/repeat, title-less internal link, same-page hash, cross-page hash `/library.html#id`, `target=_blank`, cross-origin, `download`, `mailto:`, `tel:`, modified click, reduced-motion, current-page-with-query). All 15 produced the spec's behavior-matrix outcome. `mailto:`/`tel:` resolve to a non-http origin ≠ page origin → native (they were never intercepted by the old nav-only selector either).
- Drove the **actual shipped IIFE** through a DOM shim over the bfcache sequence: fresh-page click → intercepted (`preventDefault` true). Fired `pageshow{persisted:true}`. Second click → **not intercepted** (`preventDefault` false) because `navigating` is still `true`. Confirms Finding 1 against the real code.
- Confirmed no `unload`/`beforeunload`/`no-store` anywhere in the script stack → pages are bfcache-eligible, so the restore path is reachable in Chrome/Firefox/Safari.

### Integrity sweep
- **Blast radius of the broadened click selector.** The handler moved from `.vcp-nav__links a` to `a[href]`, so every internal same-origin non-hash link now transitions. Enumerated every link source: static HTML hrefs (`/`, nav targets → intended transition); voice widget #43 (all `<button>`, never matched); `library.js` Read/Download links (`target=_blank` / `download` → native); `research.js` related-paper links (`/library.html#slug` → hash bail, native); `projects-detail.js` specifics URLs (external `target=_blank` → native) and related-item links (`item.href`; all 3 projects have `related: null`, so that path emits nothing today); `projects-detail.js` back-links (`href="projects.html"` → intended cross-fade/dip). No consumer breaks.
- **Token removal.** `--metal-dark`/`--metal-mid` had exactly one consumer — the deleted loader SVG. `--scrim` retained (the veil still uses it). Grep-clean.
- **Page parity.** All 8 HTML pages load `js/page-dip.js` and carry the `#107` fade pre-paint snippet; none still load `page-loader.js`.
- **Not browser-QA'd** — no live browser this session; logic verified by driving the real IIFE headless. Animation *look* (timing/sheen fidelity) is unverified; the *logic* is.

### Findings
1. BLOCKER — js/page-dip.js:107,142,144 (fix at :95–102) — the module-level `navigating` flag is set `true` on transition and never reset. On bfcache Back-restore the IIFE does not re-run, so `navigating` stays `true`; the `pageshow{persisted}` handler (lines 95–102) clears overlay classes and both sessionStorage keys but not this flag. Every subsequent internal-link click then hits `if (navigating) return` before `preventDefault`, so it navigates natively with no dip/fade — a hard cut. This violates the acceptance criteria "nav tabs... never a hard cut" and "click a project card, go back, reopen it (cross-fade)" on the spec's own named QA path. Fix: add `navigating = false;` inside the `if (e.persisted)` block. Evidence: drove the real IIFE — click #1 intercepted (true); after `pageshow{persisted:true}`, click #2 not intercepted (false).
