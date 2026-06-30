import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createObserverFailureDomain } from "./observer-failure-domain.js";

function createFailureDomain(overrides = {}) {
  return createObserverFailureDomain({
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit),
    getProjectNoChangeMinimumTargets: () => 3,
    getProjectsRuntime: () => ({
      extractTaskDirectiveValue: () => "",
      objectiveRequiresConcreteImprovement: () => false
    }),
    looksLikePlaceholderTaskMessage: () => false,
    ...overrides
  });
}

test("failure domain classifies hidden focused-tool violations", () => {
  const { classifyFailureText, isCapabilityMismatchFailure } = createFailureDomain();
  const text = 'tool "shell_command" is not available in the current focused tool set. Available tools: read_document, list_files';

  assert.equal(classifyFailureText(text), "hidden_tool_not_available");
  assert.equal(isCapabilityMismatchFailure("hidden_tool_not_available", { resultSummary: text }), true);
});

test("hidden-tool retry message tells worker to stay within visible tools", () => {
  const { buildCapabilityMismatchRetryMessage } = createFailureDomain();
  const message = buildCapabilityMismatchRetryMessage({
    message: "Advance the project.\nObjective: Make one concrete improvement."
  }, "hidden_tool_not_available");

  assert.match(message, /tried to call a tool that was not exposed/);
  assert.match(message, /Use only the tools listed in the current prompt's Available tools section/);
  assert.match(message, /search the skill library or record a capability request/);
});

test("retry message includes harness snapshot guidance", () => {
  const { buildCapabilityMismatchRetryMessage } = createFailureDomain();
  const message = buildCapabilityMismatchRetryMessage({
    message: "Advance the project.\nObjective: Make one concrete improvement.",
    harnessEvalSnapshot: {
      health: {
        status: "needs_attention",
        reasons: ["hidden_tool_violation", "inspection_heavy", "tool_selection_uncertain"]
      },
      signals: ["inspection_heavy", "hidden_tool_violation"],
      tools: {
        toolSelectionConfident: false,
        toolSelectionReason: "too_many_tool_families_matched",
        matchedToolFamilies: ["files", "project", "skills"],
        hiddenToolViolationCount: 1,
        readOnlyOkCount: 4,
        actionOkCount: 0
      }
    }
  }, "low_value_tool_loop");

  assert.match(message, /previous run was inspection-heavy/);
  assert.match(message, /previous run tried a hidden tool/);
  assert.match(message, /previous read\/action balance was 4\/0/);
  assert.match(message, /Harness next-turn contract: before any more read-only calls/);
  assert.match(message, /tool selection was uncertain \(too_many_tool_families_matched\) after matching files, project, skills/);
  assert.match(message, /Harness health: needs_attention \(hidden_tool_violation, inspection_heavy, tool_selection_uncertain\)/);
});

test("failure domain classifies and retries completion-policy blockers", () => {
  const { classifyFailureText, buildCapabilityMismatchRetryMessage } = createFailureDomain();
  const changedTargetText = "worker attempted project-cycle finalization without naming the changed project target";
  const genericPolicyText = "worker attempted project-cycle finalization with unresolved completion policy blockers: future_policy_code";

  assert.equal(classifyFailureText(changedTargetText), "project_final_missing_changed_target");
  assert.equal(classifyFailureText(genericPolicyText), "project_completion_policy_blocked");

  const changedTargetRetry = buildCapabilityMismatchRetryMessage({
    message: "Advance the project.\nObjective: Make one concrete improvement."
  }, "project_final_missing_changed_target");
  assert.match(changedTargetRetry, /changed project files but finished without naming the changed project target/);
  assert.match(changedTargetRetry, /final_text that names at least one changed project file or directory/);

  const policyRetry = buildCapabilityMismatchRetryMessage({
    message: "Advance the project.\nObjective: Make one concrete improvement.",
    harnessEvalSnapshot: {
      completion: {
        rejectionReasons: ["future_policy_code"]
      }
    }
  }, "project_completion_policy_blocked");
  assert.match(policyRetry, /unresolved project-cycle completion policy blockers/);
  assert.match(policyRetry, /Completion blocker evidence: future_policy_code/);
});

test("harness snapshot can steer retry even without a classified failure", () => {
  const { buildCapabilityMismatchRetryMessage } = createFailureDomain();
  const message = buildCapabilityMismatchRetryMessage({
    message: "Advance the project.\nObjective: Make one concrete improvement.",
    harnessEvalSnapshot: {
      signals: ["inspection_heavy"],
      tools: {
        readOnlyOkCount: 3,
        actionOkCount: 0
      }
    }
  }, "");

  assert.match(message, /Retry note: harness telemetry found a stuck execution pattern/);
  assert.match(message, /previous run was inspection-heavy/);
  assert.match(message, /previous read\/action balance was 3\/0/);
  assert.match(message, /Harness next-turn contract: before any more read-only calls/);
});

test("failure telemetry includes harness eval snapshot", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-failure-"));
  const telemetryPath = path.join(root, "failure.md");
  const { appendFailureTelemetryEntry } = createFailureDomain({
    fs,
    pathModule: path,
    failureTelemetryLogPath: telemetryPath
  });

  await appendFailureTelemetryEntry({
    task: {
      id: "task-1",
      codename: "blue-test",
      requestedBrainId: "worker",
      sessionId: "project-cycle",
      status: "failed",
      message: "Advance the project.",
      harnessEvalSnapshot: {
        health: {
          status: "needs_attention",
          reasons: ["hidden_tool_violation", "tool_selection_uncertain"]
        },
        signals: ["context_reduced", "hidden_tool_violation"],
        prompt: { latestContextReduced: true },
        tools: {
          toolSelectionConfident: false,
          toolSelectionReason: "too_many_tool_families_matched",
          matchedToolFamilies: ["files", "project"],
          latestVisibleToolCount: 3,
          hiddenToolViolationCount: 1,
          readOnlyOkCount: 2,
          actionOkCount: 0
        }
      }
    },
    phase: "execution",
    summary: "tool was not available in the current focused tool set",
    classification: "hidden_tool_not_available"
  });

  const content = await fs.readFile(telemetryPath, "utf8");
  assert.match(content, /signals=context_reduced, hidden_tool_violation/);
  assert.match(content, /health=needs_attention \(hidden_tool_violation, tool_selection_uncertain\)/);
  assert.match(content, /selector=uncertain\/too_many_tool_families_matched \[files, project\]/);
  assert.match(content, /contextReduced=yes/);
  assert.match(content, /visibleTools=3/);
  assert.match(content, /hiddenToolHits=1/);
  await fs.rm(root, { recursive: true, force: true });
});
