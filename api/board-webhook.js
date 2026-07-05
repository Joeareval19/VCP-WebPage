/*
 * Vercel Function — the always-on replacement for agent-dispatch/relay.js's
 * webhook receiver (issue #51). GitHub App webhook -> this endpoint,
 * directly, no smee.io tunnel in between.
 *
 * Why this exists: the previous chain (GitHub App -> smee.io free tunnel ->
 * relay.js on Jose's laptop) had two independent points of failure —
 * smee.io's best-effort delivery, and the laptop's relay process needing to
 * be alive to receive it. Both failed simultaneously on 2026-07-05 (issue
 * #3/#30 sat at Completed with PR #38 unmerged for over an hour; the 5-min
 * Board Integrity Sweep fallback also didn't run because it shares the same
 * self-hosted-runner dependency). This endpoint removes the smee.io hop
 * entirely and needs no local machine to be online to receive the webhook —
 * only the merge/dispatch actions it triggers still depend on other
 * infrastructure (self-hosted runners for agent dispatch specifically; see
 * agent-dispatch/README.md's subscription-auth-only constraint, unchanged
 * by this endpoint).
 *
 * Ports relay.js's logic 1:1, with one structural difference: this runs in
 * a serverless function with no local `gh` CLI available, so every gh
 * shell-out becomes a direct GitHub REST/GraphQL fetch() call.
 *
 * Config: set BOARD_WEBHOOK_SECRET (the GitHub App's webhook secret — same
 * value as the old worker's webhook-secret.txt) and
 * BOARD_WEBHOOK_GITHUB_TOKEN (a classic PAT with `repo` + `project` scopes,
 * dedicated to this endpoint — not reused from the voice-feedback
 * pipeline's token or Jose's local gh auth) in Vercel project env vars.
 *
 * Manual step this endpoint depends on (cannot be done from here): the
 * GitHub App's webhook delivery URL must be repointed from the smee.io
 * channel to this function's deployed URL, in the GitHub App's settings —
 * not reachable via the REST API or CLI token available to agents.
 */

const crypto = require("crypto");

const REPO_OWNER = "Joeareval19";
const REPO_NAME = "VCP-WebPage";
const REPO = REPO_OWNER + "/" + REPO_NAME;
const PROJECT_ID = "PVT_kwHOBdoj_c4BcT54";
const STATUS_FIELD = "PVTSSF_lAHOBdoj_c4BcT54zhW9rGs";
const STATUS_OPTIONS = { Pending: "945c8a59", Started: "de246815", Review: "18317928", Completed: "96b35fff" };

const SUPABASE_URL = "https://qaorlbgrkpldcatyntlw.supabase.co";

function verify(signature, rawBody) {
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", process.env.BOARD_WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (e) {
    return false; // length mismatch or similar — never let a crash pass verification
  }
}

function gh(path, options) {
  return fetch("https://api.github.com" + path, Object.assign({}, options, {
    headers: Object.assign(
      {
        Authorization: "Bearer " + process.env.BOARD_WEBHOOK_GITHUB_TOKEN,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      options && options.headers
    ),
  }));
}

function ghGraphQL(query) {
  return gh("/graphql", { method: "POST", body: JSON.stringify({ query: query }) }).then(function (r) { return r.json(); });
}

async function bounce(itemNodeId, columnName) {
  const opt = STATUS_OPTIONS[columnName] || STATUS_OPTIONS.Review;
  await ghGraphQL(
    'mutation { updateProjectV2ItemFieldValue(input: {projectId: "' + PROJECT_ID + '", itemId: "' + itemNodeId + '", fieldId: "' + STATUS_FIELD + '", value: {singleSelectOptionId: "' + opt + '"}}) { projectV2Item { id } } }'
  );
}

async function commentOn(issueNumber, body) {
  await gh("/repos/" + REPO + "/issues/" + issueNumber + "/comments", {
    method: "POST",
    body: JSON.stringify({ body: body }),
  });
}

function capture(eventType, fields) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return; // fire-and-forget, non-blocking — see relay.js's identical convention
  const row = Object.assign({ source: "board-webhook", event_type: eventType }, fields);
  fetch(SUPABASE_URL + "/rest/v1/vcp_pipeline_events", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  }).catch(function () {}); // a Supabase outage must never block the pipeline
}

