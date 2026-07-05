# Agent dispatch (issue #6)

Drag a VCP Tracker card to **Started** -> an agent on the worker machine implements the spec.

## Pipeline (as of issue #51 — smee.io retired)
GitHub App webhook (projects_v2_item) -> `api/board-webhook.js` (Vercel Function,
always-on, no local process required to receive it) -> `repository_dispatch:
card-started` -> `.github/workflows/agent-build.yml` -> self-hosted runner ->
`claude -p` implements -> PR with `Closes #N`.

**Before issue #51**, this pipeline ran through `smee.io` (a free public
tunnel) -> `relay.js` on Jose's laptop. That chain had two independent
points of failure — smee.io's best-effort delivery, and the laptop's relay
process needing to be alive to receive the webhook at all — and both failed
simultaneously on 2026-07-05 (issues #3/#30 sat at Completed with an
unmerged PR for over an hour). `api/board-webhook.js` removes the smee.io
hop entirely: GitHub calls it directly, and it needs no local machine
online to receive the webhook. `relay.js` is kept in the repo for local
dev/testing reference only — it is no longer the production path.

Note: agent **dispatch itself** (the self-hosted runner executing `claude
-p`) still depends on a local machine being on, per the subscription-auth
constraint below — issue #51 only fixes the webhook-receiving step, not
agent execution.

## Worker machine setup (as of 2026-07-03: Jose's laptop)
- Runner: `~/actions-runner/` (labels: `vcp-laptop`), autostart via Startup folder
- `relay.js` (this file is the versioned copy) — retired from production
  use by issue #51; kept for local testing only, not autostarted
- Triggers that also work without the webhook: `ai-build` label, `gh workflow run agent-build.yml -f issue=N`

## Guards
- Board webhook (`api/board-webhook.js`, Vercel Function): Status->Started + unassigned = dispatch agent; Review->Completed = human approval, auto-merges the PR. Same merge-guard logic as the old relay.js, ported to direct GitHub REST/GraphQL calls (no local `gh` CLI available in a serverless function).
- Merge guard (#21, #51): a card may only REST in Completed if its issue is closed or its PR squash-merges right now. Any drag into Completed with no open PR bounces back to the source column; a CONFLICTING PR or a failed merge bounces to Review. Every bounce posts one comment on the issue naming the PR and the reason.
- Board Integrity Sweep (#26/#37/#47, `.github/workflows/completed-sweep.yml`): every 5 min - (a) any card resting in Completed with an open issue is treated as a dropped-webhook approval: its `Closes #N` PR is squash-merged with the branch deleted when mergeable, and only unmergeable/PR-less work bounces back to Review with one issue comment; (b) any Started card whose issue has an open `Closes #N` PR moves to Review, log-only (covers PRs opened by local fan-out sessions that never touch the board). Kept as a secondary safety net post-#51, not removed — it still covers a genuine GitHub webhook delivery failure or the runner being down for the Started-dispatch path.
- Parallel agents: 3 runners (vcp-laptop, -2, -3); per-issue concurrency still one agent per ticket
- Workflow concurrency: one agent per issue number
- Agent capped at --max-turns 100; failures are commented on the ticket

## Metadata capture (#41)
Pipeline metadata streams into the **vcp-ops** Supabase project
(`qaorlbgrkpldcatyntlw`): `vcp_tickets` (backfilled from gh),
`vcp_pipeline_events` (every status change, dispatch, merge, bounce, skip —
written by `api/board-webhook.js` since #51, previously by relay.js),
`vcp_audits` (agent-review.yml: Sterling verdict + score per PR). RLS is on
with zero public policies — writes need the service-role key. Post-#51 this
lives in the `SUPABASE_SERVICE_KEY` Vercel env var on the `vcp-webpage`
project (previously `~/vcp-dispatch/supabase-key.txt` on the worker).
Capture is fire-and-forget: a missing key or Supabase outage never blocks
dispatch/merge.

## Hard constraint: subscription auth only
Agents authenticate with Jose's Claude **subscription login** on the worker
machine — never `ANTHROPIC_API_KEY` billing. Do NOT move this workflow to
GitHub-hosted runners (they cannot use the local login). Scale by adding
self-hosted runners on machines that have the Claude login (second laptop,
headless mini PC, home VM).
