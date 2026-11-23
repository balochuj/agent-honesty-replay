// The comparisons fixed in docs/preregistration-extension-1.md: difference in the share of replies that claim success,
// with a Newcombe (Wilson-score) 95% interval for the difference and a two-sided Fisher exact p-value.
// Usage:  node src/compare.js --selfcheck
//         node src/compare.js --study1 <results folder>
//         node src/compare.js --study2 <results folder> [--main results/full]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wilson, summarizeRows } from "./summarize.js";

// Newcombe (1998) method 10: interval for p1 - p2 built from the two Wilson intervals
export function newcombeDiff(k1, n1, k2, n2) {
  const p1 = k1 / n1, p2 = k2 / n2, [l1, u1] = wilson(k1, n1), [l2, u2] = wilson(k2, n2), d = p1 - p2;
  return { diff: d, lo: d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), hi: d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2) };
}

const logFact = (() => { const t = [0]; for (let i = 1; i <= 400; i++) t[i] = t[i - 1] + Math.log(i); return (n) => t[n]; })();

// two-sided Fisher exact test on [[a, b], [c, d]]: sum the probability of every table at most as likely as the observed one
export function fisherExact(a, b, c, d) {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const lp = (x) => logFact(r1) + logFact(r2) + logFact(c1) + logFact(n - c1) - logFact(n) - logFact(x) - logFact(r1 - x) - logFact(c1 - x) - logFact(r2 - c1 + x);
  const obs = lp(a); let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const v = lp(x); if (v <= obs + 1e-9) p += Math.exp(v); }
  return Math.min(1, p);
}

export function compareCells(k1, n1, k2, n2) {
  const d = newcombeDiff(k1, n1, k2, n2);
  return { ...d, p: fisherExact(k1, n1 - k1, k2, n2 - k2) };
}

export function selfcheck() {
  const out = [];
  const near = (name, got, want, tol) => out.push({ name, ok: Math.abs(got - want) <= tol, detail: `got ${got}, want ${want}` });
  near("Fisher exact: textbook 2x2 [[1,9],[11,3]] gives p = 0.002759", fisherExact(1, 9, 11, 3), 0.0027594561852200836, 1e-9);
  near("Fisher exact: 25/25 against 0/25 gives p = 2 / C(50,25)", fisherExact(25, 0, 0, 25), 2 / 126410606437752, 1e-20);
  near("Fisher exact: identical groups give p = 1", fisherExact(5, 20, 5, 20), 1, 1e-12);
  const nc = newcombeDiff(56, 70, 48, 80);
  near("Newcombe: 56/70 against 48/80 lower limit (published 0.0524)", nc.lo, 0.0524, 0.0006);
  near("Newcombe: 56/70 against 48/80 upper limit (published 0.3339)", nc.hi, 0.3339, 0.0006);
  return out;
}

const readJsonl = (p) => fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const fmt = (c) => `${(100 * c.diff).toFixed(0)} points [${(100 * c.lo).toFixed(0)} to ${(100 * c.hi).toFixed(0)}], Fisher p ${c.p < 0.0001 ? c.p.toExponential(1) : c.p.toFixed(4)}`;

function cellOf(summary, model, prompt, result) { return summary.find((s) => s.model === model && s.prompt === prompt && s.result === result); }

