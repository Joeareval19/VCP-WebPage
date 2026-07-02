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

### Project board IDs (for GraphQL calls)

| Thing | ID |
|-------|----|
| Project | `PVT_kwHOBdoj_c4BcT54` |
| Status field | `PVTSSF_lAHOBdoj_c4BcT54zhW9rGs` |
| Pending option | `792a8429` |
| Started option | `489f0bb8` |
| Completed option | `b0e1c8d5` |

Board column meanings: **Pending** = spec filed, unclaimed. **Started** =
assigned, in progress. **Completed** = PR merged, issue closed.

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
   ---
   ```
   - `related` lists sibling notes on the same topic.
   - `parent` links up to the broader note this one is a part of (omit if
     this note has no natural parent, e.g. a top-level MOC).
2. **Inline `[[wikilinks]]`** in the body wherever a concept, decision, or
   term is discussed that has (or deserves) its own note — not just in
   frontmatter. This is what makes reading feel like following a trail.
3. **Link relationships must be real.** Only link notes that actually
   relate. Don't invent a `related` entry just to satisfy this policy —
   fabricated links are worse than no links, they make the graph lie.
4. **New concept, no note yet?** Create a stub note (title + one-line
   purpose + `parent` link back) rather than leaving the mention as plain
   text. A `[[link]]` to a not-yet-created note is fine — Obsidian will
   show it as an unresolved link until the stub exists.
5. **Topic clusters get a MOC (Map of Content).** Once 4+ notes accumulate
   around one theme, add or update a `MOC - <Topic>.md` hub note that lists
   and links every note in the cluster. Each member note links back to its
   MOC via `parent`.

See `wiki/_template.md` for the exact skeleton to copy for new notes.
