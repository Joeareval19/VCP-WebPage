---
name: stress-test
read-when: every audit containing runnable code
---

# Stress test: exercise the code, don't just read it

Reading code catches sloppiness. Running it catches lies. Your job here is
to actively try to break what the builder claims works.

## Procedure

1. **Make it run.** Build the project on the PR branch (`npm run build` or
   whatever the stack defines). A change that doesn't build is a BLOCKER
   regardless of how the diff reads.
2. **Derive attack inputs from the acceptance criteria.** Every criterion
   implies boundaries — test at and beyond them:
   - Counts: 0 items, 1 item, the spec's stated maximum, 10x that
     (e.g. spec says "timeline renders with 1, 5, 20 milestones" — also
     feed it 0 and 200)
   - Strings: empty, one char, very long (500+), unicode/emoji, HTML/script
     tags (`<script>alert(1)</script>` — does it render escaped?)
   - Dates: missing, malformed, far past/future
   - Optional fields: ALL absent at once (does the layout collapse cleanly?)
3. **Exercise the states the spec names.** Loading, empty, error, success —
   if the spec or design system names a state, force it and look at it.
4. **Frontend specifics.** If pages/components changed: build the site and
   verify the affected pages actually render (serve locally, curl or read
   the built HTML output). Broken build output = BLOCKER even when the
   build "succeeds".
5. **Data-layer specifics.** If anything touches stored data (schemas,
   content models, structured files): feed it records that are missing
   fields, have extra fields, or violate the model. Verify malformed input
   degrades gracefully instead of corrupting output or crashing the build.

## Rules

- Stress tests run ONLY on the PR branch checkout on this runner — never
  against any deployed environment, never against production anything.
- Report what you actually ran and what actually happened in the "Stress
  tests performed" section — commands and observed behavior, not
  descriptions of what you would do. If you couldn't run something, say so
  and score correctness on reduced evidence (never assume it passes).
- A crash you cause with input the spec should handle = BLOCKER. A crash
  you cause with input far outside any plausible use = NOTE with a one-line
  justification either way.
