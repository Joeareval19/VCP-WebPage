# VCP WebPage

Ticket-driven development on three interlocking systems: **GitHub Projects**
(state of work), **gstack** (how work gets done), and the **`wiki/` Obsidian
vault** (why decisions were made).

| System | Where | Role |
|--------|-------|------|
| Repo | https://github.com/Joeareval19/VCP-WebPage | Source of truth for code |
| VCP Tracker | https://github.com/users/Joeareval19/projects/2 | Source of truth for work state |
| `wiki/` vault | `wiki/` (Obsidian) | Source of truth for knowledge & decisions |

## Session start checklist (REQUIRED — in order)

1. **Onboarding.** Check `TEAM.md`. If the current `gh` user
   (`gh api user --jq '.login'`) is not registered, run `/vcp-onboard`
   BEFORE any other work. Every worker gets a unique `VCP-NNN` member ID.
2. **Orient.** Glance at open tickets before proposing new work:
   `gh issue list --repo Joeareval19/VCP-WebPage --state open`.
   Work that matches an existing Pending ticket should claim it, not
   duplicate it.

## The VCP lifecycle

Every unit of work moves through these stages. Each stage touches all three
systems — don't skip columns:

| Stage | gstack skill | Board action | Wiki action |
|-------|-------------|--------------|-------------|
| 1. Ideate | `/office-hours` (pressure-test the idea) | — | Note per meaningful idea/decision, linked to its topic MOC |
| 2. Spec | `/vcp-spec` (wraps gstack `/spec`) | Issue created → **Pending** | Spec's key decisions get `[[wikilinks]]` into existing notes |
| 3. Claim | `/vcp-start <issue#>` | Assignee set → **Started**, branch created | — |
| 4. Plan | `/autoplan` (big work) or direct (small) | — | Architecture choices → decision note (`parent:` the feature note) |
| 5. Build | normal dev; `/investigate` when stuck | — | Non-obvious root causes → note (future debugging trail) |
| 6. Verify | `/review` then `/qa` | — | — |
| 7. Ship | `/ship` (PR body MUST contain `Closes #N`) | Merge auto-closes issue → **Completed** | — |
| 8. Learn | `/retro` (weekly) | — | Learnings land as wiki notes, linked from the relevant MOC |

Rules that keep the system honest:

- **Never file work without a ticket.** `/vcp-spec` is the only approved way
  to create tickets (NOT plain `/spec` — the wrapper adds the issue to the
  VCP Tracker board and sets Status = Pending).
- **Never start work without claiming.** `/vcp-start` assigns you and moves
  the card — the board must always reflect who is doing what.
- **Attribution is automatic — don't fake it.** Creator = issue author.
  Completer = whoever's merged PR closed it. Both come from GitHub records.
- **Ticket ↔ wiki linking.** When a spec or PR makes a decision worth
  remembering, the wiki note names the ticket (`#N`) and the issue gets a
  comment linking the note path. Ticket = what/when/who; wiki = why.

## GitHub is the only source of truth for specs (non-negotiable)

A spec that only exists locally (in conversation, in a local file, in memory)
does not count as filed. This holds for creation AND every update after:

- **Never draft a spec as a local file and stop there.** `/vcp-spec` must run
  to completion — `gh issue create` must actually execute — before a spec is
  considered to exist. A markdown draft in the working tree is not a spec,
  it's scratch input to `/vcp-spec`.
- **Every spec field lives on the GitHub Issue, not just locally.** Title,
  body, acceptance criteria, labels — if it's part of the spec, it goes in
  the issue body/fields via `gh issue edit`, not just discussed in chat or
  written to a local note.
- **Every status change is pushed immediately, not batched.** The moment a
  spec's state changes (claimed, blocked, scope changed, superseded, closed)
  update the GitHub Issue and VCP Tracker board status in the same turn —
  don't do the local work first and "sync to GitHub later." GitHub must
  never be stale relative to local state, even for a few minutes.
- **Wiki notes about a spec cross-reference the issue, both directions.**
  Per the ticket↔wiki linking rule above: the wiki note names the ticket
  (`#N`) AND the GitHub issue gets a comment linking the wiki note's path
  (`gh issue comment N --body "..."`). A wiki note discussing a spec with no
  issue-side comment pointing back to it is an incomplete update — finish it
  in the same pass, not as a followup.
- **If a `gh` call fails, the task isn't done.** Don't report a spec/status
  change as complete if the corresponding `gh issue`/`gh api graphql` command
  errored — retry or surface the failure to the user. Local state changing
  while the GitHub call silently failed is the one failure mode this section
  exists to prevent.

### Project board IDs (for GraphQL calls)

| Thing | ID |
|-------|----|
| Project | `PVT_kwHOBdoj_c4BcT54` |
| Status field | `PVTSSF_lAHOBdoj_c4BcT54zhW9rGs` |
| Pending option | `945c8a59` |
| Started option | `de246815` |
| Review option | `18317928` |
| Completed option | `96b35fff` |

Board column meanings: **Pending** = spec filed, unclaimed. **Started** =
agent or human working. **Review** = agent done, PR open, awaiting human
review. **Completed** = human approved; dragging Review → Completed
auto-merges the PR (relay handles it).

Review-gate rules:
- Agents NEVER merge. When an agent finishes, its workflow moves the card to
  **Review** and the PR waits.
- A human approves by dragging the card Review → Completed (or merging the
  PR directly — the issue closes either way).
- Up to 3 agents run in parallel (runners vcp-laptop, -2, -3); the per-issue
  concurrency group still guarantees one agent per ticket.

