// Compares a human's hand-check labels with the judge's. Usage: node src/agreement.js --human <csv> --key results/full/handcheck_key.json --judged results/full/judged.jsonl
import fs from "node:fs";

export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// the human may have typed in the three columns, or (spreadsheet quirk) far to the right: take the last three non-empty cells
export function humanLabels(row) {
  let cells = row.slice(3, 6).map((c) => c.trim());
  if (cells.some((c) => !c)) cells = row.slice(3).map((c) => c.trim()).filter(Boolean).slice(-3);
  const [type, fail, next] = cells;
  const norm = (v) => String(v || "").toLowerCase().replace(/[*?]/g, "").trim();
  const yn = (v) => { const x = norm(v); return x.startsWith("y") ? true : x.startsWith("n") ? false : x.startsWith("att") ? true : null; };
  const t = norm(type).replace(/\s*\d+$/, "").trim();
  return { claim_type: ["booked", "promise", "none"].includes(t) ? t : null, reports_failure: yn(fail), recovers: yn(next), unsure: /[?*]/.test(String(type) + String(fail) + String(next)) };
}

export function compare(humanRows, key, judged) {
  const byKey = new Map(judged.map((j) => [j.key, j]));
  const out = [];
  for (const r of humanRows) {
    const k = key.find((x) => String(x.row) === String(r[0])); if (!k) continue;
    const j = byKey.get(k.key); if (!j) continue;
    const h = humanLabels(r);
    out.push({ row: r[0], key: k.key, result: r[1], reply: r[2], human: h, judge: { claim_type: j.judge.claim_type, reports_failure: j.judge.reports_failure, recovers: j.judge.recovers } });
  }
  const rate = (f) => { const ok = out.filter((o) => f(o)).length; return { agree: ok, of: out.length, pct: out.length ? +(100 * ok / out.length).toFixed(1) : null }; };
  return {
    rows: out,
    claim_type_exact: rate((o) => o.human.claim_type === o.judge.claim_type),
    claims_success_yes_or_no: rate((o) => (o.human.claim_type !== "none") === (o.judge.claim_type !== "none")),
    reports_failure: rate((o) => o.human.reports_failure === o.judge.reports_failure),
    recovers: rate((o) => o.human.recovers === o.judge.recovers),
  };
}

if (process.argv[1] && process.argv[1].endsWith("agreement.js")) {
  const a = process.argv.slice(2), get = (f) => a[a.indexOf(f) + 1];
  const rows = parseCsv(fs.readFileSync(get("--human"), "utf8")).slice(1).filter((r) => r[0]);
  const key = JSON.parse(fs.readFileSync(get("--key"), "utf8"));
  const judged = fs.readFileSync(get("--judged"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const c = compare(rows, key, judged);
  console.log(JSON.stringify({ rows: c.rows.length, claim_type_exact: c.claim_type_exact, claims_success_yes_or_no: c.claims_success_yes_or_no, reports_failure: c.reports_failure, recovers: c.recovers }, null, 1));
  for (const o of c.rows) {
    const d = [];
    if (o.human.claim_type !== o.judge.claim_type) d.push(`type human=${o.human.claim_type} judge=${o.judge.claim_type}`);
    if (o.human.reports_failure !== o.judge.reports_failure) d.push(`failure human=${o.human.reports_failure} judge=${o.judge.reports_failure}`);
    if (o.human.recovers !== o.judge.recovers) d.push(`next-step human=${o.human.recovers} judge=${o.judge.recovers}`);
    if (d.length) console.log(`row ${o.row} [${o.result}] ${d.join("; ")}\n   ${o.reply.slice(0, 170)}`);
  }
}
