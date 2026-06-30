import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTaskFlightRecorderService } from "./task-flight-recorder-service.js";

async function createRecorder(overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-flight-"));
  const events = [];
  const recorder = createTaskFlightRecorderService({
    compactTaskText: (value = "", max = 260) => String(value || "").slice(0, max),
    emitCoreEvent: async (event) => {
      events.push(event);
      return { ...event, eventSeq: events.length };
    },
    fs,
    listTransactionsForTask: overrides.listTransactionsForTask || (async () => [{ id: "txn-1", status: "applied" }]),
    pathModule: path,
    readTaskHistory: async () => [{ eventSeq: 1, type: "task.started" }],
    root
  });
  return { root, events, recorder };
}

test("flight recorder builds debug packets and validates provider/tool correlation", async () => {
  const { root, events, recorder } = await createRecorder();
  await recorder.appendProviderHistory("task-1", {
    provider: "ollama",
    model: "model-a",
    brainId: "worker",
    step: 1,
    ok: true,
    rawText: "{\"tool_calls\":[]}",
    providerState: { responseId: "resp-1" }
  });
  await recorder.appendProviderHistory("task-1", {
    provider: "observer-normalized",
    model: "model-a",
    brainId: "worker",
    step: 1,
    ok: true,
    normalizedDecision: {
      tool_calls: [{ id: "call-1", function: { name: "read_file", arguments: "{}" } }]
    }
  });
  await recorder.appendToolStep("task-1", {
    step: 1,
    toolCallId: "call-1",
    name: "read_file",
    transportOk: true,
    semanticOk: true,
    resultPreview: "ok"
  });

  const validation = await recorder.validateProviderHistory("task-1");
  assert.equal(validation.ok, true);
  assert.equal(validation.providerRecordCount, 1);
  assert.equal(validation.toolStepCount, 1);
  assert.equal(validation.summary.continuation.sameProviderResumeAvailable, true);

  const packet = await recorder.buildDebugPacket("task-1");
  assert.equal(packet.ok, true);
  assert.equal(packet.timeline.length, 1);
  assert.equal(packet.harnessEval.providerRecordCount, 1);
  assert.equal(packet.providerHistory.length, 2);
  assert.equal(packet.toolSteps.length, 1);
  assert.equal(packet.transactions.length, 1);
  const providerEvent = events.find((event) => event.type === "provider.history_saved");
  const toolEvent = events.find((event) => event.type === "tool.step_recorded");
  assert.equal(providerEvent?.provider, "ollama");
  assert.equal(providerEvent?.status, "ok");
  assert.match(providerEvent?.summary || "", /history saved for step 1/);
  assert.equal(toolEvent?.toolName, "read_file");
  assert.equal(toolEvent?.status, "ok");
  assert.match(toolEvent?.summary || "", /read_file completed/);
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder harness eval summarizes focused context and visible tools", async () => {
  const { root, recorder } = await createRecorder();
  await recorder.appendProviderHistory("task-eval-1", {
    provider: "ollama",
    model: "model-a",
    brainId: "worker",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      promptChars: 4200,
      userRequestChars: 650,
      originalUserRequestChars: 5200,
      visibleTools: ["read_document", "list_files", "edit_file"],
      toolSelectionConfident: true
    }
  });
  await recorder.appendProviderHistory("task-eval-1", {
    provider: "observer-normalized",
    model: "model-a",
    step: 1,
    ok: true,
    normalizedDecision: {
      tool_calls: [{ id: "call-1", function: { name: "read_document", arguments: "{}" } }]
    }
  });
  await recorder.appendToolStep("task-eval-1", {
    step: 1,
    toolCallId: "call-1",
    name: "read_document",
    transportOk: true,
    semanticOk: true
  });
  await recorder.appendHookTrace("task-eval-1", {
    hook: "worker:prompt:context",
    pluginId: "observer-core",
    effect: "focused request 650/5200 chars; 3 tool(s) exposed"
  });

  const packet = await recorder.buildDebugPacket("task-eval-1");
  assert.equal(packet.harnessEval.prompt.latestContextReduced, true);
  assert.equal(packet.harnessEval.prompt.latestUserRequestChars, 650);
  assert.deepEqual(packet.harnessEval.tools.latestVisibleTools, ["read_document", "list_files", "edit_file"]);
  assert.equal(packet.harnessEval.tools.toolSelectionConfident, true);
  assert.equal(packet.harnessEval.health.status, "healthy");
  assert.ok(packet.harnessEval.signals.includes("context_reduced"));
  assert.ok(packet.harnessEval.signals.includes("focused_tools_recorded"));
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder counts summarize pseudo-tool as read-only", async () => {
  const { root, recorder } = await createRecorder({
    listTransactionsForTask: async () => []
  });
  await recorder.appendProviderHistory("task-summarize", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "edit_file"],
      toolSelectionConfident: true
    }
  });
  await recorder.appendToolStep("task-summarize", {
    step: 1,
    toolCallId: "call-summarize",
    name: "summarize",
    transportOk: true,
    semanticOk: true,
    toolResult: { summary: "Short summary." }
  });

  const packet = await recorder.buildDebugPacket("task-summarize");
  assert.equal(packet.harnessEval.tools.readOnlyOkCount, 1);
  assert.equal(packet.harnessEval.tools.actionOkCount, 0);
  assert.equal(packet.harnessEval.health.status, "healthy");
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder harness eval flags hidden tool violations and inspection-heavy runs", async () => {
  const { root, recorder } = await createRecorder({
    listTransactionsForTask: async () => []
  });
  await recorder.appendProviderHistory("task-eval-2", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "list_files"],
      toolSelectionConfident: true
    }
  });
  for (const [index, name] of ["read_document", "list_files", "read_file"].entries()) {
    await recorder.appendToolStep("task-eval-2", {
      step: index + 1,
      toolCallId: `call-${index + 1}`,
      name,
      transportOk: true,
      semanticOk: true
    });
  }
  await recorder.appendToolStep("task-eval-2", {
    step: 4,
    toolCallId: "call-hidden",
    name: "shell_command",
    transportOk: false,
    semanticOk: false,
    failureClass: "hidden_tool_not_available",
    error: "tool is not available in the current focused tool set"
  });
  await recorder.appendHookTrace("task-eval-2", {
    hook: "worker:tool-call:hidden-tool",
    pluginId: "observer-core",
    effect: "Blocked hidden tool call shell_command"
  });

  const packet = await recorder.buildDebugPacket("task-eval-2");
  assert.equal(packet.harnessEval.tools.hiddenToolViolationCount, 2);
  assert.equal(packet.harnessEval.tools.failureClasses.hidden_tool_not_available, 1);
  assert.equal(packet.harnessEval.health.status, "needs_attention");
  assert.ok(packet.harnessEval.health.reasons.includes("hidden_tool_violation"));
  assert.ok(packet.harnessEval.health.reasons.includes("inspection_heavy"));
  assert.ok(packet.harnessEval.signals.includes("hidden_tool_violation"));
  assert.ok(packet.harnessEval.signals.includes("inspection_heavy"));
  assert.match(packet.harnessEval.recommendations.join("\n"), /selector is too narrow|prompt memory is leaking/);
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder harness eval flags uncertain tool selection", async () => {
  const { root, recorder } = await createRecorder();
  await recorder.appendProviderHistory("task-selector", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "list_files", "edit_file", "write_file"],
      toolSelectionConfident: false,
      toolSelectionReason: "too_many_tool_families_matched",
      matchedToolFamilies: ["files", "project", "skills"],
      optionalToolFamiliesMatched: 3,
      totalOptionalToolFamilies: 8
    }
  });
  await recorder.appendToolStep("task-selector", {
    step: 1,
    toolCallId: "call-selector",
    name: "read_document",
    transportOk: true,
    semanticOk: true
  });

  const packet = await recorder.buildDebugPacket("task-selector");
  assert.equal(packet.harnessEval.tools.toolSelectionConfident, false);
  assert.equal(packet.harnessEval.tools.toolSelectionReason, "too_many_tool_families_matched");
  assert.deepEqual(packet.harnessEval.tools.matchedToolFamilies, ["files", "project", "skills"]);
  assert.equal(packet.harnessEval.tools.optionalToolFamiliesMatched, 3);
  assert.equal(packet.harnessEval.tools.totalOptionalToolFamilies, 8);
  assert.equal(packet.harnessEval.health.status, "needs_attention");
  assert.ok(packet.harnessEval.health.reasons.includes("tool_selection_uncertain"));
  assert.ok(packet.harnessEval.signals.includes("tool_selection_uncertain"));
  assert.match(packet.harnessEval.recommendations.join("\n"), /Tool selector was not confident/);
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder harness eval flags completion-policy rejections", async () => {
  const { root, recorder } = await createRecorder();
  await recorder.appendProviderHistory("task-completion-policy", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "edit_file"],
      toolSelectionConfident: true
    }
  });
  await recorder.appendHookTrace("task-completion-policy", {
    hook: "worker:completion-policy:rejected",
    pluginId: "observer-core",
    effect: "worker attempted project-cycle finalization without naming the changed project target",
    payloadPreview: "{\"attempt\":1}"
  });

  const packet = await recorder.buildDebugPacket("task-completion-policy");
  assert.equal(packet.harnessEval.completion.policyRejectionCount, 1);
  assert.deepEqual(packet.harnessEval.completion.rejectionReasons, [
    "worker attempted project-cycle finalization without naming the changed project target"
  ]);
  assert.ok(packet.harnessEval.signals.includes("completion_policy_rejection"));
  assert.ok(packet.harnessEval.health.reasons.includes("completion_policy_rejection"));
  assert.match(packet.harnessEval.recommendations.join("\n"), /Completion policy rejected/);

  const report = await recorder.buildHarnessEvalReport({ limit: 10 });
  assert.equal(report.totals.completionPolicyRejectionCount, 1);
  assert.equal(report.totals.completionPolicyRejectionTaskCount, 1);
  assert.equal(report.rates.completionPolicyRejectionTaskRate, 1);
  assert.ok(report.signalCounts.completion_policy_rejection >= 1);
  assert.ok(report.backlog.some((item) => item.id === "completion-policy-rejections"));
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder builds recent harness eval reports across tasks", async () => {
  const { root, recorder } = await createRecorder({
    listTransactionsForTask: async (taskId = "") => String(taskId).includes("progress")
      ? [{ id: "txn-progress", status: "applied" }]
      : []
  });
  await recorder.appendProviderHistory("task-progress", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      promptChars: 3000,
      userRequestChars: 500,
      originalUserRequestChars: 4000,
      visibleTools: ["read_document", "edit_file"],
      toolSelectionConfident: true
    }
  });
  await recorder.appendProviderHistory("task-progress", {
    provider: "ollama",
    model: "model-a",
    step: 2,
    ok: true,
    providerState: {
      contextReduced: true,
      promptChars: 3100,
      userRequestChars: 520,
      originalUserRequestChars: 4000,
      visibleTools: ["read_document", "edit_file"],
      toolSelectionConfident: true
    }
  });
  await recorder.appendToolStep("task-progress", {
    step: 1,
    toolCallId: "call-progress",
    name: "edit_file",
    transportOk: true,
    semanticOk: true
  });
  await recorder.appendProviderHistory("task-hidden", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document"],
      toolSelectionConfident: true
    }
  });
  await recorder.appendToolStep("task-hidden", {
    step: 1,
    toolCallId: "call-hidden",
    name: "shell_command",
    transportOk: false,
    semanticOk: false,
    failureClass: "hidden_tool_not_available",
    error: "hidden"
  });
  await recorder.appendProviderHistory("task-selector", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "list_files", "edit_file"],
      toolSelectionConfident: false,
      toolSelectionReason: "too_many_tool_families_matched",
      matchedToolFamilies: ["files", "project", "skills"],
      optionalToolFamiliesMatched: 3,
      totalOptionalToolFamilies: 8
    }
  });
  await recorder.appendToolStep("task-selector", {
    step: 1,
    toolCallId: "call-selector",
    name: "read_document",
    transportOk: true,
    semanticOk: true
  });
  await recorder.appendProviderHistory("task-inspection", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "list_files"],
      toolSelectionConfident: true
    }
  });
  for (const [index, name] of ["read_document", "list_files", "read_file"].entries()) {
    await recorder.appendToolStep("task-inspection", {
      step: index + 1,
      toolCallId: `call-inspection-${index + 1}`,
      name,
      transportOk: true,
      semanticOk: true
    });
  }

  const report = await recorder.buildHarnessEvalReport({ limit: 10 });
  assert.equal(report.ok, true);
  assert.equal(report.totals.taskCount, 4);
  assert.equal(report.totals.contextReducedCount, 5);
  assert.equal(report.totals.contextReducedTaskCount, 4);
  assert.equal(report.totals.hiddenToolViolationCount, 1);
  assert.equal(report.totals.hiddenToolViolationTaskCount, 1);
  assert.equal(report.totals.toolSelectionUncertainCount, 1);
  assert.equal(report.totals.workspaceProgressCount, 1);
  assert.equal(report.health.status, "needs_attention");
  assert.ok(report.health.reasons.includes("hidden_tool_violations"));
  assert.ok(report.health.reasons.includes("tool_selection_uncertain"));
  assert.equal(report.failureClasses.hidden_tool_not_available, 1);
  assert.equal(report.rates.contextReducedTaskRate, 1);
  assert.equal(report.rates.hiddenToolViolationTaskRate, 0.25);
  assert.ok(report.rates.toolSelectionUncertainTaskRate > 0);
  assert.ok(report.recommendations.some((line) => /Hidden-tool violations/.test(line)));
  assert.ok(report.recommendations.some((line) => /Tool selector uncertainty/.test(line)));
  assert.ok(Array.isArray(report.backlog));
  assert.equal(report.backlog[0].id, "hidden-tool-violations");
  assert.equal(report.backlog[0].severity, "critical");
  assert.ok(report.backlog.some((item) => item.id === "tool-selection-uncertainty"));
  assert.ok(report.backlog.some((item) => item.id === "inspection-heavy-no-progress"));
  const selectorTask = report.tasks.find((task) => task.taskId === "task-selector");
  assert.equal(selectorTask.tools.toolSelectionReason, "too_many_tool_families_matched");
  assert.deepEqual(selectorTask.tools.matchedToolFamilies, ["files", "project", "skills"]);
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder validation catches missing tool result records", async () => {
  const { root, recorder } = await createRecorder();
  await recorder.appendProviderHistory("task-2", {
    provider: "ollama",
    model: "model-a",
    step: 1,
    ok: true
  });
  await recorder.appendProviderHistory("task-2", {
    provider: "observer-normalized",
    model: "model-a",
    step: 1,
    ok: true,
    normalizedDecision: {
      tool_calls: [{ id: "missing-call", function: { name: "read_file", arguments: "{}" } }]
    }
  });
  const validation = await recorder.validateProviderHistory("task-2");
  assert.equal(validation.ok, false);
  assert.match(validation.failures.join("\n"), /missing-call/);
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder records read basis entries and includes them in debug packet", async () => {
  const { root, recorder } = await createRecorder();
  await recorder.appendReadBasis("task-3", {
    toolCallId: "call-read-1",
    path: "/workspace/src/app.js",
    scope: "container_workspace",
    size: 1024,
    hash: "abc123",
    source: "read_file"
  });
  await recorder.appendReadBasis("task-3", {
    toolCallId: "call-read-2",
    path: "/workspace/src/utils.js",
    scope: "container_workspace",
    size: 512,
    source: "read_file"
  });
  const packet = await recorder.buildDebugPacket("task-3");
  assert.equal(packet.ok, true);
  assert.equal(packet.readBasis.length, 2);
  assert.equal(packet.readBasis[0].path, "/workspace/src/app.js");
  assert.equal(packet.readBasis[0].hash, "abc123");
  assert.equal(packet.readBasis[1].path, "/workspace/src/utils.js");
  await fs.rm(root, { recursive: true, force: true });
});

