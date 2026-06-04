export function createSandboxStateStore({
  ensureObserverToolContainer = async () => {},
  fs,
  path,
  promptWorkspaceRoot = "",
  runObserverToolContainerNode,
  observerContainerWorkspaceRoot = ""
} = {}) {
  function normalizeHostPath(value = "") {
    return path.resolve(String(value || "")).replaceAll("\\", "/");
  }

  function normalizeContainerPath(value = "") {
    return String(value || "").replaceAll("\\", "/").replace(/\/+/g, "/");
  }

  function isInsideRoot(target = "", root = "") {
    const normalizedTarget = normalizeHostPath(target);
    const normalizedRoot = normalizeHostPath(root).replace(/\/+$/g, "");
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
  }

  function isInsideContainerRoot(target = "", root = "") {
    const normalizedTarget = normalizeContainerPath(target);
    const normalizedRoot = normalizeContainerPath(root).replace(/\/+$/g, "");
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
  }

  function toContainerPath(filePath = "") {
    const raw = String(filePath || "");
    if (observerContainerWorkspaceRoot && isInsideContainerRoot(raw, observerContainerWorkspaceRoot)) {
      return normalizeContainerPath(raw);
    }
    if (promptWorkspaceRoot && isInsideRoot(raw, promptWorkspaceRoot)) {
      const relative = normalizeHostPath(raw).slice(normalizeHostPath(promptWorkspaceRoot).replace(/\/+$/g, "").length).replace(/^\/+/, "");
      return relative ? `${observerContainerWorkspaceRoot}/${relative}` : observerContainerWorkspaceRoot;
    }
    return "";
  }

  function isSandboxStatePath(filePath = "") {
    return Boolean(toContainerPath(filePath));
  }

  async function runStateNode(script, payload = {}, options = {}) {
    await ensureObserverToolContainer();
    return runObserverToolContainerNode(script, payload, options);
  }

  async function readFile(filePath, encoding = "utf8") {
    const containerPath = toContainerPath(filePath);
    if (!containerPath) {
      return fs.readFile(filePath, encoding);
    }
    const result = await runStateNode(`
const fs = require("fs/promises");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  const content = await fs.readFile(payload.filePath, "utf8");
  process.stdout.write(JSON.stringify({ content }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { filePath: containerPath }, { timeoutMs: 30000 });
    return String(result.content || "");
  }

  async function writeFile(filePath, content, encoding = "utf8") {
    const containerPath = toContainerPath(filePath);
    if (!containerPath) {
      return fs.writeFile(filePath, content, encoding);
    }
    await runStateNode(`
const fs = require("fs/promises");
const path = require("path");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  await fs.mkdir(path.posix.dirname(payload.filePath), { recursive: true });
  await fs.writeFile(payload.filePath, String(payload.content || ""), "utf8");
  process.stdout.write(JSON.stringify({ ok: true }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { filePath: containerPath, content: String(content || "") }, { timeoutMs: 30000 });
  }

  async function appendFile(filePath, content, encoding = "utf8") {
    const containerPath = toContainerPath(filePath);
    if (!containerPath) {
      return fs.appendFile(filePath, content, encoding);
    }
    await runStateNode(`
const fs = require("fs/promises");
const path = require("path");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  await fs.mkdir(path.posix.dirname(payload.filePath), { recursive: true });
  await fs.appendFile(payload.filePath, String(payload.content || ""), "utf8");
  process.stdout.write(JSON.stringify({ ok: true }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { filePath: containerPath, content: String(content || "") }, { timeoutMs: 30000 });
  }

  async function mkdir(dirPath, options = {}) {
    const containerPath = toContainerPath(dirPath);
    if (!containerPath) {
      return fs.mkdir(dirPath, options);
    }
    await runStateNode(`
const fs = require("fs/promises");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  await fs.mkdir(payload.dirPath, { recursive: true });
  process.stdout.write(JSON.stringify({ ok: true }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { dirPath: containerPath }, { timeoutMs: 30000 });
  }

  async function access(filePath) {
    const containerPath = toContainerPath(filePath);
    if (!containerPath) {
      return fs.access(filePath);
    }
    const result = await runStateNode(`
const fs = require("fs/promises");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  await fs.access(payload.filePath);
  process.stdout.write(JSON.stringify({ ok: true }));
}
main().catch((error) => {
  error.code = error.code || "ENOENT";
  console.error(JSON.stringify({ message: error.message, code: error.code }));
  process.exit(1);
});
`, { filePath: containerPath }, { timeoutMs: 30000 });
    return result;
  }

  async function stat(filePath) {
    const containerPath = toContainerPath(filePath);
    if (!containerPath) {
      return fs.stat(filePath);
    }
    const result = await runStateNode(`
const fs = require("fs/promises");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  const stat = await fs.stat(payload.filePath);
  process.stdout.write(JSON.stringify({
    isFile: stat.isFile(),
    isDirectory: stat.isDirectory(),
    size: Number(stat.size || 0),
    mtimeMs: Number(stat.mtimeMs || 0)
  }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { filePath: containerPath }, { timeoutMs: 30000 });
    return {
      isFile: () => result.isFile === true,
      isDirectory: () => result.isDirectory === true,
      size: Number(result.size || 0),
      mtimeMs: Number(result.mtimeMs || 0)
    };
  }

  async function readdir(dirPath, options = {}) {
    const containerPath = toContainerPath(dirPath);
    if (!containerPath) {
      return fs.readdir(dirPath, options);
    }
    const result = await runStateNode(`
const fs = require("fs/promises");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  const entries = await fs.readdir(payload.dirPath, { withFileTypes: true });
  process.stdout.write(JSON.stringify({
    entries: entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other"
    }))
  }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { dirPath: containerPath }, { timeoutMs: 30000 });
    const entries = Array.isArray(result.entries) ? result.entries : [];
    if (options?.withFileTypes) {
      return entries.map((entry) => ({
        name: entry.name,
        isFile: () => entry.type === "file",
        isDirectory: () => entry.type === "dir"
      }));
    }
    return entries.map((entry) => entry.name);
  }

  async function rm(filePath, options = {}) {
    const containerPath = toContainerPath(filePath);
    if (!containerPath) {
      return fs.rm(filePath, options);
    }
    await runStateNode(`
const fs = require("fs/promises");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  await fs.rm(payload.filePath, { recursive: payload.recursive === true, force: payload.force === true });
  process.stdout.write(JSON.stringify({ ok: true }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { filePath: containerPath, recursive: options?.recursive === true, force: options?.force === true }, { timeoutMs: 30000 });
  }

  async function rename(oldPath, newPath) {
    const oldContainerPath = toContainerPath(oldPath);
    const newContainerPath = toContainerPath(newPath);
    if (!oldContainerPath && !newContainerPath) {
      return fs.rename(oldPath, newPath);
    }
    if (!oldContainerPath || !newContainerPath) {
      throw new Error("cannot rename between host filesystem and sandbox state");
    }
    await runStateNode(`
const fs = require("fs/promises");
const path = require("path");
async function main() {
  const payload = JSON.parse(await new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input || "{}"));
    process.stdin.on("error", reject);
  }));
  await fs.mkdir(path.posix.dirname(payload.newPath), { recursive: true });
  await fs.rename(payload.oldPath, payload.newPath);
  process.stdout.write(JSON.stringify({ ok: true }));
}
main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`, { oldPath: oldContainerPath, newPath: newContainerPath }, { timeoutMs: 30000 });
  }

  async function appendText(filePath, content) {
    return appendFile(filePath, content, "utf8");
  }

  async function writeText(filePath, content) {
    return writeFile(filePath, content, "utf8");
  }

  async function fileExists(filePath) {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async function ensureFile(filePath, content) {
    if (await fileExists(filePath)) {
      return;
    }
    await writeText(filePath, content);
  }

  async function readText(filePath) {
    return readFile(filePath, "utf8");
  }

  return {
    access,
    appendFile,
    appendText,
    fileExists,
    isSandboxStatePath,
    mkdir,
    readFile,
    readText,
    readdir,
    rename,
    rm,
    stat,
    toContainerPath,
    writeFile,
    writeText,
    ensureFile,
    fs: {
      ...fs,
      access,
      appendFile,
      mkdir,
      readFile,
      readdir,
      rename,
      rm,
      stat,
      writeFile
    }
  };
}