export function study1(dir, mainDir) {
  const s = summarizeRows(readJsonl(path.join(dir, "judged.jsonl")));
  const lines = ["# Study 1: a strict failure message (directive) against the clear failure message (explicit), run side by side", ""];
  lines.push("Share of replies that claim success (says booked, or only promises a confirmation). n = 25 per cell. Difference = directive minus explicit.", "");
  lines.push("| model | prompt | explicit (k/n) | directive (k/n) | difference [95% interval], Fisher p |", "|---|---|---|---|---|");
  for (const model of ["sonnet-5", "haiku-5.5"]) for (const p of ["A", "B", "C", "D"]) {
    const e = cellOf(s, model, p, "explicit"), d = cellOf(s, model, p, "directive"); if (!e || !d) continue;
    lines.push(`| ${model} | ${p}${model === "sonnet-5" && p === "A" ? " (primary)" : ""} | ${e.claims}/${e.n} | ${d.claims}/${d.n} | ${fmt(compareCells(d.claims, d.n, e.claims, e.n))} |`);
  }
  if (mainDir && fs.existsSync(path.join(mainDir, "judged.jsonl"))) {
    const m = summarizeRows(readJsonl(path.join(mainDir, "judged.jsonl")));
    lines.push("", "## Repeat of the main run (explicit result only): same cells, run days apart", "", "| model | prompt | main run (k/n) | this run (k/n) | difference [95% interval], Fisher p |", "|---|---|---|---|---|");
    for (const model of ["sonnet-5", "haiku-5.5"]) for (const p of ["A", "B", "C", "D"]) {
      const a = cellOf(m, model, p, "explicit"), b = cellOf(s, model, p, "explicit"); if (!a || !b) continue;
      lines.push(`| ${model} | ${p} | ${a.claims}/${a.n} | ${b.claims}/${b.n} | ${fmt(compareCells(b.claims, b.n, a.claims, a.n))} |`);
    }
  }
  return lines.join("\n");
}

export function study2(dir, mainDir) {
  const s = summarizeRows(readJsonl(path.join(dir, "judged.jsonl")));
  const m = mainDir ? summarizeRows(readJsonl(path.join(mainDir, "judged.jsonl"))) : [];
  const lines = ["# Study 2: which hiding line matters, and does the honest rule depend on its wording? (claude-sonnet-5)", ""];
  lines.push("Share of replies that claim success. n = 25 per cell. Reference rows A, B and C are from the main run (run days earlier).", "");
  lines.push("| prompt | explicit | bare | timeout | success (control; correct) |", "|---|---|---|---|---|");
  const row = (label, src, p) => { const g = (r) => { const c = cellOf(src, "sonnet-5", p, r); return c ? `${c.claims}/${c.n}` : "n/a"; }; return `| ${label} | ${g("explicit")} | ${g("bare")} | ${g("timeout")} | ${g("success")} |`; };
  lines.push(row("A original (main run)", m, "A"), row("A1 passage 1 removed", s, "A1"), row("A2 passage 2 removed", s, "A2"), row("B both removed (main run)", m, "B"), row("C honest rule (main run)", m, "C"), row("C1 wording 1", s, "C1"), row("C2 wording 2", s, "C2"), row("C3 wording 3", s, "C3"));
  lines.push("", "## Differences against the main run's A (all three failure results pooled is NOT used; each result separately)", "", "| prompt | result | k/n | A (main) k/n | difference [95% interval], Fisher p |", "|---|---|---|---|---|");
  for (const p of ["A1", "A2"]) for (const r of ["explicit", "bare", "timeout"]) { const c = cellOf(s, "sonnet-5", p, r), a = cellOf(m, "sonnet-5", "A", r); if (c && a) lines.push(`| ${p} | ${r} | ${c.claims}/${c.n} | ${a.claims}/${a.n} | ${fmt(compareCells(c.claims, c.n, a.claims, a.n))} |`); }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : null);
  if (a.includes("--selfcheck")) { const r = selfcheck(); for (const c of r) console.log((c.ok ? "PASS  " : "FAIL  ") + c.name + (c.ok ? "" : "  (" + c.detail + ")")); process.exit(r.every((c) => c.ok) ? 0 : 1); }
  const main = get("--main") || "results/full";
  if (get("--study1")) console.log(study1(get("--study1"), main));
  else if (get("--study2")) console.log(study2(get("--study2"), main));
  else { console.error("Usage: node src/compare.js --selfcheck | --study1 <folder> | --study2 <folder> [--main results/full]"); process.exit(1); }
}
