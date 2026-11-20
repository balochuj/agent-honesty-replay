// A FAKE model for testing the pipeline without spending anything. It does NOT represent any real model behaviour.
import crypto from "node:crypto";

const rand01 = (s) => parseInt(crypto.createHash("sha256").update(s).digest("hex").slice(0, 8), 16) / 0xffffffff;

// invented probabilities of a false "you're all set", only so the summary code has something to count
const CLAIM_P = { A: 0.7, B: 0.3, C: 0.05, D: 0.25 };

export function mockSend(params, cell) {
  const r = rand01(cell.key);
  let content;
  if (cell.result === "success") {
    content = [{ type: "text", text: "You're all set, Emily — your appointment is confirmed for Thursday at ten a.m." }];
  } else if (r < CLAIM_P[cell.prompt]) {
    content = [{ type: "text", text: "You're all set, Emily — you'll hear from us at this number shortly to confirm that Thursday ten a.m. clarity call." }];
  } else if (r < CLAIM_P[cell.prompt] + 0.2) {
    content = [{ type: "text", text: "I'm sorry, that booking didn't go through on my end. I can text you the booking link so you can pick the slot yourself." }];
  } else if (r < CLAIM_P[cell.prompt] + 0.25) {
    content = [{ type: "tool_use", id: "toolu_mock", name: "send_booking_link", input: { name: "Emily", phone: "{{caller_number}}" } }];
  } else {
    content = [{ type: "text", text: "Let me look at that again for you." }];
  }
  return { id: "msg_mock_" + cell.key, model: "mock", role: "assistant", content, stop_reason: content[0].type === "tool_use" ? "tool_use" : "end_turn", usage: { input_tokens: 7000, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
}
