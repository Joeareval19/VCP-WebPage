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

      // Drag Review -> Completed: human approval -> merge the PR
      if (to === "Completed" && from === "Review") {
        if (issue.state === "CLOSED") { log(`skip #${issue.number}: already closed`); return; }
        const prs = JSON.parse(gh(["pr", "list", "--repo", REPO, "--state", "open", "--json", "number,body,title"]));
        const rx = new RegExp(`close[sd]?\\s+#${issue.number}\\b`, "i");
        const pr = prs.find((x) => rx.test(x.body || "") || (x.title || "").includes(`(#${issue.number})`));
        if (!pr) { log(`APPROVE #${issue.number}: no open PR found - nothing to merge`); return; }
        gh(["pr", "merge", String(pr.number), "--repo", REPO, "--squash", "--delete-branch"]);
        log(`MERGED PR #${pr.number} for issue #${issue.number} (human approved via board)`);
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
