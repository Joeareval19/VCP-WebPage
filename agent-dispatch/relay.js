// VCP Dispatch Relay (Phase B of issue #6)
// GitHub App webhook -> smee.io channel -> this relay -> repository_dispatch
// Fires `card-started` when a VCP Tracker card moves to "Started" and the
// issue has no assignee yet (a human drag, not a workflow claim).
const crypto = require("crypto");
const http = require("http");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const SmeeClient = require("smee-client");

const SECRET = fs.readFileSync(path.join(__dirname, "webhook-secret.txt"), "utf8").trim();
const SMEE_URL = fs.readFileSync(path.join(__dirname, "smee-url.txt"), "utf8").trim();
const PORT = 3999;
const REPO = "Joeareval19/VCP-WebPage";

function log(m) {
  const line = `${new Date().toISOString()} ${m}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, "relay.log"), line + "\n"); } catch {}
}

function verify(sig, body) {
  if (!sig) return false;
  const h = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(h)); } catch { return false; }
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

// Board coordinates for the merge guard (#21). Completed (96b35fff) is never
// a bounce target — a card only rests there if its work actually merged.
const PROJECT_ID = "PVT_kwHOBdoj_c4BcT54";
const STATUS_FIELD = "PVTSSF_lAHOBdoj_c4BcT54zhW9rGs";
const STATUS_OPTIONS = { Pending: "945c8a59", Started: "de246815", Review: "18317928" };

function bounce(itemNodeId, columnName) {
  const opt = STATUS_OPTIONS[columnName] || STATUS_OPTIONS.Review;
  const m = `mutation { updateProjectV2ItemFieldValue(input: {projectId: "${PROJECT_ID}", itemId: "${itemNodeId}", fieldId: "${STATUS_FIELD}", value: {singleSelectOptionId: "${opt}"}}) { projectV2Item { id } } }`;
  gh(["api", "graphql", "-f", `query=${m}`]);
}

function comment(issueNumber, body) {
  gh(["issue", "comment", String(issueNumber), "--repo", REPO, "--body", body]);
}

// The human-readable reason for a failed gh call. execFileSync puts the
// command echo on message line 1; gh's actual reason (e.g. "GraphQL: Pull
// request is not mergeable") is the last non-empty stderr line.
function reasonOf(e) {
  const src = String((e && e.stderr) || (e && e.message) || e).trim();
  const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "unknown error";
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    res.writeHead(200);
    res.end("ok");
    try {
      const body = Buffer.concat(chunks);
      if (req.headers["x-github-event"] !== "projects_v2_item") return;
      // NOTE: smee re-serializes the payload, so HMAC over forwarded bytes can
      // differ from GitHub's original. Signature mismatch is logged as a
      // warning, not a drop — the unguessable smee channel URL is the
      // effective guard in this dev-grade relay. A production relay
      // (Cloudflare Worker) would enforce this strictly.
      if (!verify(req.headers["x-hub-signature-256"], body)) {
        log("WARN signature mismatch (smee re-serialization is the usual cause)");
      }
      const p = JSON.parse(body.toString("utf8"));
      if (p.action !== "edited") return;
      const fv = p.changes && p.changes.field_value;
      if (!fv || fv.field_name !== "Status") return;
      const to = fv.to && fv.to.name;
      const from = fv.from && fv.from.name;
      if (to === from) return;
      const item = p.projects_v2_item;
      if (!item || item.content_type !== "Issue") return;
      const q = `query { node(id: "${item.content_node_id}") { ... on Issue { number state assignees(first: 1) { totalCount } } } }`;
      const out = JSON.parse(gh(["api", "graphql", "-f", `query=${q}`]));
      const issue = out.data && out.data.node;
      if (!issue || typeof issue.number !== "number") return;

      // Drag -> Started: dispatch an agent (only for unclaimed tickets)
      if (to === "Started") {
        if (issue.assignees.totalCount > 0) {
          log(`skip #${issue.number}: already assigned (workflow claim or human)`);
          return;
        }
        gh(["api", `repos/${REPO}/dispatches`, "-f", "event_type=card-started", "-F", `client_payload[issue]=${issue.number}`]);
        log(`DISPATCHED card-started for issue #${issue.number}`);
        return;
      }

      // Card lands in Review: dispatch the AI auditor — but only if the PR
      // hasn't been audited yet (the native pull_request trigger covers
      // fresh PRs; this path is for drag-driven re-reviews).
      if (to === "Review") {
        const prs = JSON.parse(gh(["pr", "list", "--repo", REPO, "--state", "open", "--json", "number,body,title,labels"]));
        const rx = new RegExp(`close[sd]?\\s+#${issue.number}\\b`, "i");
        const pr = prs.find((x) => rx.test(x.body || "") || (x.title || "").includes(`(#${issue.number})`));
        if (!pr) { log(`REVIEW #${issue.number}: no open PR found - nothing to audit`); return; }
        const audited = (pr.labels || []).some((l) => l.name === "ai-approved" || l.name === "ai-changes-requested");
        if (audited) { log(`REVIEW #${issue.number}: PR #${pr.number} already audited - skip (use workflow_dispatch to force)`); return; }
        gh(["api", `repos/${REPO}/dispatches`, "-f", "event_type=card-review", "-F", `client_payload[pr]=${pr.number}`]);
        log(`DISPATCHED card-review for PR #${pr.number} (issue #${issue.number})`);
        return;
      }

      // Any drag INTO Completed: merge guard (#21). A card may only rest in
      // Completed if the issue is closed or its PR merges right now —
      // otherwise bounce the card back and self-report on the ticket.
      if (to === "Completed") {
        if (issue.state === "CLOSED") { log(`skip #${issue.number}: already closed`); return; }
        try {
          const prs = JSON.parse(gh(["pr", "list", "--repo", REPO, "--state", "open", "--json", "number,body,title"]));
          const rx = new RegExp(`close[sd]?\\s+#${issue.number}\\b`, "i");
          const pr = prs.find((x) => rx.test(x.body || "") || (x.title || "").includes(`(#${issue.number})`));
          if (!pr) {
            const target = STATUS_OPTIONS[from] ? from : "Review";
            bounce(item.node_id, target);
            comment(issue.number, `Card was dragged to **Completed**, but no open PR closes this issue — nothing to merge. Bounced back to **${target}**. Open a PR with \`Closes #${issue.number}\`, then drag to Completed again.`);
            log(`BOUNCE #${issue.number}: no open PR -> ${target}`);
            return;
          }
          // Pre-check mergeability: only a definite CONFLICTING short-circuits;
          // UNKNOWN/MERGEABLE proceed to the guarded merge below.
          const view = JSON.parse(gh(["pr", "view", String(pr.number), "--repo", REPO, "--json", "mergeable,mergeStateStatus"]));
          if (view.mergeable === "CONFLICTING") {
            bounce(item.node_id, "Review");
            comment(issue.number, `Approval received, but PR #${pr.number} has **merge conflicts with main** (state: ${view.mergeStateStatus}). Bounced back to **Review**. Resolve the conflicts, then drag to Completed again.`);
            log(`BOUNCE #${issue.number}: PR #${pr.number} CONFLICTING -> Review`);
            return;
          }
          try {
            gh(["pr", "merge", String(pr.number), "--repo", REPO, "--squash", "--delete-branch"]);
            log(`MERGED PR #${pr.number} for issue #${issue.number} (human approved via board)`);
          } catch (e) {
            const reason = reasonOf(e);
            bounce(item.node_id, "Review");
            comment(issue.number, `Approval received, but merging PR #${pr.number} failed: \`${reason}\`. Bounced back to **Review** — fix the blocker, then drag to Completed again.`);
            log(`BOUNCE #${issue.number}: merge of PR #${pr.number} failed (${reason}) -> Review`);
          }
        } catch (e) {
          // Any other failure in the guard (transient gh error, bad JSON)
          // must not leave the card resting in Completed unmerged — that is
          // the exact silent failure #21 exists to kill. Bounce to Review;
          // if even the bounce fails, log loudly for the outer catch.
          const reason = reasonOf(e);
          try {
            bounce(item.node_id, "Review");
            comment(issue.number, `Card was dragged to **Completed**, but the merge guard hit an unexpected error before it could merge: \`${reason}\`. Bounced back to **Review** — check the relay log, then drag to Completed again.`);
          } catch (e2) {
            log(`ERROR guard bounce for #${issue.number} also failed: ${reasonOf(e2)}`);
          }
          log(`BOUNCE #${issue.number}: guard error (${reason}) -> Review`);
        }
        return;
      }
    } catch (e) {
      log("ERROR " + e.message);
    }
  });
});

server.listen(PORT, () => {
  log(`relay listening on :${PORT}, smee source ${SMEE_URL}`);
  const smee = new SmeeClient({ source: SMEE_URL, target: `http://localhost:${PORT}/hook`, logger: { info: () => {}, error: (e) => log("SMEE " + e) } });
  smee.start();
});