async function findOpenPrClosing(issueNumber) {
  const resp = await gh("/repos/" + REPO + "/pulls?state=open&per_page=100");
  const prs = resp.ok ? await resp.json() : [];
  const rx = new RegExp("close[sd]?\\s+#" + issueNumber + "\\b", "i");
  return prs.find(function (p) { return rx.test(p.body || "") || (p.title || "").includes("(#" + issueNumber + ")"); }) || null;
}

async function handleStarted(issue, item, from, to) {
  if (issue.assignees && issue.assignees.length > 0) {
    capture("skip", { issue_number: issue.number, from_status: from, to_status: to, detail: { reason: "already assigned" } });
    return;
  }
  await gh("/repos/" + REPO + "/dispatches", {
    method: "POST",
    body: JSON.stringify({ event_type: "card-started", client_payload: { issue: issue.number } }),
  });
  capture("dispatch", { issue_number: issue.number, from_status: from, to_status: to, detail: { kind: "card-started" } });
}

async function handleReview(issue, item, from, to) {
  const pr = await findOpenPrClosing(issue.number);
  if (!pr) {
    capture("skip", { issue_number: issue.number, from_status: from, to_status: to, detail: { reason: "no open PR to audit" } });
    return;
  }
  const audited = (pr.labels || []).some(function (l) { return l.name === "ai-approved" || l.name === "ai-changes-requested"; });
  if (audited) {
    capture("skip", { issue_number: issue.number, pr_number: pr.number, from_status: from, to_status: to, detail: { reason: "already audited" } });
    return;
  }
  await gh("/repos/" + REPO + "/dispatches", {
    method: "POST",
    body: JSON.stringify({ event_type: "card-review", client_payload: { pr: pr.number } }),
  });
  capture("dispatch", { issue_number: issue.number, pr_number: pr.number, from_status: from, to_status: to, detail: { kind: "card-review" } });
}

// Merge guard (mirrors relay.js's issue #21 logic exactly): a card may only
// rest in Completed if its issue is closed or its PR merges right now.
async function handleCompleted(issue, item, from, to) {
  if (issue.state === "closed") {
    capture("skip", { issue_number: issue.number, from_status: from, to_status: to, detail: { reason: "already closed" } });
    return;
  }

  const pr = await findOpenPrClosing(issue.number);
  if (!pr) {
    const target = STATUS_OPTIONS[from] ? from : "Review";
    await bounce(item.node_id, target);
    await commentOn(issue.number, "Card was dragged to **Completed**, but no open PR closes this issue — nothing to merge. Bounced back to **" + target + "**. Open a PR with `Closes #" + issue.number + "`, then drag to Completed again.");
    capture("bounce", { issue_number: issue.number, from_status: "Completed", to_status: target, detail: { reason: "no open PR" } });
    return;
  }

  const detailResp = await gh("/repos/" + REPO + "/pulls/" + pr.number);
  const detail = detailResp.ok ? await detailResp.json() : null;

  // GitHub computes mergeable_state asynchronously; null/"unknown" is not a
  // conflict, only "dirty" (their conflicting-state string) short-circuits —
  // same "only a definite CONFLICTING short-circuits" rule as relay.js.
  if (detail && detail.mergeable_state === "dirty") {
    await bounce(item.node_id, "Review");
    await commentOn(issue.number, "Approval received, but PR #" + pr.number + " has **merge conflicts with main**. Bounced back to **Review**. Resolve the conflicts, then drag to Completed again.");
    capture("bounce", { issue_number: issue.number, pr_number: pr.number, from_status: "Completed", to_status: "Review", detail: { reason: "conflicting with main" } });
    return;
  }

  const mergeResp = await gh("/repos/" + REPO + "/pulls/" + pr.number + "/merge", {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });

  if (mergeResp.ok) {
    // Delete the branch, matching relay.js's --delete-branch. Best-effort:
    // a failure here shouldn't undo a merge that already succeeded.
    if (detail && detail.head && detail.head.ref) {
      await gh("/repos/" + REPO + "/git/refs/heads/" + encodeURIComponent(detail.head.ref), { method: "DELETE" }).catch(function () {});
    }
    capture("merge", { issue_number: issue.number, pr_number: pr.number, from_status: from, to_status: "Completed" });
    return;
  }

  const errBody = await mergeResp.json().catch(function () { return {}; });
  const reason = errBody.message || ("HTTP " + mergeResp.status);
  await bounce(item.node_id, "Review");
  await commentOn(issue.number, "Approval received, but merging PR #" + pr.number + " failed: `" + reason + "`. Bounced back to **Review** — fix the blocker, then drag to Completed again.");
  capture("bounce", { issue_number: issue.number, pr_number: pr.number, from_status: "Completed", to_status: "Review", detail: { reason: "merge failed: " + reason } });
}

