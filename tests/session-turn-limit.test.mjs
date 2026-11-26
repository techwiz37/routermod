import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_TURN_LIMIT, isSessionTurnLimitError,
} from "../open-sse/config/contextGuard.js";
import { capConversationHistory } from "../open-sse/translator/concerns/contextTrim.js";
import { FORMATS } from "../open-sse/translator/formats.js";

const msg = "当前会话已满 20 轮对话，请新开一个会话继续（Codex 输入 /new，其他客户端新建对话）。This conversation has reached 20 turns. Please start a new session to continue.";

test("detects the xingchiapi /responses session turn limit error", () => {
  assert.equal(isSessionTurnLimitError(400, "session_turn_limit_exceeded", msg), true);
  assert.equal(isSessionTurnLimitError(400, "", msg), true);
  assert.equal(isSessionTurnLimitError(422, "session_turn_limit_exceeded", ""), true);
  assert.equal(isSessionTurnLimitError(400, "invalid_request_error", "bad parameter"), false);
  assert.equal(isSessionTurnLimitError(500, "session_turn_limit_exceeded", ""), false);
});

test("turn limit retry drops oldest complete Responses turns but keeps system preamble and latest message", () => {
  const input = [
    { type: "message", role: "system", content: [{ type: "input_text", text: "SYSTEM" }] },
    ...Array.from({ length: 20 }, (_, i) => ({
      type: "message", role: "user", content: [{ type: "input_text", text: `user ${i}` }],
    })),
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "latest answer" }] },
  ];
  const body = { model: "gpt-5", input };
  assert.equal(capConversationHistory(body, FORMATS.OPENAI_RESPONSES, SESSION_TURN_LIMIT.initialKeepTurns - 4), true);
  assert.ok(body.input.length < input.length);
  assert.equal(body.input[0].content[0].text, "SYSTEM");
  assert.ok(body.input.some((item) => String(item.content?.[0]?.text || "").includes("latest answer")));
  assert.ok(!body.input.some((item) => String(item.content?.[0]?.text || "").includes("user 0")));
});

test("no trimming when the transcript is already within the turn cap", () => {
  const body = { input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
  ] };
  assert.equal(capConversationHistory(body, FORMATS.OPENAI_RESPONSES, 16), false);
  assert.equal(body.input.length, 1);
});
