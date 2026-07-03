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
- Parallel agents: 3 runners (vcp-laptop, -2, -3); per-issue concurrency still one agent per ticket
- Workflow concurrency: one agent per issue number
- Agent capped at --max-turns 100; failures are commented on the ticket
