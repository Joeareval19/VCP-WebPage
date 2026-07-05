---
title: Board Integrity Sweep
tags: [operations, automation, resilience]
related: [[Agent Dispatch Pipeline]]
parent: [[MOC - VCP AI Workflow]]
depends_on: [[Ticket Lifecycle]]
---

The secondary safety net that catches board state the webhook path missed — every 5 minutes, not event-driven, on purpose.

[[Agent Dispatch Pipeline]] is event-driven end to end, but every event-driven system has a failure mode: the event never arrives. This sweep (`.github/workflows/completed-sweep.yml`) exists because that failure mode has actually happened, more than once, in this repo — a card resting in **Completed** with its `Closes #N` PR still open and unmerged, because the approval webhook that should have triggered the merge was dropped or never processed.

## What it does, every 5 minutes

1. **Completed pass (issue #26/#47):** any card resting in **Completed** whose issue is still open is treated as a dropped-webhook approval, not a mistake — the human already dragged it there, that drag *is* the approval act. The sweep honors it: squash-merges the `Closes #N` PR and deletes its branch when mergeable; only genuinely unmergeable work (no PR, conflicting PR, or a failed merge) bounces back to Review, with one issue comment explaining why and what to do next.
2. **Started pass (issue #37):** any card in **Started** whose issue has an open `Closes #N` PR gets moved to Review — routine sync, log-only, no comment. This covers PRs opened by local fan-out sessions ([[Parallel Sub-Agent Dispatch]]) that build work without ever touching the board themselves.

## Why scheduled, not webhook-driven

This is deliberate, not a stopgap waiting to be replaced. A scheduled sweep has no delivery-dependency on any single webhook arriving — it just re-reads the true state of the board and the repo every 5 minutes and reconciles them. That's exactly the property a safety net needs: it can't share a failure mode with the thing it's supposed to catch.

## A real limitation, exposed 2026-07-05

The sweep runs on the same self-hosted runners ([[Worker Fleet and Scaling]]) as everything else in this pipeline. On 2026-07-05, both [[Agent Dispatch Pipeline]]'s primary webhook path (then routed through `smee.io`) AND this sweep failed at the same time, because the runner they both depend on wasn't online — issues #3/#30 sat at Completed with PR #38 unmerged for over an hour, with no visible error. This is why issue #51 replaced the smee.io hop with an always-on Vercel Function (`api/board-webhook.js`) instead of just restarting the runner: fixing the immediate outage wouldn't have fixed the shared-dependency design flaw. This sweep still runs post-#51 — it now covers a genuine GitHub webhook delivery failure (rarer, since smee.io is gone) or the runner being down specifically for the Started-dispatch step, which #51 didn't change.

The code: `.github/workflows/completed-sweep.yml` in the repo.
