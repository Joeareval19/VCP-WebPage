/*
 * Vercel Function — turns a finished voice-to-spec session into a real
 * Pending ticket on the VCP Tracker, and records the final session state
 * in Supabase. The last step of issue #43's pipeline.
 *
 * Exists so GITHUB_TOKEN and SUPABASE_SERVICE_ROLE_KEY never reach
 * client-side JS (public repo — anything in browser code is visible to
 * any visitor). The client (js/voice-widget.js's endSession()) POSTs the
 * redacted transcript here once a session ends; this endpoint:
 *   1. Extracts a structured scope of work via Groq (why/what/acceptance
 *      criteria/out-of-scope — NOT generic likes/dislikes, see issue #43's
 *      amended spec).
 *   2. Upserts the session into Supabase's vcp_voice_sessions table (schema
 *      shipped in #52/#53), adding summary/status on top of whatever
 *      transcript api/next-turn.js already persisted turn-by-turn — this is
 *      the FINAL write in a session, not the only one (see next-turn.js's
 *      durability requirement comment). Replaces the original design's
 *      "create a secret Gist" transcript-retention approach now that a
 *      real table exists for exactly this purpose.
 *   3. Files a GitHub issue and adds it to the VCP Tracker board with
 *      Status = Pending — mirroring what /vcp-spec does for human-filed
 *      specs (see .claude/skills/vcp-spec/SKILL.md).
 *   4. Writes the resulting issue number back onto the Supabase row's
 *      filed_issue column.
 *
 * Why a service-role Supabase key, not the anon/publishable key: the
 * vcp_voice_sessions RLS policy (anon_insert_voice) is INSERT-only for the
 * anon role — no select/update/delete. Step 2's insert could use the anon
 * key, but step 4's update to filed_issue cannot, so this whole flow uses
 * the service-role key throughout for one consistent code path rather than
 * splitting session-insert (anon, client-callable) from filed_issue-update
 * (privileged, server-only) across two different credentials.
 *
 * Config: set GITHUB_TOKEN, GROQ_API_KEY, SUPABASE_SERVICE_ROLE_KEY in
 * Vercel project env vars — never commit any of them. GITHUB_TOKEN can
 * revert to a fine-grained PAT (Issues: write, Contents: read) now that
 * Gist creation is no longer needed — the classic-PAT-with-gist-scope
 * requirement from the original design no longer applies.
 */

const rateLimit = require("./_rate-limit.js");

const REPO_OWNER = "Joeareval19";
const REPO_NAME = "VCP-WebPage";
const PROJECT_ID = "PVT_kwHOBdoj_c4BcT54";
const STATUS_FIELD_ID = "PVTSSF_lAHOBdoj_c4BcT54zhW9rGs";
const PENDING_OPTION_ID = "945c8a59";
const CATEGORY_DIGIT = "7"; // Site-wide / Platform — see wiki/VCP AI Workflow/Spec Categories.md
const MAX_PER_MINUTE = 5; // this fires at most once per session (on close), unlike next-turn's per-turn calls

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const MAX_TRANSCRIPT_LENGTH = 8000;

const SUPABASE_URL = "https://qaorlbgrkpldcatyntlw.supabase.co";

const SUMMARY_SYSTEM_PROMPT = [
  "You extract a well-defined scope of work from a redacted voice conversation between an intake assistant and an anonymous website visitor.",
  "Respond with ONLY a JSON object (no markdown fences, no commentary) with this exact shape:",
  '{"title": "short issue title, under 70 chars", "why": "one paragraph: why this matters, who is affected", "what": ["concrete change or deliverable, one per item"], "acceptance_criteria": ["testable criterion, one per item"], "out_of_scope": ["explicitly excluded item, one per item"], "quotes": ["short verbatim visitor quotes"]}',
  "Any array may be empty if the transcript has nothing for that category. Never invent content not present in the transcript.",
].join(" ");