// Body parsing is disabled (see config export below) specifically so HMAC
// verification runs against GitHub's exact raw bytes — re-serializing an
// already-parsed body via JSON.stringify is not guaranteed to reproduce
// the sender's exact byte sequence (key order, whitespace), which would
// make the signature check unreliable in a way that's hard to notice
// until it silently rejects (or worse, silently accepts) real traffic.
function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const rawBody = await readRawBody(req);
  if (!verify(req.headers["x-hub-signature-256"], rawBody)) {
    // Unlike relay.js (warning-only, because smee.io re-serialization made
    // strict verification unreliable), a direct GitHub webhook has no
    // re-serialization step in between — a mismatch here is a real signal,
    // not transport noise, so this is a hard reject.
    res.status(401).send("signature verification failed");
    return;
  }

  res.status(200).send("ok"); // ack immediately; GitHub retries on non-2xx, not on slow processing

  try {
    if (req.headers["x-github-event"] !== "projects_v2_item") return;
    const p = JSON.parse(rawBody.toString("utf8"));
    if (p.action !== "edited") return;
    const fv = p.changes && p.changes.field_value;
    if (!fv || fv.field_name !== "Status") return;
    const to = fv.to && fv.to.name;
    const from = fv.from && fv.from.name;
    if (to === from) return;
    const item = p.projects_v2_item;
    if (!item || item.content_type !== "Issue") return;

    const q = 'query { node(id: "' + item.content_node_id + '") { ... on Issue { number state assignees(first: 1) { nodes { login } } } } }';
    const out = await ghGraphQL(q);
    const issue = out.data && out.data.node;
    if (!issue || typeof issue.number !== "number") return;
    issue.assignees = (issue.assignees && issue.assignees.nodes) || [];
    issue.state = (issue.state || "").toLowerCase();

    capture("status_change", { issue_number: issue.number, from_status: from, to_status: to });

    if (to === "Started") { await handleStarted(issue, item, from, to); return; }
    if (to === "Review") { await handleReview(issue, item, from, to); return; }
    if (to === "Completed") { await handleCompleted(issue, item, from, to); return; }
  } catch (err) {
    // Response already sent (ack-then-process) — nothing more to do but
    // make sure this failure is visible via Vercel's function logs.
    console.error("[board-webhook] ERROR", err);
  }
};

// Required so req.body is NOT pre-parsed — readRawBody() above needs the
// untouched byte stream for HMAC verification to be meaningful.
module.exports.config = { api: { bodyParser: false } };
