---
title: Team Onboarding
tags: [operations, team, onboarding]
related: [[The Three Systems]]
parent: [[MOC - Operations]]
---

New humans join with zero ceremony: clone the repo, open Claude Code, and the system registers them. Nobody schedules an onboarding call.

```mermaid
flowchart TD
    A[New worker clones repo] --> B[Opens Claude Code]
    B --> C{gstack installed?}
    C -->|no| D[Enforcement hook blocks work,
shows install commands]
    D --> B
    C -->|yes| E{In TEAM.md?}
    E -->|no| F[/vcp-onboard runs/]
    F --> G[Detect gh identity]
    G --> H[Assign next VCP-NNN id]
    H --> I[Append to TEAM.md, configure git attribution]
    I --> J[Ready: claim any Pending card]
    E -->|yes| J
```

The moving parts:
- **`.claude/hooks/check-gstack.sh`** — blocks skill use until gstack is installed, with the exact install commands in the error (team mode)
- **`/vcp-onboard`** — detects the terminal's GitHub identity, assigns the next sequential `VCP-NNN` member ID, registers them in `TEAM.md`, sets git attribution
- **`CLAUDE.md` session checklist** — every session checks registration first, so workers are added dynamically on first contact
- **Repo-shipped skills** (`.claude/skills/`) — `/vcp-spec`, `/vcp-start`, `/vcp-onboard` arrive with the clone; nothing to install per-person beyond gstack

Roster and IDs: `TEAM.md` at the repo root. As of 2026-07-03: VCP-001 (Jose, owner).
