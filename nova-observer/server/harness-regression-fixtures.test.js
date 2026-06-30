import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createObserverFailureDomain } from "./observer-failure-domain.js";
import { createObserverProjectCycleInspection } from "./plugins/projects/lib/observer-project-cycle-inspection.js";
import { createObserverProjectCycleSupport } from "./plugins/projects/lib/observer-project-cycle-support.js";
import { buildRegressionSuiteDefinitions } from "./regression-suites.js";

function createFailureDomain() {
  return createObserverFailureDomain({
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit),
    getProjectNoChangeMinimumTargets: () => 3,
    getProjectsRuntime: () => ({
      extractTaskDirectiveValue: (text = "", label = "") => {
        const line = String(text || "").split(/\r?\n/).find((entry) => entry.startsWith(label));
        return line ? line.slice(String(label || "").length).trim() : "";
      },
      objectiveRequiresConcreteImprovement: () => false
    }),
    looksLikePlaceholderTaskMessage: () => false
  });
}

function createProjectCycleSupport() {
  return createObserverProjectCycleSupport({
    classifyFailureText: () => "",
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit),
    extractTaskDirectiveValue: (text = "", label = "") => {
      const line = String(text || "").split(/\r?\n/).find((entry) => entry.startsWith(label));
      return line ? line.slice(String(label || "").length).trim() : "";
    },
    path
  });
}

function createProjectCycleInspection() {
  return createObserverProjectCycleInspection({
    classifyFailureText: () => "unknown",
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit),
    extractContainerPathCandidates: (value = "") => [String(value || "").trim()].filter(Boolean),
    normalizeContainerMountPathCandidate: (value = "") => String(value || "").trim().replace(/\\/g, "/"),
    normalizeTaskDirectivePath: (value = "") => String(value || "").trim().replace(/\\/g, "/").replace(/[)."'\`,;:!?]+$/g, ""),
    path: path.posix
  });
}

function findCase(caseId = "") {
  for (const suite of buildRegressionSuiteDefinitions({ outputRoot: "/tmp/observer-output" })) {
    const match = (Array.isArray(suite.cases) ? suite.cases : []).find((entry) => entry.id === caseId);
    if (match) return match;
  }
  throw new Error(`Regression case not found: ${caseId}`);
}

function findCasesByMode(mode = "") {
  const matches = [];
  for (const suite of buildRegressionSuiteDefinitions({ outputRoot: "/tmp/observer-output" })) {
    for (const entry of Array.isArray(suite.cases) ? suite.cases : []) {
      if (String(entry?.mode || "").trim() === mode) {
        matches.push(entry);
      }
    }
  }
  return matches;
}

test("harness regression fixtures classify failure text", () => {
  const { classifyFailureText } = createFailureDomain();
  const fixtures = findCasesByMode("failure_classification");

  assert.ok(fixtures.length >= 1, "expected at least one failure classification fixture");
  for (const fixture of fixtures) {
    assert.equal(
      classifyFailureText(fixture.failureText),
      fixture.expectedClassification,
      `fixture ${fixture.id} should classify as ${fixture.expectedClassification}`
    );
  }
});

test("harness regression fixtures render project retry guidance", () => {
  const { buildCapabilityMismatchRetryMessage } = createFailureDomain();
  const fixtures = findCasesByMode("project_retry_message");

  assert.ok(fixtures.length >= 1, "expected at least one project retry message fixture");
  for (const fixture of fixtures) {
    const message = buildCapabilityMismatchRetryMessage(fixture.task, fixture.failureClassification);
    for (const expected of Array.isArray(fixture.expectedIncludes) ? fixture.expectedIncludes : []) {
      assert.ok(message.includes(expected), `fixture ${fixture.id} expected retry message to include: ${expected}`);
    }
    for (const unexpected of Array.isArray(fixture.unexpectedIncludes) ? fixture.unexpectedIncludes : []) {
      assert.equal(message.includes(unexpected), false, `fixture ${fixture.id} expected retry message to omit: ${unexpected}`);
    }
  }
});

test("harness regression fixtures render escalation close summaries", () => {
  const { buildEscalationCloseRecommendation } = createProjectCycleSupport();
  const fixtures = findCasesByMode("escalation_close_summary");

  assert.ok(fixtures.length >= 1, "expected at least one escalation close summary fixture");
  for (const fixture of fixtures) {
    const rendered = buildEscalationCloseRecommendation(fixture.task, fixture.sourceTask || {}, fixture.reason);
    for (const expected of Array.isArray(fixture.mustInclude) ? fixture.mustInclude : []) {
      assert.ok(rendered.includes(expected), `fixture ${fixture.id} expected escalation summary to include: ${expected}`);
    }
    for (const unexpected of Array.isArray(fixture.mustNotInclude) ? fixture.mustNotInclude : []) {
      assert.equal(rendered.includes(unexpected), false, `fixture ${fixture.id} expected escalation summary to omit: ${unexpected}`);
    }
  }
});

test("harness regression fixtures evaluate project-cycle completion policy", () => {
  const { buildProjectCycleCompletionPolicy, evaluateProjectCycleCompletionState } = createProjectCycleInspection();
  const fixtures = findCasesByMode("project_cycle_completion_policy");

  assert.ok(fixtures.length >= 1, "expected at least one project-cycle completion policy fixture");
  for (const fixture of fixtures) {
    const policy = buildProjectCycleCompletionPolicy(String(fixture.message || "").trim(), {
      minimumConcreteTargets: Number(fixture.minimumConcreteTargets || 3)
    });
    const actual = evaluateProjectCycleCompletionState({
      policy,
      message: String(fixture.message || "").trim(),
      finalText: String(fixture.finalText || "").trim(),
      inspectedTargets: Array.isArray(fixture.inspectedTargets) ? fixture.inspectedTargets : [],
      changedWorkspaceFiles: Array.isArray(fixture.changedWorkspaceFiles) ? fixture.changedWorkspaceFiles : [],
      changedOutputFiles: Array.isArray(fixture.changedOutputFiles) ? fixture.changedOutputFiles : [],
      successfulToolNames: Array.isArray(fixture.successfulToolNames) ? fixture.successfulToolNames : []
    });
    if (Object.prototype.hasOwnProperty.call(fixture, "expectedEligibleForCompletion")) {
      assert.equal(
        actual.eligibleForCompletion,
        Boolean(fixture.expectedEligibleForCompletion),
        `fixture ${fixture.id} expected eligibleForCompletion=${Boolean(fixture.expectedEligibleForCompletion)}; blockers=${actual.blockingCodes.join(", ")}`
      );
    }
    for (const expectedCode of Array.isArray(fixture.expectedBlockingCodes) ? fixture.expectedBlockingCodes : []) {
      assert.ok(actual.blockingCodes.includes(expectedCode), `fixture ${fixture.id} expected blocking code ${expectedCode}`);
    }
    for (const unexpectedCode of Array.isArray(fixture.unexpectedBlockingCodes) ? fixture.unexpectedBlockingCodes : []) {
      assert.equal(actual.blockingCodes.includes(unexpectedCode), false, `fixture ${fixture.id} expected blocking code ${unexpectedCode} to be absent`);
    }
  }
});
