import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_REPORT_PATH = new URL(".derpy-observer-runtime/harness-last-run.json", import.meta.url);
const DEFAULT_HISTORY_PATH = new URL(".derpy-observer-runtime/harness-check-history.jsonl", import.meta.url);
const DEFAULT_HISTORY_LIMIT = 200;

const checks = [
  {
    label: "Syntax checks",
    args: [
      "--check",
      "run-harness-checks.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/observer-escalation-review.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/observer-execution-runner.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/observer-failure-domain.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/observer-prompt-utils.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/observer-task-execution-support.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/observer-worker-prompting.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/ollama-runtime-service.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/plugins/developer-tools/lib/brain-tool-workout-service.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/plugins/developer-tools/public/flight-recorder-tab.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/plugins/developer-tools/public/brain-tool-workout-tab.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/plugins/projects/lib/observer-project-cycle-inspection.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/plugins/projects/lib/observer-project-cycle-support.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/regression-suites.js"
    ]
  },
  {
    label: "Syntax checks",
    args: [
      "--check",
      "server/task-flight-recorder-service.js"
    ]
  },
  {
    label: "Focused harness tests",
    args: [
      "--test",
      "server/observer-failure-domain.test.js",
      "server/observer-escalation-review.test.js",
      "server/observer-execution-runner.test.js",
      "server/harness-gate-self-audit.test.js",
      "server/harness-regression-fixtures.test.js",
      "server/task-flight-recorder-service.test.js",
      "server/observer-prompt-utils.test.js",
      "server/observer-task-execution-support.test.js",
      "server/observer-worker-prompting.test.js",
      "server/observer-worker-tools.test.js",
      "server/plugins/projects/lib/observer-project-cycle-inspection.test.js",
      "server/plugins/developer-tools/lib/brain-tool-workout-service.test.js"
    ]
  }
];

const requiredTargets = {
  syntax: [
    "run-harness-checks.js",
    "server/plugins/developer-tools/lib/brain-tool-workout-service.js",
    "server/plugins/developer-tools/public/brain-tool-workout-tab.js",
    "server/plugins/developer-tools/public/flight-recorder-tab.js",
    "server/plugins/projects/lib/observer-project-cycle-inspection.js",
    "server/task-flight-recorder-service.js"
  ],
  tests: [
    "server/harness-gate-self-audit.test.js",
    "server/harness-regression-fixtures.test.js",
    "server/plugins/projects/lib/observer-project-cycle-inspection.test.js",
    "server/task-flight-recorder-service.test.js",
    "server/plugins/developer-tools/lib/brain-tool-workout-service.test.js"
  ]
};

const requiredFeatureTokens = [
  {
    file: "server/plugins/developer-tools/lib/brain-tool-workout-service.js",
    tokens: ["buildWorkoutDiagnosis", "summarizeBrainReadiness", "diagnosis"]
  },
  {
    file: "server/task-flight-recorder-service.js",
    tokens: ["buildHarnessImprovementBacklog", "backlog", "completionPolicyRejectionCount", "completion_policy_rejection", "Do not repeat that final answer"]
  },
  {
    file: "server/plugins/developer-tools/public/brain-tool-workout-tab.js",
    tokens: ["renderDiagnosis", "renderReadiness"]
  },
  {
    file: "server/plugins/developer-tools/public/flight-recorder-tab.js",
    tokens: ["Improvement Backlog", "fr-backlog", "renderHarnessCheckReport", "renderHarnessCheckHistory", "Trend reasons", "Completion rejects", "Completion rejection reasons"]
  },
  {
    file: "server/plugins/developer-tools/developer-tools-plugin.js",
    tokens: ["harness-check/last-run", "harness-check/history", "summarizeHarnessLastRun", "summarizeHarnessHistory", "duration_regressed"]
  },
  {
    file: "run-harness-checks.js",
    tokens: ["DEFAULT_HISTORY_LIMIT", "pruneJsonlText"]
  },
  {
    file: "server/harness-regression-fixtures.test.js",
    tokens: ["findCasesByMode", "failure_classification", "project_retry_message", "escalation_close_summary", "project_cycle_completion_policy"]
  },
  {
    file: "server/plugins/projects/lib/observer-project-cycle-inspection.js",
    tokens: ["objectiveAllowsValidationOnlyOutcome", "hasMachineVerifiableValidation"]
  },
  {
    file: "server/observer-execution-runner.js",
    tokens: ["shouldRejectFinalMissingChangedProjectTarget", "namedChangedConcreteProjectFileCount", "buildUnhandledProjectCycleCompletionBlocker", "worker:completion-policy:rejected"]
  },
  {
    file: "server/observer-failure-domain.js",
    tokens: ["project_final_missing_changed_target", "project_completion_policy_blocked"]
  }
];

