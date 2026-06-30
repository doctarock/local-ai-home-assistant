import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createToolLoopRepairHelpers } from "./tool-loop-repair-helpers.js";
import { createObserverWorkerTools } from "./observer-worker-tools.js";

async function createTools() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-worker-tools-"));
  const personalRoot = path.join(root, "memory", "personal");
  const tools = createObserverWorkerTools({
    PROMPT_MEMORY_PERSONAL_DAILY_ROOT: personalRoot,
    appendVolumeText: async (filePath, content) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, content, "utf8");
    },
    ensureAutonomousToolApproved: async () => {},
    ensureVolumeFile: async (filePath, content) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, content, "utf8");
      }
    },
    formatDayKey: () => "2026-06-05",
    getCurrentTimeMs: () => Date.parse("2026-06-05T01:00:00Z"),
    fs,
    normalizeToolCallRecord: (value) => value,
    normalizeToolName: (value = "") => String(value || "").trim(),
    parseToolCallArgs: (normalized) => normalized.args || {},
    path,
    readVolumeFile: async (filePath) => fs.readFile(filePath, "utf8"),
    writeVolumeText: async (filePath, content) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
    }
  });
  return { root, personalRoot, tools };
}

test("shared tool-name normalizer maps directory aliases to list_files", () => {
  const { normalizeToolName } = createToolLoopRepairHelpers({
    compactTaskText: (value = "") => String(value || ""),
    normalizeContainerMountPathCandidate: (value = "") => String(value || ""),
    normalizeContainerPathForComparison: (value = "") => String(value || "")
  });

  assert.equal(normalizeToolName("list_directory"), "list_files");
  assert.equal(normalizeToolName("list-dir"), "list_files");
  assert.equal(normalizeToolName("functions.list_directory"), "list_files");
});

test("update_daily_personal_notes redirects future dates to the current local day", async () => {
  const { root, personalRoot, tools } = await createTools();
  try {
    const result = await tools.executeWorkerToolCall({
      function: { name: "update_daily_personal_notes" },
      args: {
        date: "2026-06-08",
        content: "I noticed a concrete thing today.",
        mode: "append"
      }
    }, {});

    assert.equal(result.date, "2026-06-05");
    assert.equal(result.requestedDate, "2026-06-08");
    assert.equal(result.dateAdjusted, true);
    const todayContent = await fs.readFile(path.join(personalRoot, "2026-06-05.md"), "utf8");
    assert.match(todayContent, /I noticed a concrete thing today\./);
    await assert.rejects(
      fs.readFile(path.join(personalRoot, "2026-06-08.md"), "utf8"),
      /ENOENT/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("update_daily_personal_notes appends multiple current-day notes to one file", async () => {
  const { root, personalRoot, tools } = await createTools();
  try {
    await tools.executeWorkerToolCall({
      function: { name: "update_daily_personal_notes" },
      args: { content: "First current-day note.", mode: "append" }
    }, {});
    await tools.executeWorkerToolCall({
      function: { name: "update_daily_personal_notes" },
      args: { date: "2026-06-05", content: "Second current-day note.", mode: "append" }
    }, {});

    const todayContent = await fs.readFile(path.join(personalRoot, "2026-06-05.md"), "utf8");
    assert.match(todayContent, /First current-day note\./);
    assert.match(todayContent, /Second current-day note\./);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("file tools accept snake_case file_path alias", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-worker-tools-"));
  try {
    let listedPath = "";
    const tools = createObserverWorkerTools({
      listFilesInContainer: async (target) => {
        listedPath = target;
        return [];
      },
      normalizeToolCallRecord: (value) => value,
      normalizeToolName: (value = "") => String(value || "").trim(),
      parseToolCallArgs: (normalized) => normalized.args || {},
      resolveToolPath: (value = "") => String(value || "").trim()
    });

    await tools.executeWorkerToolCall({
      function: { name: "list_files" },
      args: {
        file_path: "/home/nova/.observer-sandbox/workspace/simple-check-project"
      }
    }, {});

    assert.equal(listedPath, "/home/nova/.observer-sandbox/workspace/simple-check-project");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("edit_file accepts snake_case replacement aliases", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-worker-tools-"));
  try {
    let editTarget = "";
    let editPayload = null;
    const tools = createObserverWorkerTools({
      editContainerTextFile: async (target, payload) => {
        editTarget = target;
        editPayload = payload;
        return { ok: true };
      },
      ensureAutonomousToolApproved: async () => {},
      normalizeToolCallRecord: (value) => value,
      normalizeToolName: (value = "") => String(value || "").trim(),
      parseToolCallArgs: (normalized) => normalized.args || {},
      resolveToolPath: (value = "") => String(value || "").trim()
    });

    await tools.executeWorkerToolCall({
      function: { name: "edit_file" },
      args: {
        file_path: "/home/nova/.observer-sandbox/workspace/simple-check-project/README.md",
        old_text: "Old heading",
        new_text: "New heading",
        replace_all: true,
        expected_replacements: 1
      }
    }, {});

    assert.equal(editTarget, "/home/nova/.observer-sandbox/workspace/simple-check-project/README.md");
    assert.equal(editPayload.oldText, "Old heading");
    assert.equal(editPayload.newText, "New heading");
    assert.equal(editPayload.replaceAll, true);
    assert.equal(editPayload.expectedReplacements, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("edit_file accepts full_content alias for whole-file replacement", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-worker-tools-"));
  try {
    let writtenTarget = "";
    let writtenContent = "";
    const tools = createObserverWorkerTools({
      ensureAutonomousToolApproved: async () => {},
      normalizeToolCallRecord: (value) => value,
      normalizeToolName: (value = "") => String(value || "").trim(),
      parseToolCallArgs: (normalized) => normalized.args || {},
      resolveToolPath: (value = "") => String(value || "").trim(),
      writeContainerTextFile: async (target, content) => {
        writtenTarget = target;
        writtenContent = content;
        return { ok: true };
      }
    });

    await tools.executeWorkerToolCall({
      function: { name: "edit_file" },
      args: {
        path: "/home/nova/.observer-sandbox/workspace/simple-check-project/README.md",
        full_content: "# Replacement\n"
      }
    }, {});

    assert.equal(writtenTarget, "/home/nova/.observer-sandbox/workspace/simple-check-project/README.md");
    assert.equal(writtenContent, "# Replacement\n");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("move_path accepts source and destination aliases", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-worker-tools-"));
  try {
    let moveFrom = "";
    let moveTo = "";
    const tools = createObserverWorkerTools({
      ensureAutonomousToolApproved: async () => {},
      moveContainerPath: async (from, to) => {
        moveFrom = from;
        moveTo = to;
        return { ok: true };
      },
      normalizeToolCallRecord: (value) => value,
      normalizeToolName: (value = "") => String(value || "").trim(),
      parseToolCallArgs: (normalized) => normalized.args || {},
      resolveToolPath: (value = "") => String(value || "").trim()
    });

    await tools.executeWorkerToolCall({
      function: { name: "move_path" },
      args: {
        source: "/home/nova/.observer-sandbox/workspace/simple-check-project/source.md",
        destination: "/home/nova/.observer-sandbox/workspace/simple-check-project/destination.md"
      }
    }, {});

    assert.equal(moveFrom, "/home/nova/.observer-sandbox/workspace/simple-check-project/source.md");
    assert.equal(moveTo, "/home/nova/.observer-sandbox/workspace/simple-check-project/destination.md");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
