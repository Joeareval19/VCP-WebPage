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
      if (to !== "Started" || from === "Started") return;
      const item = p.projects_v2_item;
      if (!item || item.content_type !== "Issue") return;
      const q = `query { node(id: "${item.content_node_id}") { ... on Issue { number assignees(first: 1) { totalCount } } } }`;
      const out = JSON.parse(gh(["api", "graphql", "-f", `query=${q}`]));
      const issue = out.data && out.data.node;
      if (!issue || typeof issue.number !== "number") return;
      if (issue.assignees.totalCount > 0) {
        log(`skip #${issue.number}: already assigned (workflow claim or human)`);
        return;
      }
      gh(["api", `repos/${REPO}/dispatches`, "-f", "event_type=card-started", "-F", `client_payload[issue]=${issue.number}`]);
      log(`DISPATCHED card-started for issue #${issue.number}`);
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