test("flight recorder patchProviderSummary merges run-end outcome into existing summary", async () => {
  const { root, recorder } = await createRecorder();
  await recorder.appendProviderHistory("task-4", {
    provider: "ollama",
    model: "model-a",
    brainId: "worker",
    step: 1,
    ok: true,
    providerState: { responseId: "resp-1" }
  });
  const before = await recorder.readProviderSummary("task-4");
  assert.equal(before.provider, "ollama");
  assert.equal(before.continuation.sameProviderResumeAvailable, true);
  await recorder.patchProviderSummary("task-4", {
    lastRunOutcome: "completed",
    lastRunStopReason: "",
    lastRunAt: Date.now()
  });
  const after = await recorder.readProviderSummary("task-4");
  assert.equal(after.provider, "ollama");
  assert.equal(after.continuation.sameProviderResumeAvailable, true);
  assert.equal(after.lastRunOutcome, "completed");
  await fs.rm(root, { recursive: true, force: true });
});

test("buildTaskResumeSummary returns null for tasks with no history and a text summary for tasks with prior work", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-flight-resume-"));
  const emptyRecorder = createTaskFlightRecorderService({
    compactTaskText: (value = "", max = 260) => String(value || "").slice(0, max),
    emitCoreEvent: async (event) => ({ ...event, eventSeq: 1 }),
    fs,
    listTransactionsForTask: async () => [],
    pathModule: path,
    readTaskHistory: async () => [],
    root
  });
  const empty = await emptyRecorder.buildTaskResumeSummary("task-5-empty");
  assert.equal(empty, null);

  const { recorder } = await createRecorder();
  await recorder.appendToolStep("task-5", {
    step: 1,
    toolCallId: "call-a",
    name: "read_file",
    transportOk: true,
    semanticOk: true
  });
  await recorder.appendToolStep("task-5", {
    step: 2,
    toolCallId: "call-b",
    name: "edit_file",
    transportOk: true,
    semanticOk: true
  });
  await recorder.appendReadBasis("task-5", {
    toolCallId: "call-a",
    path: "/workspace/src/app.js",
    scope: "container_workspace",
    size: 512,
    source: "read_file"
  });
  await recorder.patchProviderSummary("task-5", { lastRunOutcome: "waiting_for_user" });

  const summary = await recorder.buildTaskResumeSummary("task-5");
  assert.ok(typeof summary === "string" && summary.length > 0, "expected a non-empty summary");
  assert.ok(summary.includes("waiting_for_user"), "expected last run outcome in summary");
  assert.ok(summary.includes("read_file"), "expected tool step name in summary");
  assert.ok(summary.includes("/workspace/src/app.js"), "expected read file path in summary");
  await fs.rm(root, { recursive: true, force: true });
});

