import assert from "node:assert/strict";
import test from "node:test";
import {
  auditHarnessCheckPlan,
  buildHarnessCheckReport,
  compactHarnessCheckHistoryRecord,
  pruneJsonlText
} from "../run-harness-checks.js";

test("harness gate self-audit accepts the current check plan", () => {
  const audit = auditHarnessCheckPlan();
  assert.equal(audit.ok, true);
  assert.ok(audit.syntaxTargetCount >= 5);
  assert.ok(audit.testTargetCount >= 4);
  assert.ok(audit.featureTokenCount >= 8);
});

test("harness gate self-audit rejects missing critical targets", () => {
  assert.throws(
    () => auditHarnessCheckPlan([
      {
        label: "Focused harness tests",
        args: ["--test", "server/task-flight-recorder-service.test.js"]
      }
    ]),
    /missing syntax target run-harness-checks\.js/
  );
});

test("harness check report captures audit, totals, and failed check", () => {
  const report = buildHarnessCheckReport({
    ok: false,
    startedAt: 100,
    completedAt: 175,
    audit: { ok: true, syntaxTargetCount: 14, testTargetCount: 11, featureTokenCount: 9 },
    outcomes: [
      { label: "Syntax checks", command: "node --check a.js", ok: true, status: 0 },
      { label: "Focused harness tests", command: "node --test b.test.js", ok: false, status: 1 }
    ],
    error: "node --test b.test.js exited with 1"
  });

  assert.equal(report.ok, false);
  assert.equal(report.durationMs, 75);
  assert.equal(report.audit.featureTokenCount, 9);
  assert.equal(report.totals.checkCount, 2);
  assert.equal(report.totals.passedCount, 1);
  assert.equal(report.totals.failedCount, 1);
  assert.equal(report.failedCheck.command, "node --test b.test.js");
  assert.match(report.error, /exited with 1/);
});

test("harness check history record keeps compact trend fields", () => {
  const report = buildHarnessCheckReport({
    ok: false,
    startedAt: 100,
    completedAt: 180,
    audit: { ok: true, syntaxTargetCount: 14, testTargetCount: 11, featureTokenCount: 12 },
    outcomes: [
      { label: "Syntax checks", command: "node --check a.js", ok: true, status: 0 },
      { label: "Focused harness tests", command: "node --test b.test.js", ok: false, status: 1 }
    ],
    error: "node --test b.test.js exited with 1"
  });

  const record = compactHarnessCheckHistoryRecord(report);
  assert.equal(record.ok, false);
  assert.equal(record.durationMs, 80);
  assert.equal(record.audit.featureTokenCount, 12);
  assert.equal(record.totals.failedCount, 1);
  assert.equal(record.failedCheck.command, "node --test b.test.js");
  assert.equal(Object.hasOwn(record, "checks"), false);
});

test("harness check history pruning keeps newest jsonl records", () => {
  const source = [
    JSON.stringify({ completedAt: 1 }),
    "",
    JSON.stringify({ completedAt: 2 }),
    JSON.stringify({ completedAt: 3 }),
    JSON.stringify({ completedAt: 4 })
  ].join("\n");

  const pruned = pruneJsonlText(source, 2);
  const records = pruned.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.completedAt), [3, 4]);
  assert.equal(pruned.endsWith("\n"), true);
});
