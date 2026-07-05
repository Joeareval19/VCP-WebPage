**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 95/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No registered CI beyond this audit (pre-#9); no local lint configured — normal |
| Spec compliance | 22/25 | 4 of 5 criteria demonstrably met; "all durations from tokens" partially unmet (1800ms breathe + handoff delays hardcoded) |
| Correctness under stress | 23/25 | All exercised flows survived; reduced-motion and bfcache paths verified by code-reading only (CDP media emulation deny-listed on this runner) |
| Platform integrity | 15/15 | All 8 pages console-clean on the PR branch; non-nav links unaffected; additions are append-only and class-scoped |
| Security | 10/10 | Injected `<img onerror>` title renders as inert literal text via `attr()`; no dialogs, no console errors |

### Machine checks
- `gh pr checks`: only check is `audit` (this run) — pending, not a failure.
- Local lint/build/test: no package.json, no lint configured — normal pre-#9, not a finding.

### Spec compliance
- [x] Clicking any internal nav tab produces the full dip with approved timings; non-tab links unaffected — live click index→research measured: `vcp-dip--in` + `data-dip-title` at click, navigation ~340ms later, destination `--hold` → `--out` at ~720ms → fully cleared at ~1981ms (MutationObserver timeline). Project-card link, `/#about` anchor, aria-current tab, ctrl-click, and middle-click all navigated natively with zero dip classes and no sessionStorage writes.
- [x] No flash of the destination page before the overlay — pre-paint inline snippet is parser-blocking in `<head>`; overlay class present before observer could attach; hold-state screenshot shows full black + eyebrow + sheen title.
- [x] `prefers-reduced-motion` → instant navigation, zero animation — verified by code-reading only (three independent guards: JS click-handler early return, pre-paint snippet matchMedia check, CSS `display:none` + both dip tokens zeroed). Runtime emulation unavailable: `Emulation.setEmulatedMedia` is deny-listed in the browse CDP allowlist.
- [ ] All durations/colors/fonts from tokens — partially. `--dur-dip-in`/`--dur-dip-out` are proper tokens (zeroed under reduced motion), colors/fonts all token-sourced. But the breathe animation duration (1800ms, ×3) and handoff delays (-340ms, -1040ms) are hardcoded in components.css, mirrored by `NAV_DELAY = 340` and the 1250ms cleanup in page-dip.js. See finding 1.
- [x] demo.html updated — section 10 + "Preview the dip" button; full cycle observed (`--in` → `--hold` → `--out` → clean, attribute removed).

### Stress tests performed
Served the PR checkout via `npx http-server -p 8317`; drove headless Chromium (gstack browse daemon).

- **Full origin→destination ride:** clicked Research tab on index — immediate state `{cls: "vcp-dip vcp-dip--in", data-dip-title: "Research", sessionStorage: "Research"}`, still on index (delayed nav); landed on /research.html with key consumed and full cleanup after the cycle.
- **Destination timeline (MutationObserver):** `--hold` from pre-paint → `--out` at t≈720ms → all classes and attribute cleared at t≈1981ms. Matches design (700ms min hold + 1100ms fade + margin).
- **Hold-state screenshot:** opaque black, "ENTERING" eyebrow, sheen serif "Research" — matches the approved treatment.
- **Exclusions:** aria-current tab (no dip, native reload), `/#about` cross-page anchor (native, landed on `/#about`, no classes), ctrl-click and middle-click (no dip, no key), project card link `project-detail.html?slug=signal-relay` (native, query intact).
- **Hostile input:** `sessionStorage['vcp-dip-title'] = '<img src=x onerror=alert(1)>🔥' + 400 chars` then arrival — no script execution, no dialogs, no console errors; attr() renders literal text. Cosmetic: the 430-char single token overflows the viewport unwrapped (finding 2) — far outside any real nav label.
- **demo.html preview:** one full in/hold/out/clean cycle, zero console errors.
- **Not runtime-verified:** reduced-motion (CDP denied — code-verified in 3 layers) and bfcache `pageshow` restore (headless CDP session defeats bfcache; the guard reads correctly and clears classes + key).

### Integrity sweep
- Console-error sweep on the PR branch: index, intent, research, projects, library, socials, project-detail, demo — all clean.
- Diff vs origin/main is 11 files, 187 additions, 0 deletions. Each existing page gains exactly 2 lines (head snippet + script include); no existing markup, CSS, or JS was modified.
- New CSS is appended and entirely scoped under `html.vcp-dip*` — inert unless the class is set. z-index 9999 sits above nav (100); `pointer-events: none` keeps the page interactive underneath.
- tokens.css changes are additive (2 new custom properties + their reduced-motion zeroing); no existing token touched.
- The global click listener matches only `.vcp-nav__links a` — footer links (`.vcp-footer__links`), card links, and in-page CTAs verified unaffected.
- telemetry.js, library.js, projects-*.js, research.js, socials.js load and run alongside page-dip.js with no errors on their pages.

### Findings
1. NOTE — css/components.css:803 — the breathe animation duration (1800ms, repeated at :809 and :817) and its handoff delays (-340ms, -1040ms) are hardcoded, and js/page-dip.js:13 (`NAV_DELAY = 340`) and :31 (1250ms cleanup) mirror the token values. The spec's "all durations come from tokens" criterion is only partially met, and the timing contract is duplicated across two files — editing `--dur-dip-in`/`--dur-dip-out` later silently desyncs the handoff and cleanup. Suggest tokenizing the breathe duration and reading the durations in JS via getComputedStyle (or at minimum a comment block naming every coupled constant — the current comments cover only two of them).
2. NOTE — css/components.css:789 — a long unbroken title renders as a single unwrapped line overflowing the viewport (measured with an injected 430-char title). Unreachable from real nav labels (longest is "The Intent") and only same-origin script can set the key, so cosmetic; `overflow-wrap: anywhere` plus side padding on `::after` would close it.