test("buildTaskResumeSummary includes harness guidance for unhealthy prior runs", async () => {
  const { root, recorder } = await createRecorder({
    listTransactionsForTask: async () => []
  });
  await recorder.appendProviderHistory("task-6", {
    provider: "ollama",
    model: "model-a",
    brainId: "worker",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "list_files", "edit_file"],
      toolSelectionConfident: false,
      toolSelectionReason: "too_many_tool_families_matched",
      matchedToolFamilies: ["files", "project", "skills"],
      optionalToolFamiliesMatched: 3,
      totalOptionalToolFamilies: 8
    }
  });
  for (const [index, name] of ["read_document", "list_files", "read_file"].entries()) {
    await recorder.appendToolStep("task-6", {
      step: index + 1,
      toolCallId: `call-read-${index + 1}`,
      name,
      transportOk: true,
      semanticOk: true
    });
    await recorder.appendReadBasis("task-6", {
      toolCallId: `call-read-${index + 1}`,
      path: `/workspace/project/read-target-${index + 1}.md`,
      scope: "container_workspace",
      size: 100 + index,
      source: name
    });
  }
  await recorder.appendToolStep("task-6", {
    step: 4,
    toolCallId: "call-hidden",
    name: "shell_command",
    transportOk: false,
    semanticOk: false,
    failureClass: "hidden_tool_not_available",
    error: "tool is not available in the current focused tool set"
  });
  await recorder.appendHookTrace("task-6", {
    hook: "worker:tool-call:hidden-tool",
    pluginId: "observer-core",
    effect: "Blocked hidden tool call shell_command"
  });

  const summary = await recorder.buildTaskResumeSummary("task-6");
  assert.match(summary, /Harness health: needs_attention/);
  assert.match(summary, /hidden_tool_violation/);
  assert.match(summary, /inspection_heavy/);
  assert.match(summary, /tool_selection_uncertain/);
  assert.match(summary, /stay inside the currently exposed tools/);
  assert.match(summary, /read_document, list_files, edit_file/);
  assert.match(summary, /avoid another broad read\/list pass/);
  assert.match(summary, /already inspected \/workspace\/project\/read-target-1\.md, \/workspace\/project\/read-target-2\.md, \/workspace\/project\/read-target-3\.md/);
  assert.match(summary, /Resume contract: before any more read-only calls, name the one missing fact that blocks action/);
  assert.match(summary, /previous tool selection was uncertain \(too_many_tool_families_matched\) after matching files, project, skills/);
  await fs.rm(root, { recursive: true, force: true });
});

test("buildTaskResumeSummary includes completion-policy rejection guidance", async () => {
  const { root, recorder } = await createRecorder({
    listTransactionsForTask: async () => []
  });
  await recorder.appendProviderHistory("task-completion-resume", {
    provider: "ollama",
    model: "model-a",
    brainId: "worker",
    step: 1,
    ok: true,
    providerState: {
      contextReduced: true,
      visibleTools: ["read_document", "edit_file"],
      toolSelectionConfident: true
    }
  });
  await recorder.appendHookTrace("task-completion-resume", {
    hook: "worker:completion-policy:rejected",
    pluginId: "observer-core",
    effect: "worker attempted project-cycle finalization without naming the changed project target",
    payloadPreview: "{\"attempt\":1}"
  });

  const summary = await recorder.buildTaskResumeSummary("task-completion-resume");
  assert.match(summary, /completion_policy_rejection/);
  assert.match(summary, /previous final_text was rejected by completion policy/);
  assert.match(summary, /without naming the changed project target/);
  assert.match(summary, /Do not repeat that final answer/);
  await fs.rm(root, { recursive: true, force: true });
});
