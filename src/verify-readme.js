// Checks that the numbers written in the README and in the plain-language article match the stored results.
// No API key and no network needed: it recomputes everything from results/full/judged.jsonl and the hand-check files.
// Usage:  node src/verify-readme.js        (exit code 1 if any number disagrees)
// This is a separate check from `npm test` on purpose: it reads the published documents, not the code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeRows } from "./summarize.js";
import { parseCsv, compare } from "./agreement.js";

const MODELS = { "claude-sonnet-5": "sonnet-5", "claude-haiku-5-5": "haiku-5.5" };
const PROMPTS = ["A", "B", "C", "D"];
const RESULT_BY_LABEL = [["explicit", "explicit"], ["bare", "bare"], ["timeout", "timeout"], ["success", "success"]];
const ARTICLE_ROWS = { "A clear failure message": "explicit", "A blank error": "bare", "No answer from the calendar": "timeout" };
const pct0 = (x) => (100 * x).toFixed(0);

const readJsonl = (p) => fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

export function verify(root = ".") {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const rows = readJsonl(path.join(root, "results/full/judged.jsonl"));
  const raw = readJsonl(path.join(root, "results/full/raw.jsonl"));
  const summary = summarizeRows(rows);
  const cell = (model, prompt, result) => summary.find((s) => s.model === model && s.prompt === prompt && s.result === result);

  // 1. the data itself
  add("800 raw replies and 800 labeled replies", raw.length === 800 && rows.length === 800, `raw=${raw.length}, labeled=${rows.length}`);
  add("every one of the 32 cells has exactly 25 labeled replies", summary.length === 32 && summary.every((s) => s.n === 25), `cells=${summary.length}`);
  add("no label failed to parse", rows.every((r) => r.judge && !r.judge.error));

  // 2. README results tables (two models)
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  for (const [heading, model] of Object.entries(MODELS)) {
    const start = readme.indexOf(`### ${heading}`);
    if (start < 0) { add(`README has a results table for ${heading}`, false); continue; }
    const section = readme.slice(start).split(/\n### |\n## /)[0];
    for (const line of section.split("\n").filter((l) => l.startsWith("|"))) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      const found = RESULT_BY_LABEL.find(([label]) => cells[0].toLowerCase().startsWith(label));
      if (!found) continue;
      PROMPTS.forEach((p, i) => {
        const m = cells[i + 1].match(/(\d+)%(?:\*\*)?(?:\s*\[(\d+)-(\d+)\])?/);
        const c = cell(model, p, found[1]);
        if (!m || !c) return add(`README ${model} ${found[1]} prompt ${p} can be read`, false, cells[i + 1]);
        const okRate = m[1] === pct0(c.claims_rate);
        const okCi = m[2] === undefined || (m[2] === pct0(c.ci_lo) && m[3] === pct0(c.ci_hi));
        add(`README ${model} / ${found[1]} / prompt ${p}`, okRate && okCi, `README says ${cells[i + 1]}; data gives ${pct0(c.claims_rate)}% [${pct0(c.ci_lo)}-${pct0(c.ci_hi)}]`);
      });
    }
  }

  // 3. the plain-language article's table (sonnet-5, "k of 25")
  const articlePath = path.join(root, "docs/how-to-test-an-ai-receptionist.md");
  if (fs.existsSync(articlePath)) {
    for (const line of fs.readFileSync(articlePath, "utf8").split("\n").filter((l) => l.startsWith("|"))) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      const result = ARTICLE_ROWS[cells[0]]; if (!result) continue;
      PROMPTS.forEach((p, i) => {
        const m = (cells[i + 1] || "").match(/^(\d+) of 25$/); const c = cell("sonnet-5", p, result);
        add(`article table: ${cells[0]} / prompt ${p}`, m && c && Number(m[1]) === c.claims, `article says ${cells[i + 1]}; data gives ${c ? c.claims : "?"} of 25`);
      });
    }
  }

  // 4. judge versus the simple text rules (README: "agrees ... for 97.8% of the 800 replies")
  const m = readme.match(/for (\d+(?:\.\d+)?)% of the 800 replies/);
  const agree = rows.filter((r) => r.rule && r.judge.claims_success === r.rule.claims_success).length;
  add("README: judge and text rule agree on claimed success", m && Number(m[1]).toFixed(1) === (100 * agree / rows.length).toFixed(1), `README says ${m ? m[1] : "?"}%; data gives ${(100 * agree / rows.length).toFixed(1)}% (${agree} of ${rows.length})`);

  // 5. hand check (README table: "30 of 30", "30 of 30", "26 of 30")
  const humanPath = path.join(root, "results/full/handcheck_human.csv");
  if (fs.existsSync(humanPath)) {
    const human = parseCsv(fs.readFileSync(humanPath, "utf8")).slice(1).filter((r) => r[0]);
    const key = JSON.parse(fs.readFileSync(path.join(root, "results/full/handcheck_key.json"), "utf8"));
    const c = compare(human, key, rows);
    const want = { "claim type (booked / promise / none)": c.claim_type_exact, "tells the caller something went wrong": c.reports_failure, "offers a next step": c.recovers };
    for (const [label, r] of Object.entries(want)) {
      const line = readme.split("\n").find((l) => l.startsWith(`| ${label}`));
      const mm = line && line.match(/(\d+) of (\d+)/);
      add(`README hand check: ${label}`, mm && Number(mm[1]) === r.agree && Number(mm[2]) === r.of, `README says ${mm ? mm[0] : "?"}; data gives ${r.agree} of ${r.of}`);
    }
  }
  return checks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--root");
  const checks = verify(i > 0 ? process.argv[i + 1] : ".");
  const bad = checks.filter((c) => !c.ok);
  for (const c of checks) if (!c.ok) console.log(`FAIL  ${c.name}  (${c.detail})`);
  console.log(`${checks.length - bad.length} of ${checks.length} checks passed.`);
  if (bad.length) { console.error("STOPPED: a number in a published document does not match the stored results."); process.exit(1); }
  console.log("All numbers in the README and the article match the stored results.");
}
