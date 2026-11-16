import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExpoMessages } from "../lib/push.ts";
test("expo push messages: urgent offers use high priority and the urgent channel; junk tokens dropped", () => {
  const m = buildExpoMessages(["ExponentPushToken[abc]", "junk"], { title: "New care request", body: "x", urgent: true });
  assert.equal(m.length, 1); assert.equal(m[0].priority, "high"); assert.equal(m[0].channelId, "urgent");
});
