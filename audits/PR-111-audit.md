**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 97/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No CI failures; no local lint configured (normal pre-#9). |
| Spec compliance | 23/25 | Every functional acceptance criterion on #109 and #110 met. −2: `demo.html` not touched though the #110 spec listed it in "all 8 pages"; `index.html` meta description still says "research". Both defensible/minor (see Findings). |
| Correctness under stress | 24/25 | Structure sound; redirect robust (4 mechanisms); tokens all resolve. −1: no browser automation on this runner, so 375/900/1440 no-scroll verified by layout analysis, not pixel measurement. |
| Platform integrity | 15/15 | Retired research JS/JSON are inert; all `projects.json` `related` fields are `null` so the projects-detail "Related → Research" panel never renders; no stray `/research.html` links; all 9 assets clients.html references resolve. |
| Security | 10/10 | Static markup only. No secrets, no injection surface, no new data/JS pipeline. |

### Machine checks
- `gh pr checks`: only the self-referential `audit` run, pending — not a code check. No failing checks. Pass.
- Local lint/build/test: "No package.json — no local lint configured yet (pre-#9)". Normal, not a finding.

### Spec compliance

**#109 [30007] — Intent card → Portfolio**
- [x] First card eyebrow reads `Portfolio`; link `Enter the portfolio →`; href stays `/projects.html` (intent.html:210, 214).
- [x] Who-we-are paragraph 'Projects' → 'Portfolio' (intent.html:141).
- [x] No other page changes attributable to this ticket.

**#110 [40002] — Rename Research wing → Clients + Clients shell**
- [x] AC1 — nav + footer read `Clients` → `/clients.html` on all 6 real site pages (index, intent, projects, library, socials, project-detail); no `/research.html` link remains anywhere in the served HTML. (demo.html caveat below.)
- [x] AC2 — clients.html renders header + 2 placeholder testimonial cards (quote + attribution) + 4-tile roster; 22 placeholder markers present.
- [x] AC3 — Intent closing card 3 reads `Clients` / "Testimonials & clients" / "Meet the clients →" → `/clients.html`.
- [x] AC4 — research.html redirects to /clients.html (meta refresh + canonical + `location.replace` + `noindex`).
- [x] AC5 — tokens only (all 17 custom properties used resolve in tokens.css); no new `css/components.css` component was added (page reuses `vcp-card`, `vcp-quote`, `vcp-section-heading`), so the "add to demo.html" clause is correctly not triggered; no-scroll verified structurally (fluid `1fr` grids, no fixed widths, `min-height` only).
- [x] AC6 — Portfolio/Library/Socials/Intent non-card content unchanged (those files' diffs are nav/footer wing-link swaps only).

### Stress tests performed
- **Token resolution:** grepped tokens.css for every custom property clients.html consumes (`--space-2..7`, `--glass-bg`, `--text-faint/soft`, `--fs-12/14/56`, `--font-mono/body`, `--radius`, `--line`, `--silver-bright`) — all 17 defined. Zero one-off colors/sizes; DESIGN.md token law upheld.
- **Component resolution:** every VCP class used (`vcp-section-heading[__num/__rule]`, `vcp-quote`, `vcp-card__body/__eyebrow`, `label-caps--wide`, `vcp-tag--caps`) exists in components.css/base.css. `.placeholder-note` is defined page-local in both clients.html and intent.html — consistent.
- **Structural balance:** node tag-balance check on the structural containers (section/article/div/nav/main/footer/header/ul/blockquote) — clients.html 33/33, research.html 1/1, intent.html 42/42, all balanced. No orphaned tags.
- **Redirect mechanism:** confirmed all four fallbacks on research.html — `<meta http-equiv="refresh" ...url=/clients.html>`, `<link rel="canonical" ...clients.html>`, `<script>location.replace('/clients.html')</script>`, `<meta name="robots" content="noindex">`. Old URL will not 404 and won't compete in search.
- **Asset resolution:** all 9 files clients.html links (3 CSS, 5 JS, favicon) exist on disk.
- **No-scroll (reduced evidence):** no browser automation on this runner. Analyzed layout: roster `repeat(4,1fr)` → `repeat(2,1fr)` ≤900px; testimonials `repeat(2,1fr)` → `1fr` ≤900px; all cells `1fr` with token gaps, no fixed pixel widths, `min-height` (not min-width). No element can force horizontal overflow at 375px. Scored on structure, not measurement.

### Integrity sweep
- **Stray-link sweep:** grep of all HTML for `/research.html` — only hit is the stub's own explanatory comment. Every wing link now points to `/clients.html`.
- **Retired research pipeline:** `js/research.js` + `data/research-topics.json` kept in repo per spec, now unreferenced by any nav. `js/telemetry.js:253` and `data/papers.json` "research" hits are comment/tag/prose strings, not links — inert.
- **projects-detail related panel:** `js/projects-detail.js:132-136` renders a "Related → Research" group only when a project carries `related.research`. Verified `data/projects.json`: all three projects have `related: null`, so the panel never renders. Even if it did, `/research.html` now redirects — no 404.
- **Untouched pages:** projects/library/socials/project-detail diffs are limited to the nav+footer wing-link swap (2 occurrences each). No content, layout, or component change leaked into them.
- **Clients page assets:** confirmed against disk (above) — the new page is fully wired into the existing component/token/JS system, no dangling references.

### Findings
1. NOTE — demo.html:50 (and :216) — `demo.html` still shows a "Research" menu item. The #110 spec listed it among "all 8 pages," but demo.html is the component gallery: its nav links are fabricated anchors (`href="#cards"`), never the site wing link `/research.html`, so no user-facing wing labeled "Research" survives. Recommend updating the demo menu label to `Clients` for consistency with the shipped nav, or explicitly noting in the PR that demo's sample menu is intentionally left as generic filler. Not a blocker — no real navigation is affected.
2. NOTE — index.html:10 — the `<meta name="description">` still reads "The portfolio, research, and white papers…". Outside the nav/footer AC scope, but it is stale wing copy that will surface in search snippets. Recommend "research" → "clients" (or drop it) in a follow-up.

Both are cosmetic/copy gaps, not integrity or correctness defects. The functional rename, the Clients shell, the Intent card swaps, and the redirect are all correct and token-clean.
