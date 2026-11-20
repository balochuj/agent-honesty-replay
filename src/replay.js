// Replays the real incident: the conversation up to the booking-tool call, then a chosen tool result, then samples the agent's NEXT reply.
// Usage: node src/replay.js [--n 5] [--models sonnet-5,haiku-5.5] [--prompts A,B,C,D] [--results explicit,bare,timeout,success]
//                           [--prompt-file path] [--out results/pilot] [--max-usd 3] [--concurrency 4] [--mock]
// The API key is read from the ANTHROPIC_API_KEY environment variable. It is never printed or saved.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { MODELS, PROMPT_IDS, RESULT_IDS, PROMPT_DESCRIPTIONS, buildPrompt, buildMessages, enumerateCells, costUsd, loadJson, sha } from "./conditions.js";
import { mockSend } from "./mock-client.js";

export function parseArgs(argv) {
  const a = { n: 5, models: Object.keys(MODELS), prompts: PROMPT_IDS, results: RESULT_IDS, out: null, maxUsd: 3, concurrency: 4, mock: false, promptFile: path.join("private", "call", "prompt.txt") };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--n") { a.n = parseInt(v, 10); i++; }
    else if (k === "--models") { a.models = v.split(","); i++; }
    else if (k === "--prompts") { a.prompts = v.split(","); i++; }
    else if (k === "--results") { a.results = v.split(","); i++; }
    else if (k === "--out") { a.out = v; i++; }
    else if (k === "--max-usd") { a.maxUsd = parseFloat(v); i++; }
    else if (k === "--concurrency") { a.concurrency = parseInt(v, 10); i++; }
    else if (k === "--prompt-file") { a.promptFile = v; i++; }
    else if (k === "--mock") a.mock = true;
    else throw new Error("unknown option " + k);
  }
  if (!(a.n >= 1)) throw new Error("--n must be at least 1");
  for (const m of a.models) if (!MODELS[m]) throw new Error("unknown model " + m + " (known: " + Object.keys(MODELS).join(", ") + ")");
  for (const p of a.prompts) if (!PROMPT_IDS.includes(p)) throw new Error("unknown prompt " + p);
  for (const r of a.results) if (!RESULT_IDS.includes(r)) throw new Error("unknown result " + r);
  if (!a.out) a.out = path.join("results", (a.mock ? "mock" : "run-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")));
  return a;
}

const textOf = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join("");
const toolsOf = (content) => content.filter((b) => b.type === "tool_use").map((b) => ({ name: b.name, input: b.input }));

// resolves to { record, droppedThinking }; never throws for a single failed trial (it is recorded as an error)
export async function runCell({ cell, send, buildParams }) {
  const params = buildParams(cell);
  let dropped = false;
  try {
    let res;
    try { res = await send(params, cell); }
    catch (e) {
      if (e && e.status === 400 && /thinking/i.test(String(e.message)) && params.thinking) { delete params.thinking; dropped = true; res = await send(params, cell); }
      else throw e;
    }
    return { cell, dropped, res };
  } catch (e) {
    return { cell, dropped, error: String(e && e.message ? e.message : e).slice(0, 300), status: e && e.status };
  }
}

export async function main(argv, deps = {}) {
  const args = parseArgs(argv);
  const base = loadJson("data/base_conversation.json"), tools = loadJson("data/tools.json"), toolResults = loadJson("data/tool_results.json"), conceal = loadJson("data/concealment_rule_verbatim.json");
  const original = fs.readFileSync(args.promptFile, "utf8");
  const prompts = Object.fromEntries(args.prompts.map((p) => [p, buildPrompt(p, original, conceal)]));

  let send;
  if (args.mock) send = async (params, cell) => mockSend(params, cell);
  else {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in this environment. Run scripts/set-anthropic-key.ps1, then reopen the terminal.");
    const client = deps.client || new Anthropic();
    send = (params) => client.messages.create(params);
  }
  const buildParams = (cell) => ({
    model: MODELS[cell.model].id,
    max_tokens: 400,
    system: [{ type: "text", text: prompts[cell.prompt], cache_control: { type: "ephemeral" } }],
    tools,
    messages: buildMessages(base, toolResults, cell.result),
    thinking: { type: "disabled" },   // a voice agent answers without extended thinking; stated as a limitation in the README
  });

  fs.mkdirSync(args.out, { recursive: true });
  const rawPath = path.join(args.out, "raw.jsonl");
  const done = new Set(fs.existsSync(rawPath) ? fs.readFileSync(rawPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => r.key) : []);
  const cells = enumerateCells({ models: args.models, prompts: args.prompts, results: args.results, n: args.n }).filter((c) => !done.has(c.key));
  fs.writeFileSync(path.join(args.out, "config.json"), JSON.stringify({
    created: new Date().toISOString(), mock: args.mock, n: args.n, models: args.models.map((m) => ({ label: m, id: MODELS[m].id })), prompts: Object.fromEntries(args.prompts.map((p) => [p, { description: PROMPT_DESCRIPTIONS[p], sha256_16: sha(prompts[p]), chars: prompts[p].length }])),
    results: args.results, tools_sha256_16: sha(tools), base_conversation_sha256_16: sha(base), max_tokens: 400, thinking: "disabled", temperature: "API default (the parameter is rejected by current models)", max_usd: args.maxUsd,
  }, null, 2));

  let spent = 0, ok = 0, errors = 0, skipped = done.size, stop = false, idx = 0;
  const started = Date.now();
  const worker = async () => {
    while (!stop) {
      const cell = cells[idx++]; if (!cell) return;
      if (spent >= args.maxUsd) { stop = true; return; }
      const out = await runCell({ cell, send, buildParams });
      let line;
      if (out.error) { errors++; line = { key: cell.key, model: cell.model, prompt: cell.prompt, result: cell.result, trial: cell.trial, error: out.error, status: out.status }; }
      else {
        const c = costUsd(cell.model, out.res.usage); spent += c; ok++;
        line = { key: cell.key, model: cell.model, prompt: cell.prompt, result: cell.result, trial: cell.trial, reply_text: textOf(out.res.content), tool_calls: toolsOf(out.res.content), stop_reason: out.res.stop_reason, usage: out.res.usage, cost_usd: +c.toFixed(6), api_model: out.res.model, thinking_param_dropped: out.dropped || undefined, created: new Date().toISOString() };
      }
      fs.appendFileSync(rawPath, JSON.stringify(line) + "\n");
      if ((ok + errors) % 10 === 0) process.stderr.write(`  ${ok + errors}/${cells.length} done, $${spent.toFixed(3)} spent\n`);
      if (errors >= 10 && errors > ok * 0.1) { stop = true; process.stderr.write("Too many errors: stopping.\n"); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, worker));
  const summary = { out: args.out, planned: cells.length, ok, errors, already_done: skipped, spent_usd: +spent.toFixed(4), stopped_by_cap: spent >= args.maxUsd, seconds: Math.round((Date.now() - started) / 1000) };
  console.log(JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error("STOPPED: " + e.message); process.exit(1); });
}
