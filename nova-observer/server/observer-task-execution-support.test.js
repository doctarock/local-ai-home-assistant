import assert from "node:assert/strict";
import test from "node:test";
import { createObserverTaskExecutionSupport } from "./observer-task-execution-support.js";

const workerTools = [
  "list_files",
  "read_file",
  "read_document",
  "edit_file",
  "write_file",
  "move_path",
  "shell_command",
  "web_fetch",
  "send_mail",
  "move_mail",
  "zip",
  "unzip",
  "export_pdf",
  "read_pdf",
  "search_skill_library",
  "inspect_skill_library",
  "install_skill",
  "request_skill_installation",
  "request_tool_addition",
  "list_installed_skills",
  "update_daily_personal_notes"
].map((name) => ({ name }));

const pluginTools = [
  {
    name: "wordpress_upsert_post",
    description: "Create or update a WordPress post."
  }
];

function createSupport() {
  return createObserverTaskExecutionSupport({
    compactTaskText: (value = "", limit = 1000) => String(value || "").slice(0, limit)
  });
}

test("tool selector returns focused metadata for specific code work", () => {
  const { selectToolsForTask } = createSupport();
  const selected = selectToolsForTask(
    "Fix the failing test in the repository and run npm test.",
    "project_cycle",
    workerTools,
    pluginTools
  );

  const selectedNames = selected.tools.map((tool) => tool.name);
  assert.equal(selected.confident, true);
  assert.equal(selected.reason, "focused_family_match");
  assert.deepEqual(selected.matchedFamilies, ["shell"]);
  assert.equal(selected.optionalFamiliesMatched, 1);
  assert.equal(selected.totalOptionalFamilies >= 1, true);
  assert.ok(selectedNames.includes("shell_command"));
  assert.ok(selectedNames.includes("read_document"));
  assert.ok(selectedNames.includes("search_skill_library"));
  assert.ok(selectedNames.includes("inspect_skill_library"));
  assert.ok(selectedNames.includes("request_skill_installation"));
  assert.ok(selectedNames.includes("request_tool_addition"));
  assert.equal(selectedNames.includes("install_skill"), false);
  assert.equal(selectedNames.includes("list_installed_skills"), false);
  assert.equal(selectedNames.includes("send_mail"), false);
});

test("tool selector explains broad uncertain matches and preserves full tool surface", () => {
  const { selectToolsForTask } = createSupport();
  const selected = selectToolsForTask(
    "Rename files, run npm tests, browse https://example.com, email the archive, export a pdf, update wordpress, install skill support, and write personal notes.",
    "project_cycle",
    workerTools,
    pluginTools
  );

  assert.equal(selected.confident, false);
  assert.equal(selected.reason, "too_many_tool_families_matched");
  assert.ok(selected.matchedFamilies.includes("move"));
  assert.ok(selected.matchedFamilies.includes("shell"));
  assert.ok(selected.matchedFamilies.includes("web"));
  assert.ok(selected.matchedFamilies.includes("mail"));
  assert.ok(selected.matchedFamilies.includes("archive"));
  assert.ok(selected.matchedFamilies.includes("pdf"));
  assert.ok(selected.matchedFamilies.includes("wordpress"));
  assert.ok(selected.matchedFamilies.includes("skills"));
  assert.ok(selected.matchedFamilies.includes("personal_notes"));
  assert.equal(selected.optionalFamiliesMatched, selected.matchedFamilies.length);
  assert.equal(selected.tools.length, workerTools.length);
  assert.equal(selected.pluginTools.length, pluginTools.length);
});