## gstack skill roster

gstack is installed globally (`~/.claude/skills/gstack`) in team mode —
it auto-updates at session start. Project skills live in `.claude/skills/`
and ship with the repo.

**Core loop (used every ticket):**
- `/vcp-spec` — file a ticket (spec interrogation + board integration)
- `/vcp-start` — claim a ticket, move to Started, create branch
- `/vcp-onboard` — register a new worker (auto-run via checklist above)
- `/autoplan` — CEO + Eng + Design reviewed plan before big builds
- `/review` — staff-engineer code review before shipping
- `/ship` — sync, test, audit coverage, push PR

**Situational:**
- `/office-hours` — interrogate a product idea before speccing it
- `/qa` — browser-based QA of the webpage
- `/investigate` — root-cause debugging methodology
- `/cso` — OWASP + STRIDE security audit (run before any public launch)
- `/design-consultation`, `/design-shotgun`, `/design-html` — UI design work
- `/retro` — weekly retrospective (feeds the wiki)
- `/careful` / `/guard` — safety rails when doing risky operations

**Not for this project:** `ios-*` skills (this is a web project).

See `WORKFLOW.md` for the full workflow design and `TEAM.md` for the member
registry.

## Markdown output policy (no junk .md files)

Applies to every `.md` file Claude writes in this repo, including `wiki/`
(the Obsidian vault), specs, and docs.

- **Don't create a file unless asked.** No unsolicited README/SUMMARY/NOTES.md
  after finishing a task. If a durable record is genuinely useful, ask first
  or add it to an existing file instead of creating a new one.
- **No filler.** Don't restate what the code already makes obvious, don't pad
  with boilerplate sections ("Overview", "Conclusion") that carry no content.
  Every section must earn its place — if you'd delete it and lose nothing,
  don't write it.
- **State the purpose up top.** One line under the H1 saying what the doc is
  for and who/what it's for. If you can't state it in one line, the doc
  doesn't have a clear enough purpose yet.
- **Keep it current or don't write it.** Prefer updating an existing doc over
  writing a new one that will drift. If a doc records a decision or state
  that will go stale (ticket status, architecture snapshot), say so explicitly
  ("as of 2026-07-02") rather than presenting it as permanently true.
- **Match existing structure.** Follow the heading/table conventions already
  used in this repo's docs (see `WORKFLOW.md`, `TEAM.md`) rather than
  inventing a new format per file.
- **Wiki notes (`wiki/`) specifically:** use `[[wikilink]]` syntax to connect
  related notes instead of duplicating content across files. A note that
  only restates another note's content should be a link, not a copy.

## Wiki cross-linking (`wiki/` — Obsidian graph)

The `wiki/` vault is meant to behave like an associative graph, not a flat
folder: reading one note should surface the related notes around it, the
way one thought leads to the next. Every note follows this shape:

1. **Frontmatter block** at the top of every note:
   ```yaml
   ---
   title: <note title>
   tags: [<topic tags>]
   related: [[Note A]], [[Note B]]
   parent: [[Broader Topic Note]]
   depends_on: [[Note C]], [[Note D]]
   ---
   ```
   - `related` — sibling notes on the same topic (loose association).
   - `parent` — the broader note this one is part of (omit for top-level
     MOCs).
   - `depends_on` — notes this one's content REQUIRES to be true/understood
     first (a real dependency, not just a related idea). Omit if none.
     This is the field that turns the graph into a dependency map, not
     just a topic map — don't reuse `related` for this.
2. **Inline `[[wikilinks]]`** in the body wherever a concept, decision, or
   term is discussed that has (or deserves) its own note — not just in
   frontmatter. This is what makes reading feel like following a trail:
   opening one note should immediately redirect an agent to the notes it
   needs next.
3. **Link relationships must be real.** Only link notes that actually
   relate, and only use `depends_on` for genuine prerequisites. Don't
   invent links to satisfy this policy — fabricated links are worse than
   no links, they make the graph (and the dependency map) lie.
4. **New concept, no note yet?** Create a stub note (title + one-line
   purpose + `parent` link back) rather than leaving the mention as plain
   text. A `[[link]]` to a not-yet-created note is fine — Obsidian will
   show it as an unresolved link until the stub exists.
5. **Topic clusters get a MOC (Map of Content).** Once 4+ notes accumulate
   around one theme, add or update a `MOC - <Topic>.md` hub note that lists
   and links every note in the cluster. Each member note links back to its
   MOC via `parent`.

### Efficiency rules (don't bloat the graph)

- **One concept, one note.** Before creating a note, search `wiki/` for an
  existing note covering the same concept (`grep -ri "<concept>" wiki/`).
  Extend/link the existing note instead of forking a near-duplicate.
- **Batch the links while the context is loaded.** When creating or editing
  a note, resolve all of its `related`/`parent`/`depends_on` links and any
  inline `[[links]]` in that same pass — don't leave linking as a followup
  step, and don't make a second pass over the vault later to "add links."
  Writing a note and its cross-links is one atomic action, not two.
- **Every new note updates its neighbors.** If note B declares `parent: [[A]]`
  or `depends_on: [[A]]`, note A must gain a mention (or `related` entry) of
  B in the same edit. Links are bidirectional in effect even though
  Obsidian only requires the forward link — don't leave a neighbor unaware
  a new dependent was added.
- **No orphans, no dead ends.** A note with zero inbound and zero outbound
  links has failed the point of the vault — either link it into an existing
  MOC/parent or reconsider whether it needed to be a separate note at all.

See `wiki/_template.md` for the exact skeleton to copy for new notes.
