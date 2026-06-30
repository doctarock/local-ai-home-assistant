import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnhandledProjectCycleCompletionBlocker,
  buildCompactHarnessEvalSnapshot,
  buildSummarizePseudoToolResult,
  shouldRejectFinalMissingChangedProjectTarget
} from "./observer-execution-runner.js";

test("compact harness eval snapshot preserves actionable health and selector metadata", () => {
  const snapshot = buildCompactHarnessEvalSnapshot({
    health: {
      status: "needs_attention",
      reasons: [
        "hidden_tool_violation",
        "inspection_heavy",
        "tool_selection_uncertain",
        "extra_1",
        "extra_2",
        "extra_3",
        "extra_4",
        "extra_5",
        "extra_6"
      ]
    },
    signals: Array.from({ length: 14 }, (_value, index) => `signal_${index + 1}`),
    recommendations: ["one", "two", "three", "four"],
    prompt: {
      latestContextReduced: true,
      latestPromptChars: 12000,
      latestUserRequestChars: 800,
      latestOriginalUserRequestChars: 6400
    },
    tools: {
      latestVisibleToolCount: 5,
      toolSelectionConfident: false,
      toolSelectionReason: "too_many_tool_families_matched",
      matchedToolFamilies: [
        "files",
        "project",
        "skills",
        "web",
        "mail",
        "calendar",
        "wordpress",
        "notes",
        "memory",
        "shell",
        "extra"
      ],
      optionalToolFamiliesMatched: 7,
      totalOptionalToolFamilies: 12,
      hiddenToolViolationCount: 2,
      readOnlyOkCount: 4,
      actionOkCount: 0,
      failureClasses: {
        hidden_tool_not_available: 1
      }
    },
    completion: {
      policyRejectionCount: 2,
      rejectionReasons: ["missing changed target", "missing todo", "extra one", "extra two", "extra three"]
    }
  });

  assert.equal(snapshot.health.status, "needs_attention");
  assert.deepEqual(snapshot.health.reasons, [
    "hidden_tool_violation",
    "inspection_heavy",
    "tool_selection_uncertain",
    "extra_1",
    "extra_2",
    "extra_3",
    "extra_4",
    "extra_5"
  ]);
  assert.equal(snapshot.signals.length, 12);
  assert.deepEqual(snapshot.recommendations, ["one", "two", "three"]);
  assert.equal(snapshot.prompt.latestContextReduced, true);
  assert.equal(snapshot.tools.toolSelectionConfident, false);
  assert.equal(snapshot.tools.toolSelectionReason, "too_many_tool_families_matched");
  assert.deepEqual(snapshot.tools.matchedToolFamilies, [
    "files",
    "project",
    "skills",
    "web",
    "mail",
    "calendar",
    "wordpress",
    "notes",
    "memory",
    "shell"
  ]);
  assert.equal(snapshot.tools.optionalToolFamiliesMatched, 7);
  assert.equal(snapshot.tools.totalOptionalToolFamilies, 12);
  assert.equal(snapshot.tools.failureClasses.hidden_tool_not_available, 1);
  assert.equal(snapshot.completion.policyRejectionCount, 2);
  assert.deepEqual(snapshot.completion.rejectionReasons, ["missing changed target", "missing todo", "extra one", "extra two"]);
});

test("compact harness eval snapshot returns null for missing summaries", () => {
  assert.equal(buildCompactHarnessEvalSnapshot(null), null);
});

test("summarize pseudo-tool returns corrective non-fatal result for content", () => {
  const result = buildSummarizePseudoToolResult({
    content: "Line one.\n\nLine two with more detail.",
    focus: "chapter continuity"
  }, {
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit)
  });

  assert.equal(result.ok, true);
  assert.match(result.note, /summarize is not an exposed worker tool/);
  assert.equal(result.focus, "chapter continuity");
  assert.match(result.summary, /Line one\. Line two/);
});

test("summarize pseudo-tool refuses empty content", () => {
  assert.equal(buildSummarizePseudoToolResult({ content: "   " }), null);
});

test("runner rejects project-cycle finalization when changed target is unnamed", () => {
  assert.equal(shouldRejectFinalMissingChangedProjectTarget({
    isProjectCycleTask: true,
    objectiveRequiresConcreteImprovement: true,
    hasNoChangeConclusion: false,
    changedConcreteProjectFiles: [
      { containerPath: "/home/nova/.observer-sandbox/workspace/projects/simple-check-project/directive.md" }
    ],
    completionState: {
      namedChangedConcreteProjectFileCount: 0
    }
  }), true);
});

test("runner accepts changed-target finalization when changed target is named", () => {
  assert.equal(shouldRejectFinalMissingChangedProjectTarget({
    isProjectCycleTask: true,
    objectiveRequiresConcreteImprovement: true,
    hasNoChangeConclusion: false,
    changedConcreteProjectFiles: [
      { containerPath: "/home/nova/.observer-sandbox/workspace/projects/simple-check-project/directive.md" }
    ],
    completionState: {
      namedChangedConcreteProjectFileCount: 1
    }
  }), false);
});

test("runner does not apply changed-target rejection to no-change conclusions", () => {
  assert.equal(shouldRejectFinalMissingChangedProjectTarget({
    isProjectCycleTask: true,
    objectiveRequiresConcreteImprovement: true,
    hasNoChangeConclusion: true,
    changedConcreteProjectFiles: [
      { containerPath: "/home/nova/.observer-sandbox/workspace/projects/simple-check-project/directive.md" }
    ],
    completionState: {
      namedChangedConcreteProjectFileCount: 0
    }
  }), false);
});

test("runner builds fallback rejection for unhandled project-cycle blockers", () => {
  const blocker = buildUnhandledProjectCycleCompletionBlocker({
    isProjectCycleTask: true,
    requiresConcreteOutcome: true,
    objectiveText: "Make one concrete improvement.",
    completionState: {
      eligibleForCompletion: false,
      blockingCodes: ["future_policy_code"]
    }
  });

  assert.match(blocker.reason, /future_policy_code/);
  assert.ok(blocker.guidance.some((line) => line.includes("Blocking codes: future_policy_code.")));
});

test("runner fallback does not reject eligible project-cycle completion", () => {
  assert.equal(buildUnhandledProjectCycleCompletionBlocker({
    isProjectCycleTask: true,
    requiresConcreteOutcome: true,
    completionState: {
      eligibleForCompletion: true,
      blockingCodes: []
    }
  }), null);
});

test("runner fallback is scoped away from non-project-cycle work", () => {
  assert.equal(buildUnhandledProjectCycleCompletionBlocker({
    isProjectCycleTask: false,
    requiresConcreteOutcome: true,
    completionState: {
      eligibleForCompletion: false,
      blockingCodes: ["future_policy_code"]
    }
  }), null);
});
