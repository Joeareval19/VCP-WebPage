---
name: integrity-sweep
read-when: every audit — after stress-testing the change itself
---

# Integrity sweep: the platform must survive the merge

The stress test asks "does the new code work?" This sweep asks the harder
question: "does everything that ALREADY worked still work?" This is
Sterling's core mandate — no backend data broken, no frontend features
broken.

## Procedure

1. **Full build, not partial.** Build the ENTIRE project on the PR branch,
   not just the changed area. A change to a shared component (design
   tokens, nav, card) can break every page that uses it while its own page
   looks perfect.
2. **Blast-radius map.** From the diff, list every file changed, then ask
   for each: what else imports/uses/depends on this? Check those consumers
   — read them, and where runnable, run them. Shared code changes get the
   widest sweep.
3. **Diff the unchanged.** Pages/features the spec did NOT mention must be
   bit-identical or trivially unaffected. If building the site, compare
   output of untouched pages between main and the PR branch — unexpected
   diffs in unrelated output = finding (the change is leaking).
4. **Data compatibility.** For any change to a content model, schema, or
   structured data format: can every EXISTING record still be read?
   Backward compatibility is the default contract — a model change that
   requires migrating existing content must say so in the spec, or it's a
   BLOCKER.
5. **Run the full test suite** (not just new tests) once it exists (#9).
   Pre-existing tests failing on the PR branch = BLOCKER, full stop —
   that's the definition of a regression.
6. **Config and infra blast radius.** Changes to workflows, configs, or
   shared tooling: reason through what every OTHER consumer of that file
   does the day this merges. Cite the reasoning in the report.

## Reporting

The "Integrity sweep" section must name what you verified, not assert
safety in general ("verified /research and /library pages build unchanged
vs main; card component consumers checked: 3 files, no behavioral change"
— not "no regressions found"). Unverifiable areas get named as
unverified — silence is not evidence.

The integrity axis of the score (15 points) is earned by evidence in this
section. No evidence, no points.
