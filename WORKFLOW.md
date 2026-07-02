# VCP Workflow — gstack Customization Plan

## Vision

Use gstack as the foundation for a full project lifecycle system where:
- Specs are created, tracked, and completed with full accountability
- Every ticket knows who created it and who completed it
- GitHub Issues is the source of truth
- GitHub Projects (VCP Tracker) is the visual board

---

## Project Setup

| Resource | Value |
|----------|-------|
| GitHub Repo | github.com/Joeareval19/VCP-WebPage |
| Project Board | github.com/users/Joeareval19/projects/2 |
| Project ID | PVT_kwHOBdoj_c4BcT54 |
| Status Field ID | PVTSSF_lAHOBdoj_c4BcT54zhW9rGs |

### Board Buckets

| Column | Color | ID | Meaning |
|--------|-------|----|---------|
| Pending | Yellow | 792a8429 | Spec filed, not yet started |
| Started | Blue | 489f0bb8 | Assigned and in progress |
| Completed | Green | b0e1c8d5 | Merged and closed |

---

## Team Members

| Person | GitHub Handle | Role |
|--------|--------------|------|
| Jose Ernesto Arevalo | Joeareval19 | Creator / Owner |
| Tomas Guti | arevalogutierrezbajares-spec | Implementor |

---

## Workflow Steps

### 1. Create a Spec (`/spec`)
- Jose runs `/spec` describing a feature or bug
- gstack interrogates the request across 5 phases
- A GitHub Issue is created — Jose is auto-recorded as author
- Issue is added to VCP Tracker board → **Pending** column

### 2. Assign & Start
- Jose or Tomas assigns the issue to Tomas
- Issue moves to **Started** column (manual or via automation)

### 3. Implement
- Tomas works on the code in a branch
- PR references the issue (e.g. `Closes #5`)

### 4. Ship (`/ship`)
- Tomas runs `/ship` to sync, test, and push PR
- PR is reviewed and merged
- Issue auto-closes → moves to **Completed**
- GitHub records: created by Jose, closed by Tomas

---

## gstack Modifications Needed

### Priority 1 — `/spec` → Auto-add to Project Board
After `gh issue create`, the spec skill must:
1. Grab the new issue node ID
2. Call `addProjectV2ItemById` GraphQL mutation
3. Set Status field to **Pending** (`792a8429`)

**Approach:** Build a `/vcp-spec` wrapper skill that calls `/spec` then runs the project board logic. This survives gstack upgrades.

### Priority 2 — `/ship` → Auto-move to Completed
After PR merge, automatically move the linked issue to **Completed**.

**Approach:** GitHub automation rule on the board (no code needed — configure in GitHub Projects settings).

### Priority 3 — Assignee Tracking
When an issue is assigned to Tomas, auto-move to **Started**.

**Approach:** GitHub automation rule on the board.

---

## Custom Skills (BUILT — live in `.claude/skills/`)

| Skill | Purpose | Status |
|-------|---------|--------|
| `/vcp-spec` | Wrapper around gstack `/spec` that adds the issue to VCP Tracker as Pending | ✅ Built |
| `/vcp-start` | Assign an issue to yourself, move it to Started, create a working branch | ✅ Built |
| `/vcp-onboard` | Auto-register a worker: detect gh identity, assign sequential VCP-NNN ID, add to TEAM.md, configure git attribution | ✅ Built |

These live in the repo (`.claude/skills/`), so anyone who clones the repo and
opens Claude Code gets them automatically. `CLAUDE.md` instructs every session
to run `/vcp-onboard` if the current gh user is missing from `TEAM.md` —
workers are registered dynamically on first contact.

---

## GitHub Project Automation Rules (to configure manually)

1. Issue added to repo → set Status to **Pending**
2. Issue assigned → set Status to **Started**
3. Issue closed → set Status to **Completed**

These are configured at:
`github.com/users/Joeareval19/projects/2/settings/workflows`

---

## Open Questions

- [ ] Should Tomas have his own GitHub account linked to this repo as a collaborator?
- [ ] Do we want labels on issues (e.g. `feature`, `bug`, `design`)?
- [ ] Should `/vcp-spec` prompt for assignee at creation time?
- [ ] Do we want milestones (sprints) to group specs by week or release?
