import assert from "node:assert/strict";
import test from "node:test";
import { createObserverEscalationReview } from "./observer-escalation-review.js";

function createEscalationReview(overrides = {}) {
  return createObserverEscalationReview({
    MAX_TASK_RESHAPE_ATTEMPTS: 2,
    MODEL_KEEPALIVE: "5m",
    buildConcreteReviewReason: () => "Escalation planner reviewed the failed worker chain.",
    buildEscalationCloseRecommendation: (_task, _sourceTask, reason) => reason,
    buildEscalationSplitProjectWorkKey: () => "",
    buildProjectCycleFollowUpMessage: () => "",
    buildRetryTaskMeta: () => ({}),
    canReshapeTask: () => false,
    chooseEscalationRetryBrainId: () => "",
    choosePlannerRepairBrain: async () => ({ id: "planner", model: "planner-model" }),
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit),
    createQueuedTask: async () => ({}),
    extractJsonObject: (value = "") => JSON.parse(value),
    findTaskById: async () => null,
    getBrain: async () => ({ id: "bitnet", model: "bitnet" }),
    getRoutingConfig: () => ({}),
    getTaskReshapeAttemptCount: () => 0,
    listAvailableBrains: async () => [{ id: "worker", kind: "worker", toolCapable: true }],
    markTaskCriticalFailure: async (task) => task,
    recordTaskReshapeReview: async () => ({}),
    runOllamaJsonGenerate: async () => ({
      ok: true,
      text: JSON.stringify({
        action: "close",
        reason: "No useful retry remains.",
        requestedBrainId: "",
        message: "",
        subTasks: []
      })
    }),
    appendRepairLesson: async () => null,
    ...overrides
  });
}

test("escalation planner prompt includes compact harness eval telemetry", async () => {
  let capturedPrompt = "";
  const review = createEscalationReview({
    runOllamaJsonGenerate: async (_model, prompt) => {
      capturedPrompt = prompt;
      return {
        ok: true,
        text: JSON.stringify({
          action: "close",
          reason: "No useful retry remains.",
          requestedBrainId: "",
          message: "",
          subTasks: []
        })
      };
    }
  });

  await review.executeEscalationReviewJob({
    id: "task-escalate-1",
    message: "Advance the project.\nObjective: Make one concrete improvement.",
    failureClassification: "hidden_tool_not_available",
    specialistAttemptedBrainIds: ["worker"],
    harnessEvalSnapshot: {
      health: {
        status: "needs_attention",
        reasons: ["hidden_tool_violation", "inspection_heavy", "tool_selection_uncertain"]
      },
      signals: ["inspection_heavy", "hidden_tool_violation"],
      prompt: { latestContextReduced: true },
      tools: {
        toolSelectionConfident: false,
        toolSelectionReason: "too_many_tool_families_matched",
        matchedToolFamilies: ["files", "project", "skills"],
        latestVisibleToolCount: 3,
        hiddenToolViolationCount: 1,
        readOnlyOkCount: 5,
        actionOkCount: 0
      }
    }
  });

  assert.match(capturedPrompt, /Harness health=needs_attention \(hidden_tool_violation, inspection_heavy, tool_selection_uncertain\)/);
  assert.match(capturedPrompt, /Harness eval: signals=inspection_heavy, hidden_tool_violation/);
  assert.match(capturedPrompt, /selector=uncertain\/too_many_tool_families_matched \[files, project, skills\]/);
  assert.match(capturedPrompt, /contextReduced=yes/);
  assert.match(capturedPrompt, /visibleTools=3/);
  assert.match(capturedPrompt, /hiddenToolHits=1/);
  assert.match(capturedPrompt, /read\/action=5\/0/);
});
