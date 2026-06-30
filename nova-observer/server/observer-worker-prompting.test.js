import assert from "node:assert/strict";
import test from "node:test";
import { createObserverWorkerPrompting } from "./observer-worker-prompting.js";

function createPrompting(overrides = {}) {
  return createObserverWorkerPrompting({
    INTAKE_TOOLS: [
      { name: "get_gpu_status", description: "Read GPU status" }
    ],
    OBSERVER_CONTAINER_OUTPUT_ROOT: "/home/nova/observer-output",
    OBSERVER_CONTAINER_WORKSPACE_ROOT: "/home/nova/.observer-sandbox/workspace",
    WORKER_TOOLS: [
      { name: "read_document", description: "Read a document" },
      { name: "list_files", description: "List files" },
      { name: "edit_file", description: "Edit a file" },
      { name: "search_skill_library", description: "Search the skill library" },
      { name: "inspect_skill_library", description: "Inspect a skill" },
      { name: "request_skill_installation", description: "Record a skill installation request" },
      { name: "request_tool_addition", description: "Record a missing tool request" }
    ],
    buildDocumentSearchSummary: async () => [],
    buildInstalledSkillsGuidanceNote: async () => "",
    buildAgentSkillsGuidanceNote: async () => "",
    buildPromptMemoryGuidanceNote: () => "",
    buildTaskCapabilityPromptLines: () => [],
    extractConcreteTaskFileTargets: () => [],
    extractTaskDirectiveValue: () => "",
    fs: null,
    getAgentPersonaName: () => "Nova",
    getObserverConfig: () => ({ mounts: [] }),
    getActiveProfile: () => ({}),
    getPluginToolsByScope: () => [],
    getProjectNoChangeMinimumTargets: () => 3,
    inferTaskCapabilityProfile: () => ({}),
    inferTaskSpecialty: () => "general",
    isProjectCycleMessage: () => false,
    normalizeContainerPathForComparison: (value = "") => String(value || ""),
    normalizeToolCallRecord: (value = {}) => value,
    normalizeToolName: (value = "") => String(value || "").trim(),
    parseToolCallArgs: (value = {}) => value?.args || {},
    runPluginHook: async (_hook, payload) => payload,
    queryRepairLessons: async () => [],
    ...overrides
  });
}

function assertNoPlaceholderEnvelope(prompt = "") {
  assert.equal(prompt.includes("tool_name"), false);
  assert.equal(prompt.includes("{\\\"key\\\":\\\"value\\\"}"), false);
  assert.equal(prompt.includes("\"key\":\"value\""), false);
}

test("worker prompt uses concrete tool envelope examples", async () => {
  const prompting = createPrompting();
  const prompt = await prompting.buildWorkerSystemPrompt({
    message: "Read the directive.",
    brain: { id: "worker", label: "Worker", specialty: "general" },
    internetEnabled: false,
    selectedMountIds: [],
    forceToolUse: true,
    preset: "queued-task"
  });

  assertNoPlaceholderEnvelope(prompt);
  assert.match(prompt, /Concrete non-final tool envelope example:/);
  assert.match(prompt, /"name":"read_document"/);
  assert.match(prompt, /"path":/);
  assert.match(prompt, /Final response contract reminder:/);
});

test("intake prompt uses concrete tool envelope examples", async () => {
  const prompting = createPrompting();
  const prompt = await prompting.buildIntakeSystemPrompt({
    internetEnabled: false,
    selectedMountIds: [],
    forceToolUse: false,
    sessionId: "Main"
  });

  assertNoPlaceholderEnvelope(prompt);
  assert.match(prompt, /Concrete non-final tool envelope example:/);
  assert.match(prompt, /function\.arguments must be a JSON-encoded string/);
  assert.match(prompt, /"action":"reply_only"/);
  assert.match(prompt, /"tasks":\[\]/);
});