function gh(path, options) {
  return fetch("https://api.github.com" + path, Object.assign({}, options, {
    headers: Object.assign(
      {
        Authorization: "Bearer " + process.env.GITHUB_TOKEN,
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

function supabase(path, options) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(SUPABASE_URL + "/rest/v1" + path, Object.assign({}, options, {
    headers: Object.assign(
      {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      options && options.headers
    ),
  }));
}

// Upsert, not insert: api/next-turn.js already writes (and overwrites) this
// session's row after every turn (issue #43's durability requirement), so
// by the time a session ends cleanly the row almost always already exists.
// This call is the FINAL upsert — it adds summary/status, on top of
// whatever transcript next-turn.js's last call already persisted. Server-
// side, service-role key throughout: this endpoint already has everything
// (transcript, extracted scope) in one place by the time it runs, so one
// write here is simpler than an anon INSERT from the client followed by a
// separate privileged UPDATE. See the file header for why one consistent
// credential/code path was chosen over splitting it.
async function recordVoiceSession(fields) {
  const resp = await supabase("/vcp_voice_sessions?on_conflict=session_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(fields),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(function () { return ""; });
    throw new Error("Supabase upsert failed: " + detail);
  }
  const rows = await resp.json();
  return rows[0];
}

async function setFiledIssue(sessionId, issueNumber) {
  // Best-effort — a failure here shouldn't undo a ticket that already
  // filed successfully. The row still has the full transcript either way.
  await supabase("/vcp_voice_sessions?session_id=eq." + encodeURIComponent(sessionId), {
    method: "PATCH",
    body: JSON.stringify({ filed_issue: issueNumber }),
  }).catch(function () {});
}

// Mirrors /vcp-spec's code computation (.claude/skills/vcp-spec/SKILL.md
// Step 1): scan ALL existing titles (not just voice-feedback-labeled ones)
// for the highest [D####] in this category's digit, increment by one.
// Deliberately unscoped by label — this counter and /vcp-spec's must agree
// on the same GitHub state, or two Site-wide/Platform specs filed around
// the same time (one by a human, one by this endpoint) could compute the
// same next number and collide.
async function nextSpecCode() {
  const resp = await gh(
    "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues?state=all&per_page=100"
  );
  const issues = resp.ok ? await resp.json() : [];
  const pattern = new RegExp("^\\[" + CATEGORY_DIGIT + "(\\d{4})\\]");
  const base = parseInt(CATEGORY_DIGIT + "0000", 10);
  let max = base;
  issues.forEach(function (issue) {
    const m = pattern.exec(issue.title || "");
    if (m) max = Math.max(max, base + parseInt(m[1], 10));
  });
  return "[" + (max + 1) + "]";
}

function bodyFor(scope, pageContext, sessionId) {
  const section = function (label, items) {
    if (!items || items.length === 0) return "";
    return "\n### " + label + "\n" + items.map(function (i) { return "- " + i; }).join("\n") + "\n";
  };
  return [
    "## Why",
    scope.why || "_Not captured in this session._",
    "\n## Source",
    "Auto-filed from a voice-to-spec session (issue #43). Session ID: `" + sessionId + "`. Page: `" + pageContext + "`. Full transcript retained in Supabase (`vcp_voice_sessions`, service-role access only).",
    "This is unreviewed raw visitor input — treat like any other Pending spec: verify, edit, or close if not actionable.",
    section("What", scope.what),
    section("Acceptance criteria", scope.acceptance_criteria),
    section("Out of scope", scope.out_of_scope),
    section("Quotes", scope.quotes),
    "\n---\n**Category:** Site-wide / Platform (voice-to-spec pipeline) — see `wiki/VCP AI Workflow/Spec Categories.md`.",
  ].filter(Boolean).join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!rateLimit.allow(req, MAX_PER_MINUTE)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  if (!process.env.GITHUB_TOKEN || !process.env.GROQ_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Feedback filing is not configured on the server" });
    return;
  }

  const { transcript, pageContext, sessionId, durationMs } = req.body || {};
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    res.status(400).json({ error: "Missing required field: transcript" });
    return;
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    res.status(400).json({ error: "transcript exceeds " + MAX_TRANSCRIPT_LENGTH + " characters" });
    return;
  }
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 100) {
    res.status(400).json({ error: "Missing or invalid required field: sessionId" });
    return;
  }
  if (pageContext !== undefined && (typeof pageContext !== "string" || pageContext.length > 500)) {
    res.status(400).json({ error: "pageContext must be a string under 500 characters" });
    return;
  }

  try {
    // 1. Extract a structured scope of work via Groq.
    const summaryResp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.GROQ_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!summaryResp.ok) {
      res.status(502).json({ error: "Summary extraction failed" });
      return;
    }
    const summaryData = await summaryResp.json();
    let scope;
    try {
      const raw = (summaryData.choices && summaryData.choices[0] && summaryData.choices[0].message.content) || "{}";
      scope = JSON.parse(raw.trim());
    } catch (e) {
      res.status(502).json({ error: "Summary extraction returned invalid JSON" });
      return;
    }

    // Nothing actionable came out of the session (e.g. visitor said nothing
    // substantive) — still record the session (status: abandoned), but
    // don't file noise onto the board.
    const hasContent = (scope.what || []).length > 0 || (scope.acceptance_criteria || []).length > 0;

    // 2. Record the session in Supabase — this happens regardless of
    // whether a ticket gets filed, since the transcript itself is the
    // cross-session review record the spec requires, independent of
    // whether any single session produced something actionable.
    await recordVoiceSession({
      session_id: sessionId,
      page_context: pageContext || "unknown",
      transcript: transcript,
      summary: hasContent ? JSON.stringify(scope) : null,
      status: hasContent ? "completed" : "abandoned",
      duration_ms: typeof durationMs === "number" ? durationMs : null,
    }).catch(function (err) {
      // Don't let a Supabase outage block ticket filing — log and continue.
      // eslint-disable-next-line no-console
      console.error("[file-feedback] Supabase insert failed", err.message);
    });

    if (!hasContent) {
      res.status(200).json({ filed: false, reason: "No actionable scope of work extracted" });
      return;
    }

    // 3. File the issue.
    const code = await nextSpecCode();
    const title = code + " Visitor scope: " + (scope.title || "voice session " + sessionId);
    const createResp = await gh("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues", {
      method: "POST",
      body: JSON.stringify({
        title: title,
        body: bodyFor(scope, pageContext || "unknown", sessionId),
        labels: ["voice-feedback", "spec"],
      }),
    });
    if (!createResp.ok) {
      const detail = await createResp.text().catch(function () { return ""; });
      res.status(502).json({ error: "Issue creation failed", detail: detail });
      return;
    }
    const issue = await createResp.json();

    // 4. Add to the VCP Tracker board as Pending (mirrors /vcp-spec Step 4).
    // GITHUB_TOKEN needs the `Projects: Read and write` fine-grained PAT
    // permission for this — a SEPARATE scope from `Issues: Read and write`
    // (step 3's requirement). A token with only Issues access creates the
    // issue fine but silently fails here with a FORBIDDEN GraphQL error —
    // "silently" being the exact bug this boardWarning check fixes: the
    // previous version only ever checked for a truthy itemId and never
    // inspected addItem.errors, so a token missing Projects access left
    // issues correctly filed but permanently invisible on the board with
    // zero indication anything had gone wrong (discovered via manual
    // end-to-end testing, 2026-07-05 — issue #80 filed successfully but
    // never appeared on the VCP Tracker).
    const addItem = await ghGraphQL(
      'mutation { addProjectV2ItemById(input: {projectId: "' + PROJECT_ID + '", contentId: "' + issue.node_id + '"}) { item { id } } }'
    );
    const itemId = addItem.data && addItem.data.addProjectV2ItemById && addItem.data.addProjectV2ItemById.item.id;
    var boardWarning = null;
    if (itemId) {
      const statusResp = await ghGraphQL(
        'mutation { updateProjectV2ItemFieldValue(input: {projectId: "' + PROJECT_ID + '", itemId: "' + itemId + '", fieldId: "' + STATUS_FIELD_ID + '", value: {singleSelectOptionId: "' + PENDING_OPTION_ID + '"}}) { projectV2Item { id } } }'
      );
      if (statusResp.errors) {
        boardWarning = "Added to board but failed to set Status=Pending: " + JSON.stringify(statusResp.errors);
        console.error("[file-feedback]", boardWarning);
      }
    } else {
      boardWarning = "Issue filed but NOT added to VCP Tracker board: " + JSON.stringify(addItem.errors || addItem);
      console.error("[file-feedback]", boardWarning);
    }

    // 5. Write the filed issue number back onto the session row.
    await setFiledIssue(sessionId, issue.number);

    res.status(200).json({ filed: true, issueNumber: issue.number, issueUrl: issue.html_url, boardWarning: boardWarning });
  } catch (err) {
    res.status(502).json({ error: "file-feedback failed", detail: err.message });
  }
};
