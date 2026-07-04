/*
 * Vercel Function — turns a finished voice-feedback session into a real
 * Pending ticket on the VCP Tracker, the last step of issue #43's pipeline.
 *
 * Exists so GITHUB_TOKEN never reaches client-side JS (public repo —
 * anything in browser code is visible to any visitor). The client
 * (js/voice-widget.js's endSession()) POSTs the redacted transcript here
 * once a session ends; this endpoint asks Groq to extract a structured
 * summary (likes/dislikes/suggestions/quotes), then files it as a GitHub
 * issue and adds it to the VCP Tracker board with Status = Pending —
 * mirroring what /vcp-spec does for human-filed specs (see
 * .claude/skills/vcp-spec/SKILL.md), so it lands on the board the same way.
 *
 * Config: set GITHUB_TOKEN (fine-grained PAT scoped to Joeareval19/VCP-WebPage,
 * Issues: write + Contents: read) and GROQ_API_KEY in Vercel project env
 * vars — never commit either. GITHUB_TOKEN should NOT be the same credential
 * used for the agent-dispatch pipeline (agent-dispatch/README.md); this is a
 * narrower, ticket-filing-only scope, kept separate on purpose.
 */

const REPO_OWNER = "Joeareval19";
const REPO_NAME = "VCP-WebPage";
const PROJECT_ID = "PVT_kwHOBdoj_c4BcT54";
const STATUS_FIELD_ID = "PVTSSF_lAHOBdoj_c4BcT54zhW9rGs";
const PENDING_OPTION_ID = "945c8a59";
const CATEGORY_DIGIT = "7"; // Site-wide / Platform — see wiki/VCP AI Workflow/Spec Categories.md

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const MAX_TRANSCRIPT_LENGTH = 8000;

const SUMMARY_SYSTEM_PROMPT = [
  "You extract structured feedback from a redacted voice-feedback transcript between an assistant and an anonymous website visitor.",
  "Respond with ONLY a JSON object (no markdown fences, no commentary) with this exact shape:",
  '{"title": "short issue title, under 70 chars", "likes": ["..."], "dislikes": ["..."], "suggestions": ["..."], "quotes": ["short verbatim visitor quotes"]}',
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

function bodyFor(summary, pageContext, sessionId) {
  const section = function (label, items) {
    if (!items || items.length === 0) return "";
    return "\n### " + label + "\n" + items.map(function (i) { return "- " + i; }).join("\n") + "\n";
  };
  return [
    "## Source",
    "Auto-filed from a voice feedback session (issue #43). Session ID: `" + sessionId + "`. Page: `" + pageContext + "`.",
    "This is unreviewed raw visitor input — treat like any other Pending spec: verify, edit, or close if not actionable.",
    section("Likes", summary.likes),
    section("Dislikes", summary.dislikes),
    section("Suggestions", summary.suggestions),
    section("Quotes", summary.quotes),
    "\n---\n**Category:** Site-wide / Platform (voice feedback pipeline) — see `wiki/VCP AI Workflow/Spec Categories.md`.",
  ].filter(Boolean).join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.GITHUB_TOKEN || !process.env.GROQ_API_KEY) {
    res.status(500).json({ error: "Feedback filing is not configured on the server" });
    return;
  }

  const { transcript, pageContext, sessionId } = req.body || {};
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    res.status(400).json({ error: "Missing required field: transcript" });
    return;
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    res.status(400).json({ error: "transcript exceeds " + MAX_TRANSCRIPT_LENGTH + " characters" });
    return;
  }

  try {
    // 1. Extract structured summary via Groq.
    const summaryResp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.GROQ_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
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
    let summary;
    try {
      const raw = (summaryData.choices && summaryData.choices[0] && summaryData.choices[0].message.content) || "{}";
      summary = JSON.parse(raw.trim());
    } catch (e) {
      res.status(502).json({ error: "Summary extraction returned invalid JSON" });
      return;
    }

    // Nothing actionable came out of the session (e.g. visitor said nothing
    // substantive) — don't file noise onto the board.
    const hasContent = ["likes", "dislikes", "suggestions"].some(function (k) { return (summary[k] || []).length > 0; });
    if (!hasContent) {
      res.status(200).json({ filed: false, reason: "No actionable feedback extracted" });
      return;
    }

    // 2. File the issue.
    const code = await nextSpecCode();
    const title = code + " Visitor feedback: " + (summary.title || "voice session " + sessionId);
    const createResp = await gh("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues", {
      method: "POST",
      body: JSON.stringify({
        title: title,
        body: bodyFor(summary, pageContext || "unknown", sessionId || "unknown"),
        labels: ["voice-feedback", "spec"],
      }),
    });
    if (!createResp.ok) {
      const detail = await createResp.text().catch(function () { return ""; });
      res.status(502).json({ error: "Issue creation failed", detail: detail });
      return;
    }
    const issue = await createResp.json();

    // 3. Add to the VCP Tracker board as Pending (mirrors /vcp-spec Step 4).
    const addItem = await ghGraphQL(
      'mutation { addProjectV2ItemById(input: {projectId: "' + PROJECT_ID + '", contentId: "' + issue.node_id + '"}) { item { id } } }'
    );
    const itemId = addItem.data && addItem.data.addProjectV2ItemById && addItem.data.addProjectV2ItemById.item.id;
    if (itemId) {
      await ghGraphQL(
        'mutation { updateProjectV2ItemFieldValue(input: {projectId: "' + PROJECT_ID + '", itemId: "' + itemId + '", fieldId: "' + STATUS_FIELD_ID + '", value: {singleSelectOptionId: "' + PENDING_OPTION_ID + '"}}) { projectV2Item { id } } }'
      );
    }

    res.status(200).json({ filed: true, issueNumber: issue.number, issueUrl: issue.html_url });
  } catch (err) {
    res.status(502).json({ error: "file-feedback failed", detail: err.message });
  }
};
