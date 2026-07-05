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
 * Lifecycle (PR #54 audit, BLOCKER 1): ALL side effects run BEFORE the
 * response is sent. Vercel does not guarantee execution after the response,
 * and GitHub does NOT auto-retry webhook deliveries on non-2xx (manual
 * redelivery only) — so ack-early bought nothing and risked a suspended
 * instance mid-merge. The full merge path is a handful of API calls, well
 * inside the function limit; if GitHub's 10s delivery window lapses first
 * it merely logs a timeout on their side while this invocation completes.
 * A processing failure returns 500 so it is visible in the GitHub App's
 * delivery log, where redelivery can be triggered by hand.
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
// Completed (96b35fff) is deliberately absent: it is never a bounce target,
// and keeping it out makes that invariant structural (relay.js convention).
const STATUS_OPTIONS = { Pending: "945c8a59", Started: "de246815", Review: "18317928" };

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

// Throws on HTTP or GraphQL-level failure (PR #54 audit, NOTE 3): a failed
// board mutation must never be recorded as a success. Callers that can
// recover (the guard catch) handle the throw; nothing swallows it silently.
async function ghGraphQL(query) {
  const r = await gh("/graphql", { method: "POST", body: JSON.stringify({ query: query }) });
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok || (j.errors && j.errors.length)) {
    const msg = (j.errors && j.errors[0] && j.errors[0].message) || ("HTTP " + r.status);
    throw new Error("GraphQL failed: " + msg);
  }
  return j;
}

async function bounce(itemNodeId, columnName) {
  const opt = STATUS_OPTIONS[columnName] || STATUS_OPTIONS.Review;
  await ghGraphQL(
    'mutation { updateProjectV2ItemFieldValue(input: {projectId: "' + PROJECT_ID + '", itemId: "' + itemNodeId + '", fieldId: "' + STATUS_FIELD + '", value: {singleSelectOptionId: "' + opt + '"}}) { projectV2Item { id } } }'
  );
}

// Best-effort by design: a failed comment must not undo a bounce/merge that
// already happened, but it is logged and captured as a failure, not silence.
async function commentOn(issueNumber, body) {
  const resp = await gh("/repos/" + REPO + "/issues/" + issueNumber + "/comments", {
    method: "POST",
    body: JSON.stringify({ body: body }),
  });
  if (!resp.ok) {
    console.error("[board-webhook] comment on #" + issueNumber + " failed: HTTP " + resp.status);
    capture("error", { issue_number: issueNumber, detail: { kind: "comment failed", status: resp.status } });
  }
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
  if (!resp.ok) throw new Error("PR list failed: HTTP " + resp.status);
  const prs = await resp.json();
  const rx = new RegExp("close[sd]?\\s+#" + issueNumber + "\\b", "i");
  return prs.find(function (p) { return rx.test(p.body || "") || (p.title || "").includes("(#" + issueNumber + ")"); }) || null;
}

async function handleStarted(issue, item, from, to) {
  if (issue.assignees && issue.assignees.length > 0) {
    capture("skip", { issue_number: issue.number, from_status: from, to_status: to, detail: { reason: "already assigned" } });
    return;
  }
  const resp = await gh("/repos/" + REPO + "/dispatches", {
    method: "POST",
    body: JSON.stringify({ event_type: "card-started", client_payload: { issue: issue.number } }),
  });
  if (resp.status === 204) {
    capture("dispatch", { issue_number: issue.number, from_status: from, to_status: to, detail: { kind: "card-started" } });
  } else {
    console.error("[board-webhook] card-started dispatch for #" + issue.number + " failed: HTTP " + resp.status);
    capture("error", { issue_number: issue.number, from_status: from, to_status: to, detail: { kind: "card-started dispatch failed", status: resp.status } });
  }
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
  const resp = await gh("/repos/" + REPO + "/dispatches", {
    method: "POST",
    body: JSON.stringify({ event_type: "card-review", client_payload: { pr: pr.number } }),
  });
  if (resp.status === 204) {
    capture("dispatch", { issue_number: issue.number, pr_number: pr.number, from_status: from, to_status: to, detail: { kind: "card-review" } });
  } else {
    console.error("[board-webhook] card-review dispatch for PR #" + pr.number + " failed: HTTP " + resp.status);
    capture("error", { issue_number: issue.number, pr_number: pr.number, from_status: from, to_status: to, detail: { kind: "card-review dispatch failed", status: resp.status } });
  }
}

