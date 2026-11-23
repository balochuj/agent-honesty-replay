// Prepares the repo for publishing: removes phone numbers (digits AND spoken words), the test caller's surname,
// and scans every publishable file for anything that must not be public. Originals are kept in private/originals (gitignored).
// Usage:  node src/redact.js redact          (redacts the publishable files in place after backing the originals up)
//         node src/redact.js scan            (read-only check; exits 1 if anything is found)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORDS = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";
const RULES = [
  { name: "spoken phone number", re: new RegExp(`\\b${WORDS}\\b(?:[\\s,.\\u2014\\u2013-]+${WORDS}\\b){6,}`, "gi"), to: "[phone number removed]" },
  { name: "phone number", re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, to: "[phone number removed]" },
  { name: "test caller surname", re: new RegExp("\\bEmily Par" + "di\\b", "g"), to: "Emily P." },   // assembled in pieces so this file never contains the name
];
// things that must never appear in a public file (reported, never auto-fixed)
const FORBIDDEN = [
  // assembled in pieces so this file does not itself contain the vendor names it hunts for
  { name: "vendor name", re: new RegExp(["go ?high ?level", "high ?level", "\\bg" + "hl\\b", "re" + "tell", "lead" + "connector"].join("|"), "i") },
  { name: "test caller surname", re: new RegExp("Par" + "di|P-A-R-" + "D-I", "i") },
  { name: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "API key", re: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { name: "phone number (digits)", re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/ },
  { name: "phone number (spoken)", re: RULES[0].re },
];

// the one phone number that is meant to be public (the live demo line shown on the website and in the article)
const PUBLIC_LINE = /\(?888\)?[\s.-]*896[\s.-]*9990/;

export function redactText(text) {
  let out = String(text), n = 0;
  for (const r of RULES) out = out.replace(r.re, (m) => { if (r.name === "phone number" && PUBLIC_LINE.test(m)) return m; n++; return r.to; });
  return { text: out, replaced: n };
}

export function scanText(text) {
  const found = [];
  for (const f of FORBIDDEN) {
    const g = new RegExp(f.re.source, f.re.flags.includes("g") ? f.re.flags : f.re.flags + "g");
    for (const m of String(text).matchAll(g)) {
      if (f.name.startsWith("phone") && PUBLIC_LINE.test(m[0])) continue;   // the public demo line is allowed; any OTHER number is still reported
      found.push({ what: f.name, sample: m[0].slice(0, 40) }); break;
    }
  }
  return found;
}

// what gets published (relative to the repo root); the originals of these are backed up before redaction
export const PUBLISH = [
  "LICENSE",
  "README.md", "docs/how-to-test-an-ai-receptionist.md", "package.json", ".env.example", ".gitignore",
  ...["data/base_conversation.json", "data/concealment_rule_verbatim.json", "data/tool_results.json", "data/tools.json"],
  ...["src/agreement.js", "src/conditions.js", "src/judge.js", "src/mock-client.js", "src/probe.js", "src/redact.js", "src/replay.js", "src/summarize.js", "src/build-data.js", "tests/run-tests.js"],
  ...["results/full/config.json", "results/full/raw.jsonl", "results/full/judged.jsonl", "results/full/summary.csv", "results/full/summary.md", "results/full/handcheck_human.csv", "results/full/handcheck_key.json"],
  ...["results/pilot/config.json", "results/pilot/raw.jsonl", "results/pilot/judged.jsonl", "results/pilot/summary.csv", "results/pilot/summary.md"],
];

export function run(mode, root = ".", files = PUBLISH) {
  const report = { redacted: {}, problems: [], missing: [] };
  for (const f of files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) { report.missing.push(f); continue; }
    let text = fs.readFileSync(p, "utf8");
    const isCode = f.endsWith(".js");   // code files are never rewritten and their phone-number examples are not flagged
    if (mode === "redact" && !isCode) {
      const r = redactText(text);
      if (r.replaced) {
        const bak = path.join(root, "private", "originals", f); fs.mkdirSync(path.dirname(bak), { recursive: true });
        if (!fs.existsSync(bak)) fs.writeFileSync(bak, text);
        fs.writeFileSync(p, r.text); report.redacted[f] = r.replaced; text = r.text;
      }
    }
    // in code files only the fictional 555 range (digits or "five five five") may appear as a test example; any other phone number is a problem
    const fictional = (s) => isCode && s.what.startsWith("phone") && (/555/.test(s.sample) || /^five five five/i.test(s.sample));
    for (const s of scanText(text)) if (!fictional(s)) report.problems.push({ file: f, ...s });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (!["redact", "scan"].includes(mode)) { console.error("Usage: node src/redact.js redact|scan"); process.exit(1); }
  const r = run(mode);
  console.log(JSON.stringify(r, null, 1));
  if (r.problems.length) { console.error(`STOPPED: ${r.problems.length} problem(s) found; do not publish.`); process.exit(1); }
  console.log(mode === "scan" ? "CLEAN: nothing forbidden found in the publishable files." : "Redaction finished and the result is clean.");
}
