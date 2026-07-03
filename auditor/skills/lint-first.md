---
name: lint-first
read-when: every audit — before reading the diff
---

# Lint-first: interpreting the machine-check log

The workflow hands you a machine-check log before you see any code. It
contains, in order: GitHub check-run results for the PR head (`gh pr
checks`), then local lint/build/test output run against the PR branch.

## How to read it

1. **`gh pr checks` section** — each line is a registered CI check.
   `fail` on any check = automatic BLOCKER finding, quote the check name.
   `no checks reported` is normal until ticket #9 (CI pipeline) lands —
   note it as "CI not yet configured (#9)" and move on, it is not a finding.
2. **Local lint/build/test section** — raw tool output.
   - Errors: each distinct error = BLOCKER, cite the file:line the tool
     printed. Do not deduplicate away errors that share a root cause —
     name the root cause once and list affected locations.
   - Warnings: judgment call. A warning that masks a real defect
     (unused variable that reveals dead logic, deprecated API with a
     removal date) = NOTE finding. Pure style warnings = ignore.
   - `No package.json / no lint configured` = normal pre-#9, not a finding.
3. **Tool crashes** (the log shows the runner itself erroring, not the
   code failing) — do NOT convert to a code finding. Report it in the
   Machine checks section as "check errored — inconclusive" and say the
   audit proceeded without that signal.

## The rule that cannot bend

A failing machine check caps the verdict at CHANGES REQUESTED even if the
diff looks perfect to you. Machines catching bugs is the cheap layer —
your judgment is the expensive layer built on top of it, never instead of it.
