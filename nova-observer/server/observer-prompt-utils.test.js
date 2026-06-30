import assert from "node:assert/strict";
import test from "node:test";
import { createObserverPromptUtils } from "./observer-prompt-utils.js";

function createPromptUtils() {
  return createObserverPromptUtils({
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit),
    defaultLargeItemChunkChars: 4000,
    maxLargeItemChunkChars: 12000,
    normalizeContainerPathForComparison: (value = "") => String(value || "").trim(),
    normalizeToolCallRecord: (value = {}) => value
  });
}

test("post-tool handoff low-value checkpoint avoids hidden tool names", () => {
  const { buildPostToolDecisionInstruction } = createPromptUtils();
  const rendered = buildPostToolDecisionInstruction(
    [
      {
        tool_call_id: "call_1",
        name: "read_document",
        ok: true,
        result: {
          source: "/home/nova/.observer-sandbox/workspace/project/source.md",
          content: "# Source"
        }
      }
    ],
    {
      stepDiagnostics: { progressKind: "exploration" },
      lowValueStreak: 2,
      requireConcreteConvergence: true,
      availableToolNames: ["read_document", "edit_file", "shell_command"]
    }
  );

  assert.match(rendered, /Checkpoint: you are leaving inspection mode/);
  assert.match(rendered, /use an available edit, write, move, or validation tool/);
  assert.match(rendered, /Visible action\/validation tools for the next move: edit_file, shell_command/);
  assert.match(rendered, /Do not call another read-only tool unless you name the specific missing fact/);
  assert.doesNotMatch(rendered, /write_file/);
  assert.doesNotMatch(rendered, /move_path/);
});

test("post-tool checkpoint only names visible action tools", () => {
  const { buildPostToolDecisionInstruction } = createPromptUtils();
  const rendered = buildPostToolDecisionInstruction(
    [
      {
        name: "read_document",
        ok: true,
        result: {
          source: "/workspace/project/source.md",
          content: "# Source"
        }
      }
    ],
    {
      stepDiagnostics: { progressKind: "inspection_repeat" },
      lowValueStreak: 2,
      requireConcreteConvergence: true,
      availableToolNames: ["read_document", "write_file"]
    }
  );

  assert.match(rendered, /Visible action\/validation tools for the next move: write_file/);
  assert.doesNotMatch(rendered, /edit_file/);
  assert.doesNotMatch(rendered, /move_path/);
  assert.doesNotMatch(rendered, /shell_command/);
});

test("post-tool handoff gives actionable repair for failed tool args", () => {
  const { buildPostToolDecisionInstruction } = createPromptUtils();
  const rendered = buildPostToolDecisionInstruction(
    [
      {
        name: "write_file",
        ok: false,
        error: "path is required"
      },
      {
        name: "edit_file",
        ok: false,
        error: "edit_file content must be non-empty"
      }
    ],
    {
      lowValueStreak: 1,
      requireConcreteConvergence: true
    }
  );

  assert.match(rendered, /Failed tool feedback: write_file: path is required \| edit_file: edit_file content must be non-empty/);
  assert.match(rendered, /retrying the same intended tool with the explicit full path/);
  assert.match(rendered, /providing non-empty content or a valid oldText\/newText replacement/);
  assert.doesNotMatch(rendered, /edit_file for targeted/);
  assert.doesNotMatch(rendered, /write_file for new/);
});