export function auditHarnessCheckPlan(plan = checks) {
  const syntaxTargets = new Set();
  const testTargets = new Set();
  for (const check of Array.isArray(plan) ? plan : []) {
    const args = Array.isArray(check?.args) ? check.args : [];
    if (args.includes("--check")) {
      for (const arg of args.filter((entry) => entry.endsWith(".js"))) syntaxTargets.add(arg);
    }
    if (args.includes("--test")) {
      for (const arg of args.filter((entry) => entry.endsWith(".test.js"))) testTargets.add(arg);
    }
  }
  const missingSyntax = requiredTargets.syntax.filter((target) => !syntaxTargets.has(target));
  const missingTests = requiredTargets.tests.filter((target) => !testTargets.has(target));
  const missingFeatureTokens = [];
  for (const entry of requiredFeatureTokens) {
    const source = readFileSync(new URL(entry.file, import.meta.url), "utf8");
    for (const token of entry.tokens) {
      if (!source.includes(token)) {
        missingFeatureTokens.push(`${entry.file}:${token}`);
      }
    }
  }
  const failures = [
    ...missingSyntax.map((target) => `missing syntax target ${target}`),
    ...missingTests.map((target) => `missing test target ${target}`),
    ...missingFeatureTokens.map((target) => `missing feature token ${target}`)
  ];
  if (failures.length) {
    throw new Error(`Harness check plan self-audit failed:\n- ${failures.join("\n- ")}`);
  }
  return {
    ok: true,
    syntaxTargetCount: syntaxTargets.size,
    testTargetCount: testTargets.size,
    featureTokenCount: requiredFeatureTokens.reduce((sum, entry) => sum + entry.tokens.length, 0)
  };
}

function buildHarnessCheckReport({
  ok = false,
  startedAt = Date.now(),
  completedAt = Date.now(),
  audit = null,
  outcomes = [],
  error = ""
} = {}) {
  return {
    ok: ok === true,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Number(completedAt || 0) - Number(startedAt || 0)),
    audit,
    totals: {
      checkCount: Array.isArray(outcomes) ? outcomes.length : 0,
      passedCount: (Array.isArray(outcomes) ? outcomes : []).filter((entry) => entry.ok === true).length,
      failedCount: (Array.isArray(outcomes) ? outcomes : []).filter((entry) => entry.ok === false).length
    },
    failedCheck: (Array.isArray(outcomes) ? outcomes : []).find((entry) => entry.ok === false) || null,
    checks: Array.isArray(outcomes) ? outcomes : [],
    error: String(error || "").trim()
  };
}

function compactHarnessCheckHistoryRecord(report = {}) {
  const failedCheck = report.failedCheck && typeof report.failedCheck === "object" ? report.failedCheck : null;
  return {
    ok: report.ok === true,
    startedAt: Number(report.startedAt || 0),
    completedAt: Number(report.completedAt || 0),
    durationMs: Number(report.durationMs || 0),
    audit: report.audit && typeof report.audit === "object" ? {
      syntaxTargetCount: Number(report.audit.syntaxTargetCount || 0),
      testTargetCount: Number(report.audit.testTargetCount || 0),
      featureTokenCount: Number(report.audit.featureTokenCount || 0)
    } : null,
    totals: report.totals && typeof report.totals === "object" ? {
      checkCount: Number(report.totals.checkCount || 0),
      passedCount: Number(report.totals.passedCount || 0),
      failedCount: Number(report.totals.failedCount || 0)
    } : null,
    failedCheck: failedCheck ? {
      label: String(failedCheck.label || "").trim(),
      command: String(failedCheck.command || "").trim(),
      status: Number(failedCheck.status || 0)
    } : null,
    error: String(report.error || "").trim()
  };
}

