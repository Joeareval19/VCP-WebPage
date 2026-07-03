// Waterfall sync (skill-tree view) — assigns PLACEHOLDER Start/End dates to
// every open ticket on the VCP Tracker so the Roadmap layout renders the
// dependency graph as a waterfall. Dates encode topology, NOT schedule:
//   wave 1 = no open blockers, wave k = blocked only by waves < k.
//   wave k occupies week k (Mon-Fri) starting from BASE.
// Run after filing specs or changing dependencies:  node agent-dispatch/waterfall.js
const { execFileSync } = require("child_process");

const REPO = "Joeareval19/VCP-WebPage";
const PROJECT = "PVT_kwHOBdoj_c4BcT54";
const F_START = "PVTF_lAHOBdoj_c4BcT54zhXCzXQ";
const F_END = "PVTF_lAHOBdoj_c4BcT54zhXCzY8";
const BASE = nextMonday(); // wave 1 starts next Monday; purely cosmetic

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}
function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}
function iso(d) { return d.toISOString().slice(0, 10); }

// 1. Project items -> issue numbers + item ids (open issues only)
const itemsQ = `query { node(id: "${PROJECT}") { ... on ProjectV2 { items(first: 100) {
  nodes { id content { ... on Issue { number state } } } } } } }`;
const items = JSON.parse(gh(["api", "graphql", "-f", `query=${itemsQ}`]))
  .data.node.items.nodes
  .filter((n) => n.content && n.content.number && n.content.state === "OPEN")
  .map((n) => ({ itemId: n.id, number: n.content.number }));

// 2. Open blockers per issue (closed blockers don't block)
const blockers = {};
for (const it of items) {
  const deps = JSON.parse(gh(["api", `repos/${REPO}/issues/${it.number}/dependencies/blocked_by`]));
  blockers[it.number] = deps.filter((d) => d.state === "open").map((d) => d.number);
}

// 3. Topological wave assignment
const wave = {};
function waveOf(n, seen = new Set()) {
  if (wave[n]) return wave[n];
  if (seen.has(n)) { console.error(`CYCLE at #${n} - assigning wave 1`); return (wave[n] = 1); }
  seen.add(n);
  const bs = (blockers[n] || []).filter((b) => b in blockers); // only open, on-board blockers
  wave[n] = bs.length === 0 ? 1 : 1 + Math.max(...bs.map((b) => waveOf(b, seen)));
  return wave[n];
}
items.forEach((it) => waveOf(it.number));

// 4. Write placeholder dates: wave k = week k (Mon + (k-1)*7 .. +4 days)
for (const it of items) {
  const k = wave[it.number];
  const s = new Date(BASE); s.setDate(s.getDate() + (k - 1) * 7);
  const e = new Date(s); e.setDate(e.getDate() + 4);
  for (const [field, date] of [[F_START, iso(s)], [F_END, iso(e)]]) {
    gh(["api", "graphql", "-f", `query=mutation { updateProjectV2ItemFieldValue(input: {projectId: "${PROJECT}", itemId: "${it.itemId}", fieldId: "${field}", value: {date: "${date}"}}) { projectV2Item { id } } }`]);
  }
  console.log(`#${it.number} wave ${k}: ${iso(s)} -> ${iso(e)}`);
}
console.log("Waterfall synced. View: Roadmap layout with Start/End as date fields.");