// Merge guard (mirrors relay.js's issue #21 logic exactly): a card may only
// rest in Completed if its issue is closed or its PR merges right now.
// The whole body is wrapped so a transient failure anywhere inside bounces
// the card instead of leaving it resting unmerged (PR #54 audit, BLOCKER 2 —
// the same guard catch relay.js carries).
async function handleCompleted(issue, item, from, to) {
  if (issue.state === "closed") {
    capture("skip", { issue_number: issue.number, from_status: from, to_status: to, detail: { reason: "already closed" } });
    return;
  }

  try {
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
        try {
          await gh("/repos/" + REPO + "/git/refs/heads/" + encodeURIComponent(detail.head.ref), { method: "DELETE" });
        } catch (e) { /* repo-level delete_branch_on_merge covers this anyway */ }
      }
      capture("merge", { issue_number: issue.number, pr_number: pr.number, from_status: from, to_status: "Completed" });
      return;
    }

    const errBody = await mergeResp.json().catch(function () { return {}; });
    const reason = errBody.message || ("HTTP " + mergeResp.status);
    await bounce(item.node_id, "Review");
    await commentOn(issue.number, "Approval received, but merging PR #" + pr.number + " failed: `" + reason + "`. Bounced back to **Review** — fix the blocker, then drag to Completed again.");
    capture("bounce", { issue_number: issue.number, pr_number: pr.number, from_status: "Completed", to_status: "Review", detail: { reason: "merge failed: " + reason } });
  } catch (e) {
    // Any other failure in the guard (transient API error, bad JSON) must
    // not leave the card resting in Completed unmerged — that is the exact
    // silent failure the guard exists to kill. Bounce to Review; if even
    // the bounce fails, log loudly and rethrow so the delivery returns 500
    // and the failure is visible in the GitHub App's delivery log.
    const reason = String((e && e.message) || e).split("\n")[0];
    try {
      await bounce(item.node_id, "Review");
      await commentOn(issue.number, "Card was dragged to **Completed**, but the merge guard hit an unexpected error before it could merge: `" + reason + "`. Bounced back to **Review** — check the board-webhook function logs, then drag to Completed again.");
      capture("bounce", { issue_number: issue.number, from_status: "Completed", to_status: "Review", detail: { reason: "guard error: " + reason } });
    } catch (e2) {
      console.error("[board-webhook] guard bounce for #" + issue.number + " also failed", e2);
      capture("error", { issue_number: issue.number, detail: { kind: "guard bounce failed", reason: reason } });
      throw e;
    }
  }
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

async function processEvent(rawBody, eventName) {
  if (eventName !== "projects_v2_item") return;
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
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const rawBody = await readRawBody(req);

  // Fail loudly, not silently, if the runtime consumed the stream despite
  // the bodyParser config (PR #54 audit, NOTE 4): real GitHub deliveries
  // are never empty, so an empty raw body means the config didn't take and
  // every delivery would 401 forever. 500 makes it visible immediately.
  if (rawBody.length === 0) {
    console.error("[board-webhook] empty raw body — bodyParser config may not be honored by this runtime");
    res.status(500).send("empty body: raw-body read failed");
    return;
  }

  if (!verify(req.headers["x-hub-signature-256"], rawBody)) {
    // Unlike relay.js (warning-only, because smee.io re-serialization made
    // strict verification unreliable), a direct GitHub webhook has no
    // re-serialization step in between — a mismatch here is a real signal,
    // not transport noise, so this is a hard reject.
    res.status(401).send("signature verification failed");
    return;
  }

  // Process BEFORE responding (see lifecycle note in the header). A failure
  // returns 500 so it shows as a failed delivery in the GitHub App's
  // delivery log, where it can be redelivered by hand.
  try {
    await processEvent(rawBody, req.headers["x-github-event"]);
    res.status(200).send("ok");
  } catch (err) {
    console.error("[board-webhook] ERROR", err);
    capture("error", { detail: { kind: "processing failed", message: String((err && err.message) || err).slice(0, 300) } });
    res.status(500).send("processing failed");
  }
};

// Required so req.body is NOT pre-parsed — readRawBody() above needs the
// untouched byte stream for HMAC verification to be meaningful.
module.exports.config = { api: { bodyParser: false } };
