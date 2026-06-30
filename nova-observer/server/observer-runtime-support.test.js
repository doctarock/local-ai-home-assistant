import assert from "node:assert/strict";
import test from "node:test";

import { createObserverRuntimeSupport } from "./observer-runtime-support.js";

function createRuntimeSupport(overrides = {}) {
  const eventClients = new Set();
  const broadcasts = [];
  const fakeClient = {
    write: (msg) => {
      broadcasts.push(JSON.parse(msg.replace(/^data: /, "").trim()));
    }
  };
  eventClients.add(fakeClient);
  const { broadcastObserverEvent, setBroadcastSeqFloor } = createObserverRuntimeSupport({
    clients: new Set(),
    observerEventClients: eventClients,
    getObserverConfig: () => ({}),
    getPluginManager: () => null,
    getTaskDispatchScheduled: () => false,
    sanitizeHookToken: (v) => String(v || ""),
    setTaskDispatchScheduled: () => {},
    processQueuedTasksToCapacity: async () => {},
    recoverStaleTaskDispatchLock: async () => {},
    ...overrides
  });
  return { broadcastObserverEvent, setBroadcastSeqFloor, broadcasts };
}

test("each broadcast gets a strictly increasing eventSeq", () => {
  const { broadcastObserverEvent, broadcasts } = createRuntimeSupport();
  broadcastObserverEvent({ type: "task.progress" });
  broadcastObserverEvent({ type: "task.completed" });
  broadcastObserverEvent({ type: "core.event" });
  assert.equal(broadcasts.length, 3);
  assert.equal(broadcasts[0].eventSeq, 1);
  assert.equal(broadcasts[1].eventSeq, 2);
  assert.equal(broadcasts[2].eventSeq, 3);
});

test("caller-supplied eventSeq is overridden by the broadcast counter", () => {
  const { broadcastObserverEvent, broadcasts } = createRuntimeSupport();
  broadcastObserverEvent({ type: "task.updated", eventSeq: 999 });
  broadcastObserverEvent({ type: "task.updated", eventSeq: 0 });
  assert.equal(broadcasts[0].eventSeq, 1);
  assert.equal(broadcasts[1].eventSeq, 2);
});

test("task.latestEventSeq on the task object does not affect broadcast eventSeq", () => {
  const { broadcastObserverEvent, broadcasts } = createRuntimeSupport();
  broadcastObserverEvent({ type: "task.failed", task: { id: "t1", latestEventSeq: 500 } });
  assert.equal(broadcasts[0].eventSeq, 1);
  assert.equal(broadcasts[0].task.latestEventSeq, 500);
});

test("setBroadcastSeqFloor bumps the counter when given a higher value", () => {
  const { broadcastObserverEvent, setBroadcastSeqFloor, broadcasts } = createRuntimeSupport();
  setBroadcastSeqFloor(100);
  broadcastObserverEvent({ type: "task.queued" });
  assert.equal(broadcasts[0].eventSeq, 101);
});

test("setBroadcastSeqFloor does not reduce the counter when given a lower value", () => {
  const { broadcastObserverEvent, setBroadcastSeqFloor, broadcasts } = createRuntimeSupport();
  broadcastObserverEvent({ type: "task.queued" });
  broadcastObserverEvent({ type: "task.queued" });
  setBroadcastSeqFloor(1);
  broadcastObserverEvent({ type: "task.queued" });
  assert.equal(broadcasts[2].eventSeq, 3);
});

test("ts field is always present on broadcasts", () => {
  const { broadcastObserverEvent, broadcasts } = createRuntimeSupport();
  const before = Date.now();
  broadcastObserverEvent({ type: "core.event" });
  assert.ok(broadcasts[0].ts >= before);
  assert.ok(broadcasts[0].ts <= Date.now());
});

test("event fields pass through alongside the assigned eventSeq", () => {
  const { broadcastObserverEvent, broadcasts } = createRuntimeSupport();
  broadcastObserverEvent({ type: "task.progress", taskId: "t-42", logEventSeq: 77 });
  assert.equal(broadcasts[0].type, "task.progress");
  assert.equal(broadcasts[0].taskId, "t-42");
  assert.equal(broadcasts[0].logEventSeq, 77);
  assert.equal(broadcasts[0].eventSeq, 1);
});
