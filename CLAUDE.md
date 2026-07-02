# VCP WebPage

Repo: https://github.com/Joeareval19/VCP-WebPage
Ticket board: https://github.com/users/Joeareval19/projects/2 (VCP Tracker)

## Onboarding (REQUIRED — run first)

At the start of every session, check `TEAM.md`. If the current `gh` user
(`gh api user --jq '.login'`) is not registered there, run the `/vcp-onboard`
skill BEFORE any other work. Every worker must have a unique member ID.

## Ticket workflow

All work is ticket-driven through GitHub Issues + the VCP Tracker project board.

| Board column | Meaning |
|--------------|---------|
| Pending | Spec filed, nobody working on it |
| Started | Assigned and in progress |
| Completed | PR merged, issue closed |

- Create tickets with `/vcp-spec` (NOT plain `/spec` — the wrapper adds the
  issue to the VCP Tracker board and sets Status = Pending).
- Before starting work on a ticket: assign yourself to the issue and move it
  to **Started** (`/vcp-start <issue#>` does both).
- PRs must reference their ticket (`Closes #N`) so the issue auto-closes and
  moves to **Completed** on merge.
- Creator = issue author (automatic). Completer = whoever's PR closed it
  (automatic). Never file work without a ticket.

### Project board IDs (for GraphQL calls)

| Thing | ID |
|-------|----|
| Project | `PVT_kwHOBdoj_c4BcT54` |
| Status field | `PVTSSF_lAHOBdoj_c4BcT54zhW9rGs` |
| Pending option | `792a8429` |
| Started option | `489f0bb8` |
| Completed option | `b0e1c8d5` |

## gstack

The gstack skill suite is installed globally (`~/.claude/skills/gstack`).
Key skills for this project:

- `/vcp-spec` — file a ticket (wraps gstack `/spec` + board integration)
- `/vcp-start` — claim a ticket and move it to Started
- `/vcp-onboard` — register yourself as a team member
- `/autoplan` — fully reviewed implementation plan
- `/review` — staff-engineer code review before shipping
- `/ship` — sync, test, audit coverage, push PR
- `/qa` — browser-based QA
- `/investigate` — root-cause debugging
- `/cso` — security audit

See `WORKFLOW.md` for the full workflow design.
