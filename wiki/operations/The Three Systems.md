---
title: The Three Systems
tags: [operations, architecture]
related: [[Ticket Lifecycle]]
parent: [[MOC - Operations]]
---

VCP runs on three systems with strictly separated jobs — mixing them is how companies lose track of themselves.

| System | Job | One question it answers |
|--------|-----|------------------------|
| GitHub Projects ([VCP Tracker](https://github.com/users/Joeareval19/projects/2)) | State of work | "What is happening right now, and who owns it?" |
| gstack + project skills | How work gets done | "What is the procedure for X?" |
| This wiki (Obsidian vault) | Why decisions were made | "Why did we do it this way?" |

```mermaid
flowchart TD
    subgraph STATE[Board - state of work]
        T[Tickets and columns]
    end
    subgraph HOW[gstack - how work happens]
        S[Skills: spec, start, ship, review]
    end
    subgraph WHY[Wiki - why decisions were made]
        W[Decision notes and MOCs]
    end
    S -->|creates and moves| T
    T -->|ticket numbers referenced in| W
    W -->|context feeds future| S
```

The scaling property: each system absorbs growth without meetings. More work = more cards (board scales). More procedures = more skills (gstack scales). More decisions = more notes (wiki scales). A new [[Team Onboarding|worker]] reads all three and needs nobody to explain anything.
