---
name: vcp-start
description: Claim a VCP ticket — assigns the current user to a GitHub issue and moves it to Started on the VCP Tracker board. Use when the user says they want to start / claim / work on a ticket or issue number.
---

# /vcp-start <issue#> — Claim a ticket

## Step 1 — Verify the worker is registered

```bash
HANDLE=$(gh api user --jq '.login')
grep -q "$HANDLE" TEAM.md || echo "NOT REGISTERED"
```

If not registered, stop and run `/vcp-onboard` first.

## Step 2 — Assign the issue

```bash
gh issue edit N --repo Joeareval19/VCP-WebPage --add-assignee "$HANDLE"
```

## Step 3 — Move the board item to Started

Find the project item for issue N, then set Status = Started:

```bash
ITEM_ID=$(gh api graphql -f query='query {
  repository(owner: "Joeareval19", name: "VCP-WebPage") {
    issue(number: N) {
      projectItems(first: 10) { nodes { id project { id } } }
    }
  }
}' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.id == "PVT_kwHOBdoj_c4BcT54") | .id')
```

If `ITEM_ID` is empty, the issue was never added to the board — add it first
using the Step 3 commands from the `vcp-spec` skill, then retry.

```bash
gh api graphql -f query="mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwHOBdoj_c4BcT54\",
    itemId: \"$ITEM_ID\",
    fieldId: \"PVTSSF_lAHOBdoj_c4BcT54zhW9rGs\",
    value: {singleSelectOptionId: \"de246815\"}
  }) { projectV2Item { id } }
}"
```

## Step 4 — Create a working branch

```bash
git checkout -b "issue-N-short-slug"
```

Remind the user: the eventual PR must contain `Closes #N` so the ticket
auto-closes and moves to **Completed** on merge.
