---
name: vcp-spec
description: File a VCP ticket — runs the gstack /spec interrogation, creates the GitHub issue, then adds it to the VCP Tracker board with Status = Pending. Use whenever the user wants to create a ticket, spec, or backlog item for this repo.
---

# /vcp-spec — File a ticket into the VCP Tracker

This is the ONLY approved way to create tickets in this repo. It wraps the
gstack `/spec` skill and adds VCP Tracker board integration.

## Step 1 — Run the gstack spec flow

Invoke the gstack `spec` skill (router: `gstack`, arg `spec <user's request>`).
Follow its full interrogation: why, scope, technical evidence, draft review.
Let it file the GitHub issue in `Joeareval19/VCP-WebPage` via `gh issue create`.

If gstack's spec skill is unavailable for any reason, fall back to a manual
flow: interrogate the request (who's affected, current vs desired behavior,
out-of-scope, acceptance criteria), show the draft for approval, then file
with `gh issue create --repo Joeareval19/VCP-WebPage --title "..." --body "..."`.

## Step 2 — Capture the issue number

From the `gh issue create` output URL (e.g. `.../issues/7`), extract `N`.

## Step 3 — Add to the VCP Tracker board as Pending

```bash
ISSUE_ID=$(gh api repos/Joeareval19/VCP-WebPage/issues/N --jq '.node_id')

ITEM_ID=$(gh api graphql -f query="mutation {
  addProjectV2ItemById(input: {projectId: \"PVT_kwHOBdoj_c4BcT54\", contentId: \"$ISSUE_ID\"}) {
    item { id }
  }
}" --jq '.data.addProjectV2ItemById.item.id')

gh api graphql -f query="mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwHOBdoj_c4BcT54\",
    itemId: \"$ITEM_ID\",
    fieldId: \"PVTSSF_lAHOBdoj_c4BcT54zhW9rGs\",
    value: {singleSelectOptionId: \"945c8a59\"}
  }) { projectV2Item { id } }
}"
```

## Step 3.5 — Declare dependencies (MANDATORY)

Read the spec's `## Dependencies` section. For EVERY blocker ticket it names,
create the native GitHub blocked-by link:

```bash
BLOCKER_ID=$(gh api repos/Joeareval19/VCP-WebPage/issues/<blocker#> --jq '.id')
gh api -X POST "repos/Joeareval19/VCP-WebPage/issues/N/dependencies/blocked_by" -F issue_id=$BLOCKER_ID
```

If the spec has no dependencies, its Dependencies section must SAY so
explicitly ("None — can start immediately"). Do not file a spec whose
Dependencies section is missing or vague — go back and pin it down.

Then resync the waterfall so the Roadmap view reflects the new topology:

```bash
node agent-dispatch/waterfall.js
```

(Start/End dates are placeholders encoding dependency waves — week k = wave
k — never real deadlines. See CLAUDE.md "Waterfall view".)

## Step 4 — Confirm to the user

Report: issue number + URL, board status (Pending), and creator
(the current `gh` user — verify with `gh api user --jq '.login'` and confirm
they exist in `TEAM.md`; if not, tell them to run `/vcp-onboard`).

## Optional — assign at creation

If the user names an assignee, run:
`gh issue edit N --repo Joeareval19/VCP-WebPage --add-assignee <handle>`
and then follow the `/vcp-start` skill's board move to **Started**.
