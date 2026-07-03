# VCP Design Guide

The reference every agent and human reads before writing ANY UI for this
repo. This file is the written law; the files below are the executable law.

| Artifact | Role |
|---|---|
| `css/tokens.css` | Single source of truth — every color, font, size, space. **Use only these tokens; zero one-off values.** |
| `css/base.css` / `css/components.css` | The component library: nav, footer, card, chip, button, section heading |
| `demo.html` | Living visual proof — all components rendered together for QA |
| Issue [#1](https://github.com/Joeareval19/VCP-WebPage/issues/1) | The origin contract (full rationale + acceptance criteria) |

## The brand in one paragraph

Dark, elegant, metallic. Near-black backgrounds (`--bg`), silver as
**polished metal, never flat gray** — the signature is the sheen gradient
(`--silver-sheen`) on the wordmark, section headings, and card borders on
hover. Serif display type (Cormorant Garamond) carries the class; a neutral
sans (Inter) carries the reading. Motion is subtle (150–250ms), never a
circus.

## Binding rules for all UI work

1. **Tokens only.** No hex values, font names, or spacing numbers outside
   `css/tokens.css`. If a needed token doesn't exist, add it to tokens.css
   in the same PR — never inline it.
2. **Components before custom.** Reuse the component library; extend it in
   `css/components.css` when a page genuinely needs something new.
3. **The sheen is precious.** Metallic effects on key moments (wordmark,
   headings, hover accents) — not on everything. Overuse kills the class.
4. **Dark is the only theme.** No light mode unless a spec explicitly adds one.
5. **Accessibility floor:** ≥4.5:1 text contrast, visible focus rings,
   honors `prefers-reduced-motion`.
6. **Update `demo.html`** whenever a component is added or changed — the
   demo page must always show the complete current system.

gstack design skills (`/design-consultation`, `/design-html`,
`/design-review`) read this file automatically and constrain themselves to it.
