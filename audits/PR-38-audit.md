**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 94/100

*Re-audit. Supersedes the 93/100 audit at c7e79c9; one commit (dec8196, mobile-overflow fixes + comment correction) landed since. All four outputs replaced per charter.*

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No registered CI (normal pre-#9); no local lint (normal pre-#9). Nothing failed. |
| Spec compliance | 23/25 | All acceptance criteria across #3/#4/#5/#29/#30 re-verified live. −2: off-token CSS values persist against the literal "zero one-off colors/fonts/sizes" criterion (Finding 2). |
| Correctness under stress | 22/25 | 87/89 automated checks passed, including all 27 mobile-overflow probes verifying dec8196. −2: library deep-link filter-clearing branch still unreachable (Finding 1, reproduced live again); −1: missing-date record renders literal "undefined" (unchanged code, carried from prior audit). |
| Platform integrity | 15/15 | components.css additive-only vs main (zero deletions); dec8196's four shared-CSS rule changes verified across consumers at 1440px and 320/375/414px; index.html link-only changes verified live. |
| Security | 9/10 | Hostile slug clean, socials rel/target asserted on every link, escaping correct everywhere exercised. −1: research.js escapeHtml still doesn't escape quotes yet feeds an attribute context (Finding 3, carried). |

### Machine checks
- `gh pr checks`: no checks reported on the branch — CI not yet configured (#9), not a finding. (The log's NativeCommandError is the runner's stderr redirect artifact, not a code failure.)
- Local lint/build/test: no package.json, no lint configured — normal pre-#9.

### Spec compliance
All criteria re-verified live this audit (headless Chromium against a local serve of this checkout):

**#3 Research** — [x] 6 cards from data/research-topics.json · [x] M&A chip → 2 cards, All → 6, no reload, aria-pressed tracks · [x] all related-paper slugs resolve in papers.json; click-through landed, highlighted, and focused the target entry · [x] responsive, no overflow at 320/375/414 · [x] design-system components (token nits in Finding 2)

**#4 Projects** — [x] index + detail from the same data/projects.json via shared loader · [x] optional-section collapse exact: signal-relay renders overview+timeline only; atlas adds moat+specifics; meridian all 7 — no blank headings · [x] timeline live at 1/5/20 milestones · [x] responsive; all 3 detail slugs clean at all 3 phone widths

**#5 Library** — [x] 5 papers from data/papers.json · [x] tag filter (finance→1, +AI OR→3) and date sort both directions verified against actual dates · [x] `#slug` deep link scrolls, highlights, focuses (edge case in Finding 1) · [x] placeholder.pdf returns 200, download attribute names per-slug · [x] responsive

**#29 The Intent** — [x] header, narrative, closing links to all 3 wings verified in DOM · [x] tokens (Finding 2) · [x] responsive at all widths · [x] in shared nav/footer · [x] placeholder-marked

**#30 Socials** — [x] 5 entries from data/socials.json, zero hardcoded · [x] every link asserted `target="_blank"` + `rel` containing both `noopener` and `noreferrer` · [x] tokens · [x] responsive · [x] every entry carries the placeholder flag, aria-labels included

Nothing out of scope: dec8196's CSS additions are fixes to this PR's own components; the projects.html edit is a comment correction.

### Stress tests performed
Served this checkout (python http.server :8399), drove it with puppeteer-core/Chromium 148 — 89 automated assertions, 87 passed:
- All 21 pages/assets return 200; research→library slug cross-validation passes in full.
- Zero console/page errors on all 8 pages and through every filter/sort/deep-link interaction. (One 404 logged on index.html is the browser's automatic /favicon.ico probe — no favicon exists on main either; pre-existing site gap, not this PR.)
- **Mobile overflow (the new code under audit):** 27 probes — 9 routes (6 pages + all 3 detail slugs) × 320/375/414px — `scrollWidth == clientWidth` on every one. dec8196's fix holds, including the 20-milestone + wide-table meridian page at 320px.
- **Desktop regression check on the same shared rules:** meridian business-model table renders 4 rows at block/auto-overflow without collapsing; demo.html prose table intact; footer's 5 wing links stay on one row at 1440; section headings stay single-row baseline-aligned. The flex-wrap additions are inert until width forces them.
- Hostile input: `?slug=<script>alert(1)</script>` → clean not-found, no dialog, no execution; missing slug → not-found.
- Failing edge reproduced (Finding 1): with finance+AI filters active, `hashchange` to filtered-out `#vegas-tech-corridor-map` → filters stay active, entry never appears.

### Integrity sweep
- css/components.css vs main: zero deletion lines — purely additive; pages built on main's components untouched by construction. dec8196's four rule changes (`.vcp-section-heading` wrap, `.vcp-prose table` block+scroll, `.vcp-detail-header h1` overflow-wrap, `.vcp-footer__links` wrap) verified against every consumer at desktop and phone widths, above.
- index.html (only pre-existing page modified): diff is nav/footer/wing-link convention only; renders live with zero console errors. Main's extensionless `/research` links 404 on static hosting — this PR fixes that.
- demo.html renders all new components with no errors.
- Unverified: nothing — all 7 pages plus demo exercised.

### Findings
1. NOTE — js/library.js:122 — carried from prior audit, still present: `focusHash()` early-returns on `if (!target) return` before the filter-clearing block at :125, so the branch that exists to un-hide a deep-linked entry is unreachable in exactly the case it was written for. Reproduced live again this audit. Unreachable through current UI (cross-page links are full navigations, which work), but the code's own comment claims behavior it cannot deliver. Move the lookup after the filter clear.
2. NOTE — off-token values, carried: research.html:44 (`font-size: 11.5px`), library.html:38–47 (raw rgba on the sort select), socials.html:43 (`color: #fff`), plus socials.html's stray empty second `<style>` block (line 155). Recommend the repo-wide tokens pass as follow-up, not a blocker — components.css precedent is mixed.
3. NOTE — js/research.js:106 — carried: `escapeHtml` (div.innerHTML trick) does not escape quotes but feeds the `data-tags` attribute at :90. Harmless with repo-controlled tags; swap in the quote-escaping helper the other three files already use.
4. NOTE — nav consistency, carried: intent.html omits the About link the other six pages carry; projects.html:51 and project-detail.html:50 use `/index.html#about` where the rest use `/#about`. Functionally equivalent, cosmetically inconsistent.

The one commit since the last audit did exactly what it claimed: all 27 mobile-overflow probes pass where the PR #36 audit found 62px of horizontal scroll, and the shared rules it touched hold at desktop. The four carried NOTEs are real but none blocks. This holds.
