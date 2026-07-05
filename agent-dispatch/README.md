# Agent dispatch (issue #6)

Drag a VCP Tracker card to **Started** -> an agent on the worker machine implements the spec.

## Pipeline
GitHub App webhook (projects_v2_item) -> smee.io channel -> `relay.js` on the worker
-> `repository_dispatch: card-started` -> `.github/workflows/agent-build.yml`
-> self-hosted runner -> `claude -p` implements -> PR with `Closes #N`.

## Worker machine setup (as of 2026-07-03: Jose's laptop)
- Runner: `~/actions-runner/` (labels: `vcp-laptop`), autostart via Startup folder
- Relay: `~/vcp-dispatch/relay.js` (this file is the versioned copy), port 3999,
  autostart via Startup folder. Secrets live ONLY in `~/vcp-dispatch/` (not in git).
- Triggers that also work without the webhook: `ai-build` label, `gh workflow run agent-build.yml -f issue=N`

## Guards
- Relay: Status->Started + unassigned = dispatch agent; Review->Completed = human approval, auto-merges the PR
- Merge guard (#21): a card may only REST in Completed if its issue is closed or its PR squash-merges right now. Any drag into Completed with no open PR bounces back to the source column; a CONFLICTING PR or a failed merge bounces to Review. Every bounce posts one comment on the issue naming the PR and the reason.
- Board Integrity Sweep (#26/#37/#47, `.github/workflows/completed-sweep.yml`): every 5 min - (a) any card resting in Completed with an open issue is treated as a dropped-webhook approval: its `Closes #N` PR is squash-merged with the branch deleted when mergeable, and only unmergeable/PR-less work bounces back to Review with one issue comment; (b) any Started card whose issue has an open `Closes #N` PR moves to Review, log-only (covers PRs opened by local fan-out sessions that never touch the board)
- Parallel agents: 3 runners (vcp-laptop, -2, -3); per-issue concurrency still one agent per ticket
- Workflow concurrency: one agent per issue number
- Agent capped at --max-turns 100; failures are commented on the ticket

## Metadata capture (#41)
Pipeline metadata streams into the **vcp-ops** Supabase project
(`mgcczsxviukraxonnljm`, free tier): `tickets` (backfilled from gh),
`pipeline_events` (relay: every status change, dispatch, merge, bounce, skip),
`audits` (agent-review.yml: Sterling verdict + score per PR). RLS is on with
zero public policies — writes need the service-role key, which lives ONLY in
`~/vcp-dispatch/supabase-key.txt` on the worker (same convention as
webhook-secret.txt, never in git). Capture is fire-and-forget: a missing key
or Supabase outage logs WARN and never blocks dispatch/merge.

## Hard constraint: subscription auth only
Agents authenticate with Jose's Claude **subscription login** on the worker
machine — never `ANTHROPIC_API_KEY` billing. Do NOT move this workflow to
GitHub-hosted runners (they cannot use the local login). Scale by adding
self-hosted runners on machines that have the Claude login (second laptop,
headless mini PC, home VM).