test("focused worker request compacts long project-cycle packets", () => {
  const prompting = createPrompting({
    isProjectCycleMessage: () => true
  });
  const longMessage = [
    "Advance the project.",
    "Project assessment: Quality phase on a Creative track with many details that should be compacted into a short relevant line.",
    "Objective: Tighten chapter one continuity and record the next concrete writing task.",
    "Inspect first: /home/nova/.observer-sandbox/workspace/projects/Fantasy Novel/chapter-one.md",
    "Expected first move: read_document chapter-one.md, then edit the continuity issue if grounded.",
    "Conversation: " + "old queue context ".repeat(300)
  ].join("\n");

  const focused = prompting.buildFocusedWorkerUserRequest({
    message: longMessage,
    preset: "queued-task",
    internalJobType: "project_cycle"
  });

  assert.ok(focused.length < longMessage.length / 2);
  assert.match(focused, /Current objective: Tighten chapter one continuity/);
  assert.match(focused, /Inspect first: \/home\/nova\/\.observer-sandbox\/workspace\/projects\/Fantasy Novel\/chapter-one\.md/);
  assert.match(focused, /After one or two successful read-only calls/);
  assert.doesNotMatch(focused, /old queue context old queue context old queue context/);
});

test("worker prompt traces focused context and selected tools", async () => {
  const traces = [];
  const prompting = createPrompting({
    appendHookTrace: async (_taskId, entry) => traces.push(entry),
    isProjectCycleMessage: () => true
  });
  await prompting.buildWorkerSystemPrompt({
    message: [
      "Advance the project.",
      "Objective: Tighten chapter one continuity.",
      "Inspect first: /home/nova/.observer-sandbox/workspace/projects/Fantasy Novel/chapter-one.md",
      "Conversation: " + "old queue context ".repeat(300)
    ].join("\n"),
    brain: { id: "worker", label: "Worker", specialty: "creative" },
    internetEnabled: false,
    selectedMountIds: [],
    forceToolUse: true,
    preset: "queued-task",
    internalJobType: "project_cycle",
    taskId: "task-test"
  });

  const contextTrace = traces.find((entry) => entry.hook === "worker:prompt:context");
  assert.ok(contextTrace);
  assert.match(contextTrace.effect, /focused request/);
  assert.match(contextTrace.payloadPreview, /toolSelectionConfident/);
  assert.match(contextTrace.payloadPreview, /toolSelectionReason/);
  assert.match(contextTrace.payloadPreview, /matchedToolFamilies/);
  assert.match(contextTrace.payloadPreview, /read_document/);
});

test("worker prompt avoids naming hidden tools", async () => {
  const prompting = createPrompting({
    isProjectCycleMessage: () => true
  });
  const prompt = await prompting.buildWorkerSystemPrompt({
    message: [
      "Advance the project.",
      "Objective: Review the project structure and identify the best next step.",
      "Inspect first: /home/nova/.observer-sandbox/workspace/projects/Fantasy Novel/PROJECT-TODO.md"
    ].join("\n"),
    brain: { id: "worker", label: "Worker", specialty: "code" },
    internetEnabled: false,
    selectedMountIds: [],
    forceToolUse: true,
    preset: "queued-task",
    internalJobType: "project_cycle"
  });

  assert.match(prompt, /Available tools:\n- read_document:/);
  assert.match(prompt, /request_tool_addition/);
  assert.match(prompt, /After one or two successful read-only tool calls/);
  assert.equal(prompt.includes("write_file"), false);
  assert.equal(prompt.includes("move_path"), false);
  assert.equal(prompt.includes("shell_command"), false);
});

test("worker tool access mirrors focused prompt tool selection", () => {
  const prompting = createPrompting({
    isProjectCycleMessage: () => true
  });
  const access = prompting.buildWorkerToolAccess({
    message: [
      "Advance the project.",
      "Objective: Review the project structure and identify the best next step.",
      "Inspect first: /home/nova/.observer-sandbox/workspace/projects/Fantasy Novel/PROJECT-TODO.md"
    ].join("\n"),
    preset: "queued-task",
    internalJobType: "project_cycle"
  });

  assert.ok(access.effectiveToolNames.has("read_document"));
  assert.ok(access.effectiveToolNames.has("search_skill_library"));
  assert.ok(access.effectiveToolNames.has("inspect_skill_library"));
  assert.ok(access.effectiveToolNames.has("request_skill_installation"));
  assert.ok(access.effectiveToolNames.has("request_tool_addition"));
  assert.equal(access.effectiveToolNames.has("write_file"), false);
  assert.equal(access.effectiveToolNames.has("move_path"), false);
  assert.equal(access.effectiveToolNames.has("shell_command"), false);
  assert.deepEqual(access.toolNames, [
    "read_document",
    "list_files",
    "edit_file",
    "search_skill_library",
    "inspect_skill_library",
    "request_skill_installation",
    "request_tool_addition"
  ]);
});
