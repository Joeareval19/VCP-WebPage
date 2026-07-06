**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No failing check; only the `audit` run (this audit) is pending. No local lint (pre-#9, normal). |
| Spec compliance | 12/25 | Triangle fully removed, tokens/demo updated, reduced-motion honored, seen-set re-keyed — but the destination cross-fade AC is broken and cross-page hash links no longer stay native. |
| Correctness under stress | 12/25 | Origin veil fades up correctly; destination veil never renders (0→0 no-op). Degrades without crashing. |
| Platform integrity | 13/15 | Clean deletion, zero leftover Penrose refs, consumers checked (nav.js no conflict). research.js hash links now intercepted (see Finding 2). |
| Security | 10/10 | `escapeHtml` applied to the `data-dip-title` project name; no injection surface, no secrets. |

BLOCKER present → capped at 69.

### Machine checks
- `gh pr checks` — `audit`: pending (this audit run). No `fail` on any registered check → no CHANGES-REQUESTED cap from machine layer, no 49-cap.
- Local lint/build/test — "No package.json, no lint configured yet (pre-#9)". Normal, not a finding.
- `node --check js/page-dip.js` — pass.
- `node --check js/projects-index.js` — pass.

### Spec compliance
- [x] No triangle anywhere — `js/page-loader.js` deleted; grep for `vcp-loader`/`vcp-loading`/`page-loader`/`penrose`/`metal-dark`/`metal-mid` across html/css/js returns zero hits in shipped code. Pre-paint snippet + `<script>` tag removed from all 8 pages; `--metal-dark`/`--metal-mid` tokens removed.
- [~] Project card first visit dips with the project name; repeat cross-fades — first-visit dip path is correct (`data-dip-title` from `projects-index.js`, `escapeHtml`'d). BUT the "cross-fade" on repeat is a fade-OUT only; the destination never veils (Finding 1).
- [~] Nav tabs: first dip, repeat cross-fade, never hard cut — repeat visit reaches `playFade`, origin veils, but destination arrives at full opacity (hard cut IN on arrival) due to Finding 1.
- [x] `prefers-reduced-motion` → native/immediate — click handler bails on `reduced.matches`; pre-paint snippets gate on the same media query; CSS `display:none`s the veil.
- [x] bfcache restore never resurfaces a stale overlay — `pageshow`/`persisted` clears dip + fade classes and both sessionStorage keys.
- [x] sessionStorage unavailable → no errors — every access wrapped in try/catch; degrades to no-transition.
- [x] demo.html documents fade + first-visit-dip, not the loader — section 11 rewritten; Penrose figure removed.

Out-of-scope line violated: "Hash-anchor cross-links stay native" — see Finding 2.

### Stress tests performed
- **CSS state-machine simulation** (resolved `::before` opacity for each classList the JS produces):
  - Origin `[vcp-fade]` → opacity 0 (transparent); `[vcp-fade,--out]` → opacity 1 (veil fades up). Correct.
  - Destination `[vcp-fade]` (pre-paint) → **opacity 0**, not 1. Then `[vcp-fade,--reveal]` → opacity 0. Transition is 0→0: the destination veil is never visible. This is Finding 1 — reproduced deterministically from the three CSS rules at components.css:1334/1347/1350.
- **`node --check`** on both changed scripts — pass.
- **Leftover-reference sweep** — no Penrose/loader identifiers survive in shipped html/css/js.
- **Cross-page hash link trace** — `js/research.js:78` emits `/library.html#<id>`. New handler: `href` starts with `/` (skips the `#` bail), same origin, `norm` differs → intercepts and plays a transition + `location.href` assignment. Anchor scroll still resolves (full nav to a fragment scrolls), so degraded polish, not breakage.
- **Not browser-QA'd** — Chrome extension unavailable this session (matches the author's note). Visual timing (250ms fade, 300ms reveal) not confirmed on-screen; correctness scored on the CSS/JS logic evidence above, not on a live render.

### Integrity sweep
- **Blast radius of `page-dip.js`**: loaded on all 8 pages + demo. Now intercepts every `a[href]` (was `.vcp-nav__links a`). Verified bail conditions: `target`, `download`, `href` starting `#`, cross-origin, same normalized URL. nav.js only wires the mobile-menu toggle/scroll — no navigation interception, no double-fire.
- **`components.css`**: only the loader block changed; dip block (html.vcp-dip) untouched, so nav-tab first-visit dip is unaffected. Verified the dip pre-paint snippet on every page is byte-identical to main (only the loader snippet line changed).
- **`tokens.css`**: removed tokens (`--metal-dark`, `--metal-mid`) had exactly one consumer — the deleted loader SVG. `--scrim` retained (still used by the veil). No other page references the removed tokens (grep clean).
- **`projects-index.js`**: added `data-dip-title` with `escapeHtml`; card link markup otherwise identical. `projects-detail.js` unchanged — detail page renders as before.
- **Untouched pages** (index/intent/library/projects/research/socials/detail): only the two `<head>` lines and one `<script>` tag differ vs main; body content bit-identical.

### Findings
1. **BLOCKER** — `css/components.css:1347` — The destination cross-fade veil never displays. `html.vcp-fade:not(.vcp-fade--out):not(.vcp-fade--reveal)::before { opacity: 0 }` is meant to keep the ORIGIN veil transparent before `--out`, but it also matches the DESTINATION, whose pre-paint class is the identical bare `vcp-fade` (no `--out`, no `--reveal`). So the pre-paint veil the comment (line 1332) claims makes the page "start fully veiled" is forced to opacity 0 from first paint; adding `--reveal` transitions opacity 0→0. Result: only the origin fades out — the arriving page hard-cuts in at full opacity, so there is no cross-fade, contradicting the AC "the destination fades up from the veil" / "lifts on the arriving one." Origin and destination cannot share the same initial class and satisfy opposite requirements. Fix: stamp a distinct destination class at pre-paint (e.g. `vcp-fade--in` meaning "start veiled") and make the origin-transparent selector exclude it, so the destination begins at opacity 1 and `--reveal` lifts it.
2. **NOTE** — `js/page-dip.js:376` (click handler) — the old page-dip bailed on `url.hash`; the unified handler dropped that check. Cross-page hash links such as `/library.html#<id>` (emitted by `js/research.js:78`) are now intercepted and wrapped in a fade instead of staying native, which the spec's Out-of-scope section says they should not. The fragment still resolves and scrolls via `location.href`, so this is degraded polish, not breakage. Fix: `if (url.hash) return;` (or bail only when the hash targets a different page), restoring native behavior for anchor cross-links.
3. **NOTE** — `css/components.css:1328` and `:1345` — both comments attribute the class-driving logic to `js/page-fade.js`, which does not exist; the code lives in `js/page-dip.js`. Stale reference — update the comments to the real filename so the next reader can find the driver.