function writeHarnessCheckReport(report = {}, reportPath = DEFAULT_REPORT_PATH) {
  const target = reportPath instanceof URL ? reportPath : new URL(String(reportPath || ""), import.meta.url);
  mkdirSync(new URL(".", target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function pruneJsonlText(text = "", maxRecords = DEFAULT_HISTORY_LIMIT) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const limit = Math.max(1, Number(maxRecords || DEFAULT_HISTORY_LIMIT));
  return `${lines.slice(Math.max(0, lines.length - limit)).join("\n")}\n`;
}

function appendHarnessCheckHistory(report = {}, historyPath = DEFAULT_HISTORY_PATH, maxRecords = DEFAULT_HISTORY_LIMIT) {
  const target = historyPath instanceof URL ? historyPath : new URL(String(historyPath || ""), import.meta.url);
  mkdirSync(new URL(".", target), { recursive: true });
  appendFileSync(target, `${JSON.stringify(compactHarnessCheckHistoryRecord(report))}\n`, "utf8");
  const pruned = pruneJsonlText(readFileSync(target, "utf8"), maxRecords);
  writeFileSync(target, pruned, "utf8");
}

function runNodeCheck({ label, args }) {
  const commandText = `node ${args.join(" ")}`;
  console.log(`\n[${label}] ${commandText}`);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
    stdio: "pipe"
  });
  const completedAt = Date.now();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    label,
    command: commandText,
    args,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || "",
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    stdoutChars: String(result.stdout || "").length,
    stderrChars: String(result.stderr || "").length,
    error: result.error ? String(result.error.message || result.error) : ""
  };
}

export function runHarnessChecks({
  reportPath = DEFAULT_REPORT_PATH,
  historyPath = DEFAULT_HISTORY_PATH,
  historyLimit = DEFAULT_HISTORY_LIMIT
} = {}) {
  const startedAt = Date.now();
  const outcomes = [];
  let audit = null;
  try {
    audit = auditHarnessCheckPlan(checks);
    console.log(`[Harness self-audit] ${audit.syntaxTargetCount} syntax target(s), ${audit.testTargetCount} test target(s), ${audit.featureTokenCount} feature token(s).`);
    for (const check of checks) {
      const outcome = runNodeCheck(check);
      outcomes.push(outcome);
      if (!outcome.ok) {
        throw new Error(`${outcome.command} exited with ${outcome.status}`);
      }
    }
    const report = buildHarnessCheckReport({
      ok: true,
      startedAt,
      completedAt: Date.now(),
      audit,
      outcomes
    });
    writeHarnessCheckReport(report, reportPath);
    appendHarnessCheckHistory(report, historyPath, historyLimit);
    console.log(`\nHarness report written to ${fileURLToPath(reportPath instanceof URL ? reportPath : new URL(String(reportPath), import.meta.url))}.`);
    console.log("\nHarness checks passed.");
    return true;
  } catch (error) {
    const report = buildHarnessCheckReport({
      ok: false,
      startedAt,
      completedAt: Date.now(),
      audit,
      outcomes,
      error: String(error?.message || error || "harness checks failed")
    });
    try {
      writeHarnessCheckReport(report, reportPath);
      appendHarnessCheckHistory(report, historyPath, historyLimit);
    } catch (writeError) {
      console.error(`Harness report write failed: ${writeError.message}`);
    }
    console.error(`\nHarness checks failed: ${error.message}`);
    process.exitCode = 1;
    return false;
  }
}

export { buildHarnessCheckReport, compactHarnessCheckHistoryRecord, pruneJsonlText };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runHarnessChecks();
}
