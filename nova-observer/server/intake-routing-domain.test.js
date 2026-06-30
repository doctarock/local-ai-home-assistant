import assert from "node:assert/strict";
import test from "node:test";
import { buildQueuedIntakeReceipt } from "./intake-routing-domain.js";

test("buildQueuedIntakeReceipt names queued task and queue visibility", () => {
  const text = buildQueuedIntakeReceipt({
    tasks: [{ id: "task-123", codename: "bright-signal-abcd" }],
    formatEntityRef: (_kind, id) => `ref-${id}`,
    destinationLabel: "Worker"
  });

  assert.match(text, /bright-signal-abcd/);
  assert.match(text, /Worker/);
  assert.match(text, /task queue/i);
  assert.doesNotMatch(text, /take a closer look now/i);
});

test("buildQueuedIntakeReceipt preserves specific intake reply before task receipt", () => {
  const text = buildQueuedIntakeReceipt({
    tasks: [{ id: "task-456" }],
    fallbackText: "I need to verify that properly.",
    formatEntityRef: (_kind, id) => `task-ref-${id}`
  });

  assert.match(text, /^I need to verify that properly\./);
  assert.match(text, /task-ref-task-456/);
});
