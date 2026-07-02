---
name: vcp-onboard
description: Register the current worker in the VCP team registry — detects their GitHub identity, assigns the next sequential member ID, and adds them to TEAM.md. Use at session start whenever the current gh user is not yet listed in TEAM.md, or when the user asks to onboard/register a team member.
---

# /vcp-onboard — Register a new worker

Every worker on this repo gets a unique sequential member ID (`VCP-001`,
`VCP-002`, ...). This skill registers the CURRENT terminal's GitHub identity.

## Step 1 — Detect identity

```bash
HANDLE=$(gh api user --jq '.login')
NAME=$(gh api user --jq '.name // .login')
```

If `gh` is not authenticated, tell the user to run `gh auth login` in their
terminal first, then re-run this skill.

## Step 2 — Check for existing registration

Read `TEAM.md`. If `HANDLE` already appears in the table, report their
existing member ID and stop — never register the same handle twice.

## Step 3 — Assign the next member ID

Find the highest `VCP-NNN` in `TEAM.md` and increment it (e.g. highest is
`VCP-002` → new member is `VCP-003`). Zero-pad to 3 digits.

## Step 4 — Append to TEAM.md

Add a row to the table, pulling today's date:

```
| VCP-NNN | <NAME> | <HANDLE> | Contributor | YYYY-MM-DD |
```

Ask the user what role to record if it isn't obvious (default: Contributor).

## Step 5 — Configure local git attribution

```bash
git config user.name "<NAME>"
EMAIL=$(gh api user --jq '.email // empty')
# If email is null/private, use the GitHub noreply address:
# <id>+<handle>@users.noreply.github.com  (id from: gh api user --jq '.id')
git config user.email "<EMAIL or noreply>"
```

## Step 6 — Grant repo access if needed

If the handle is not the repo owner (`Joeareval19`) and not already a
collaborator, the OWNER must invite them:

```bash
gh api repos/Joeareval19/VCP-WebPage/collaborators/<HANDLE> -X PUT -f permission=push
```

If the current user lacks permission to do this, tell them to ask Jose
(Joeareval19) to run it.

## Step 7 — Commit and push the registry update

```bash
git add TEAM.md && git commit -m "Register <HANDLE> as VCP-NNN" && git push
```

Then confirm to the user: their member ID, handle, and that commits are now
attributed correctly.
