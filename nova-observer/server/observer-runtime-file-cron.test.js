import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createObserverRuntimeFileCron } from "./observer-runtime-file-cron.js";

function createRuntimeFileCronForTest() {
  return createObserverRuntimeFileCron({
    INSPECT_ROOTS: {
      runtime: "E:/observer/runtime"
    },
    CONTAINER_INSPECT_ROOTS: {
      workspace: "/home/nova/.observer-sandbox/workspace",
      "sandbox-memory": "/home/nova/.observer-sandbox/workspace/memory",
      input: "/home/nova/observer-input"
    },
    OBSERVER_CONTAINER_WORKSPACE_ROOT: "/home/nova/.observer-sandbox/workspace",
    OBSERVER_OUTPUT_ROOT: "E:/observer/output",
    compactTaskText: (value) => String(value || ""),
    ensureObserverOutputDir: async () => {},
    fs: {},
    listAllTasks: async () => ({ done: [], failed: [] }),
    path
  });
}

test("container inspect paths resolve inside the selected sandbox root", () => {
  const runtime = createRuntimeFileCronForTest();
  assert.equal(
    runtime.resolveContainerInspectablePath("sandbox-memory", "questions/2026-05-30.md"),
    "/home/nova/.observer-sandbox/workspace/memory/questions/2026-05-30.md"
  );
  assert.equal(
    runtime.resolveContainerInspectablePath("input", "project/directive.md"),
    "/home/nova/observer-input/project/directive.md"
  );
});

test("container inspect path resolver preserves legacy workspace calls", () => {
  const runtime = createRuntimeFileCronForTest();
  assert.equal(
    runtime.resolveContainerInspectablePath("projects/example/README.md"),
    "/home/nova/.observer-sandbox/workspace/projects/example/README.md"
  );
});

test("container inspect paths cannot escape the selected root", () => {
  const runtime = createRuntimeFileCronForTest();
  assert.throws(
    () => runtime.resolveContainerInspectablePath("sandbox-memory", "../prompt-files/MEMORY.md"),
    /path escapes allowed root/
  );
  assert.throws(
    () => runtime.resolveContainerInspectablePath("input", "../observer-input-other/secret.txt"),
    /path escapes allowed root/
  );
});
