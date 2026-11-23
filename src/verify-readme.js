// Checks that the numbers written in the README and in the plain-language article match the stored results.
// No API key and no network needed: it recomputes everything from results/full/judged.jsonl and the hand-check files.
// Usage:  node src/verify-readme.js        (exit code 1 if any number disagrees)
// This is a separate check from `npm test` on purpose: it reads the published documents, not the code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeRows } from "./summarize.js";
import { parseCsv, compare } from "./agreement.js";
import { compareCells } from "./compare.js";

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
  // 6. the extension studies' results document (only when the studies have been run)
  const extDoc = path.join(root, "docs/extension-1-results.md");
  const ext1 = path.join(root, "results/ext1-directive/judged.jsonl");
  if (fs.existsSync(extDoc) && fs.existsSync(ext1)) {
    const text = fs.readFileSync(extDoc, "utf8");
    const s1 = summarizeRows(readJsonl(ext1));
    const c1 = (model, p, r) => s1.find((s) => s.model === model && s.prompt === p && s.result === r);
    add("extension 1: 400 labeled replies in 16 cells of 25", s1.length === 16 && s1.every((s) => s.n === 25), `cells=${s1.length}`);
    for (const line of text.split("\n").filter((l) => /^\| (sonnet-5|haiku-5\.5) \|/.test(l))) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      const e = c1(cells[0], cells[1][0], "explicit"), d = c1(cells[0], cells[1][0], "directive");
      if (!e || !d) continue;
      const cmp = compareCells(d.claims, d.n, e.claims, e.n);
      const want = `${e.claims}/${e.n}`, wantD = `${d.claims}/${d.n}`;
      const diff = `${(100 * cmp.diff).toFixed(0)} points [${(100 * cmp.lo).toFixed(0)} to ${(100 * cmp.hi).toFixed(0)}]`;
      add(`extension 1 table: ${cells[0]} / prompt ${cells[1][0]}`, cells[2] === want && cells[3] === wantD && cells[4] === diff, `doc says ${cells[2]}, ${cells[3]}, ${cells[4]}; data gives ${want}, ${wantD}, ${diff}`);
    }
    const a = c1("sonnet-5", "A", "explicit"), b = c1("sonnet-5", "A", "directive"), pm = text.match(/Fisher exact p = ([0-9.e-]+)/);
    if (a && b) { const p = compareCells(b.claims, b.n, a.claims, a.n).p; add("extension 1: the primary p-value quoted in the text", pm && pm[1] === (p < 0.0001 ? p.toExponential(1) : p.toFixed(4)), `doc says ${pm ? pm[1] : "?"}`); }
    const dis = (rs) => rs.filter((r) => r.reply_text && r.rule.claims_success !== r.judge.claims_success).length;
    add("extension 1: judge/rule disagreements quoted in the text", text.includes(`disagreed on ${dis(readJsonl(ext1))} of 400 replies`), `data gives ${dis(readJsonl(ext1))}`);

    // study 2 (the ablation) table and the counts quoted in its text
    const ext2 = path.join(root, "results/ext2-ablation/judged.jsonl");
    if (fs.existsSync(ext2)) {
      const e2rows = readJsonl(ext2), s2 = summarizeRows(e2rows);
      const sources = { main: summary, ext: s2 };
      const RUNS = [["A original", "main", "A"], ["A1 ", "ext", "A1"], ["A2 ", "ext", "A2"], ["B both", "main", "B"], ["C honest", "main", "C"], ["C1 ", "ext", "C1"], ["C2 ", "ext", "C2"], ["C3 ", "ext", "C3"]];
      add("extension 2: 450 labeled replies in 18 cells of 25", s2.length === 18 && s2.every((s) => s.n === 25), `cells=${s2.length}`);
      for (const line of text.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| prompt") && !/^\| (sonnet-5|haiku-5\.5) \|/.test(l))) {
        const cells = line.split("|").slice(1, -1).map((c) => c.trim());
        const run = RUNS.find(([prefix]) => cells[0].startsWith(prefix)); if (!run || cells.length !== 5) continue;
        ["explicit", "bare", "timeout", "success"].forEach((res, i) => {
          const c = sources[run[1]].find((s) => (run[1] === "main" ? s.model === "sonnet-5" : true) && s.prompt === run[2] && s.result === res);
          const want = c ? `${c.claims}/${c.n}` : "n/a";
          add(`extension 2 table: ${cells[0]} / ${res}`, cells[i + 1] === want, `doc says ${cells[i + 1]}; data gives ${want}`);
        });
      }
      add("extension 2: judge/rule disagreements quoted in the text", text.includes(`disagreed on ${dis(e2rows)} of 450 replies`), `data gives ${dis(e2rows)}`);
      const failed = readJsonl(path.join(root, "results/ext2-ablation/raw.jsonl")).filter((r) => r.error).length;
      add("extension 2: failed-request count quoted in the text", text.includes(`(${failed} failed requests:`), `data gives ${failed}`);
      const a1 = e2rows.filter((r) => r.prompt === "A1" && r.result === "explicit");
      add("extension 2: text-rule count for A1 quoted in the text", text.includes(`would read ${a1.filter((r) => r.rule.claims_success).length} of 25 instead of ${a1.filter((r) => r.judge.claims_success).length} of 25`), "");
    }
  }
  // 7. test counts quoted anywhere in the documents equal the real number of tests
  const testsFile = path.join(root, "tests/run-tests.js");
  if (fs.existsSync(testsFile)) {
    const realTests = (fs.readFileSync(testsFile, "utf8").match(/^await t\(/gm) || []).length;
    const docsToCheck = { "README.md": readme, "docs/how-to-test-an-ai-receptionist.md": fs.existsSync(articlePath) ? fs.readFileSync(articlePath, "utf8") : "" };
    for (const [name, body] of Object.entries(docsToCheck)) {
      const found = [...body.matchAll(/(?:own |# |These )(\d+)(?: automated)?(?: tests| are separate|,? tests)/g)];
      add(`${name}: quotes the test count at least once`, found.length > 0, "");
      for (const m of found) add(`${name}: "${m[0].trim()}" equals the real number of tests (${realTests})`, Number(m[1]) === realTests, `doc says ${m[1]}`);
    }
  }

  // 8. the article's sentence about the strict message matches Study 1
  if (fs.existsSync(articlePath) && fs.existsSync(ext1)) {
    const art = fs.readFileSync(articlePath, "utf8");
    const s1x = summarizeRows(readJsonl(ext1)), pick = (r) => s1x.find((s) => s.model === "sonnet-5" && s.prompt === "A" && s.result === r);
    if (art.includes("none of 25 replies claimed a booking")) add("article: 'none of 25 ... the older message, all 25 did' matches Study 1", pick("directive").claims === 0 && pick("explicit").claims === 25, `directive=${pick("directive").claims}/25, explicit=${pick("explicit").claims}/25`);
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
