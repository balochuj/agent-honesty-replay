// Free sanity check of the API key and the two model names (the Models API has no token cost). Never prints the key.
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "./conditions.js";

if (!process.env.ANTHROPIC_API_KEY) { console.error("STOPPED: ANTHROPIC_API_KEY is not set in this environment."); process.exit(1); }
const client = new Anthropic();
for (const [label, m] of Object.entries(MODELS)) {
  try {
    const info = await client.models.retrieve(m.id);
    console.log(`${label.padEnd(10)} ${info.id}  "${info.display_name}"  context ${info.max_input_tokens}  max output ${info.max_tokens}`);
  } catch (e) { console.log(`${label.padEnd(10)} ${m.id}  NOT AVAILABLE: ${e.status || ""} ${String(e.message).slice(0, 140)}`); }
}
