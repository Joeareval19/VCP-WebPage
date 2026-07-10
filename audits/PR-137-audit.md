**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 97/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | All registered CI checks pass; no local lint configured (normal pre-#9) |
| Spec compliance | 23/25 | All six acceptance criteria of #136 verified with evidence; −2: spec's desired behavior called for a *collapsible* annual table (PR body even says "Collapsed") but the shipped table is always open |
| Correctness under stress | 24/25 | Real renderer harness + real headless-Chrome render both green; chart math cross-checked three ways; −1: native `<title>` hover not interactively exercised (screenshot cannot capture it) |
| Platform integrity | 15/15 | Every untouched slug and both not-found paths byte-identical to main through the real renderer; CaneyCloud/demo pages re-rendered live; 375px behavior identical to main |
| Security | 10/10 | Static markup only — no script, no event handlers, no external references; stays within the documented trusted-HTML contract |

### Machine checks
- `gh pr checks`: Vercel — pass (deployment completed); Vercel Preview Comments — pass; audit — pending (this run).
- Local lint/build/test: no package.json — no local tooling configured yet (pre-#9, not a finding).

### Spec compliance
- [x] AC1 — chart renders in the Business model section at `/project-detail.html?slug=vamosavenezuela`: verified in real headless Chrome against a local static server; screenshot shows the SVG inside section `03 Business model` with axis labels, year separators, seasonal sawtooth, and the `$352k / mo` end label.
- [x] AC2 — one y-scale, single series, no legend, title names the measure: one profit axis ($0–$400k, 6 gridlines); one `path` series + area fill; no legend; `<h3>` "Five-year revenue forecast" plus lead-in prose naming monthly platform profit at 10% commission; figure `aria-label` restates it.
- [x] AC3 — colors/fonts exclusively via tokens, series contrast ≥ 3:1: every `fill`/`stroke`/`font-family` in the SVG is `var(--line)`, `var(--text-faint)`, `var(--text)`, `var(--silver-bright)`, `var(--font-mono)`, or `transparent` — all defined in `css/tokens.css`. Computed contrast `--silver-bright` #E8EAED vs `--bg` #0B0C0E = 16.3:1. Chrome screenshot confirms the `var()` presentation attributes resolve (new technique on this site — vcp-chart.js uses classes — so this was verified live, not assumed).
- [x] AC4 — hovering any month reveals month, GMV, profit: 60 transparent hover rects, each with a native `<title>` of the form "Year N · Mon — bookings $X · profit $Y"; every rect band centers on its data point (max misalignment 0px, checked programmatically).
- [x] AC5 — annual table matches the plotted series: monthly profits recovered from the plotted path coordinates match the hover-title profits within display rounding (max $556 at month 36); yearly sums of the hover values ($130k/$434k/$1.16M/$2.16M/$2.84M) match the table rows ($131k/$435k/$1.2M/$2.2M/$2.8M); GMV/profit pairs consistent at 10% (max deviation 0.74pp, pure display rounding); totals $66.9M GMV / $6.72M profit match the $67M/$6.7M table row.
- [x] AC6 — JSON valid, other projects unaffected: `data/projects.json` parses clean under Node; caneycloud and pipa-database entries are semantically identical to main field-by-field (the CaneyCloud chart arrays were re-indented by the JSON tooling — values byte-equal after parse); vamosavenezuela outside `business_model` identical; the original business-model prose is preserved verbatim as a prefix (out-of-scope constraint "don't change existing prose" respected).
- In-scope check on the extras: `.placeholder-note` promotion to `css/components.css` + demo.html swatch is DESIGN.md rule-6 upkeep (third surface now uses the class), disclosed in the PR body — not smuggled work.

### Stress tests performed
- **Node vm harness** executing the unmodified `js/projects-data.js` + `js/projects-detail.js` (stubbed DOM/fetch) against PR data vs main data: vamosavenezuela renders 16,619 chars vs 3,111 on main; divergence is confined to a single span starting exactly at the end of the existing prose paragraph (common prefix 2,333 chars, common suffix 778); section numbering unchanged (01 Overview | 02 Moat | 03 Business model | 04 Specifics) both sides.
- **Real browser**: headless Chrome 1280px render of the page — chart, hover-rect layer, end label, and table all present and styled; token vars resolved in SVG presentation attributes.
- **Structure**: SVG tag-balance check passes (147 opens / 147 closes-or-self-closed); 60 titles, 60 rects, 60 line points; no `<script>`, no event handlers in the fragment.
- **375px width**: page renders with the same horizontal clipping as main renders (verified against an origin/main worktree served identically) — pre-existing site behavior, not introduced or worsened by this PR.
- Not run: interactive hover of the native `<title>` tooltips (not screenshot-able); relied on 60/60 well-formed titles + aligned hit rects.

### Integrity sweep
- **Blast radius**: `business_model` is consumed only by `js/projects-detail.js` (render + blank-check), unchanged by this PR. `.placeholder-note` now exists globally; intent.html, paper-caneycloud.html, and index.html each declare page-local copies *after* the components.css link, so the cascade keeps their existing appearance (index's variant uses `--text-soft` and still wins). Global rule verified live on demo.html.
- **Untouched pages**: caneycloud, pipa-database, unknown-slug, and no-slug renders byte-identical PR vs main through the real renderer; caneycloud page additionally re-rendered in headless Chrome (carousel, distro card, rate calculator all live); demo.html renders with the new swatch.
- **Data compatibility**: no schema change — one HTML-string field extended, one CSS class added; JSON re-indent verified value-identical after parse.
- **Test suite**: none exists yet (#9) — nothing to run.

### Findings
1. NOTE — data/projects.json:424 — the annual summary table is always expanded; issue #136's desired behavior specifies "a collapsible annual summary table" and the PR body claims "Collapsed annual table." Wrap the table in `<details><summary>Annual figures</summary>…</details>` (native, no-JS, works in the trusted-HTML renderer) or note the deliberate deviation on the ticket. Acceptance criteria as written are all met, so this does not block.
