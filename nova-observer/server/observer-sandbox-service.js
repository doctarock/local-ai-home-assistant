import path from "path";

export function createObserverSandboxService({
  fs,
  runCommand,
  ensureInputHostRoot,
  ensureOutputHostRoot,
  observerToolContainer,
  observerToolImage,
  observerToolStateVolume,
  observerInputHostRoot,
  observerOutputHostRoot,
  observerToolRuntimeUser,
  observerContainerStateRoot,
  observerContainerWorkspaceRoot,
  observerContainerInputRoot,
  observerContainerOutputRoot,
  observerContainerSkillsRoot
} = {}) {
  const runtimeUser = String(observerToolRuntimeUser || "").trim() || "nova";

  function normalizeDockerComparePath(value = "") {
    return path.resolve(String(value || "")).replaceAll("\\", "/").toLowerCase();
  }

  function buildExpectedObserverToolMounts() {
    return [
      {
        type: "volume",
        name: observerToolStateVolume,
        destination: observerContainerStateRoot,
        rw: true
      },
      {
        type: "bind",
        source: observerInputHostRoot,
        destination: observerContainerInputRoot,
        rw: true
      },
      {
        type: "bind",
        source: observerOutputHostRoot,
        destination: observerContainerOutputRoot,
        rw: true
      }
    ];
  }

  async function inspectObserverToolContainerDetails() {
    const result = await runCommand("docker", ["inspect", observerToolContainer], { timeoutMs: 10000 });
    if (result.code !== 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(result.stdout || "[]");
      return parsed[0] || null;
    } catch {
      return null;
    }
  }

  function observerToolContainerMatches(details) {
    if (!details) {
      return false;
    }
    if (String(details?.Config?.Image || "").trim() !== observerToolImage) {
      return false;
    }
    if (String(details?.Config?.WorkingDir || "").trim() !== observerContainerWorkspaceRoot) {
      return false;
    }
    if (String(details?.Config?.User || "").trim() !== runtimeUser) {
      return false;
    }
    const mounts = Array.isArray(details?.Mounts) ? details.Mounts : [];
    const expectedMounts = buildExpectedObserverToolMounts();
    for (const expected of expectedMounts) {
      const match = mounts.find((mount) => {
        if (String(mount?.Type || "").trim() !== expected.type) {
          return false;
        }
        if (String(mount?.Destination || "").trim() !== expected.destination) {
          return false;
        }
        if (Boolean(mount?.RW) !== Boolean(expected.rw)) {
          return false;
        }
        if (expected.type === "volume") {
          return String(mount?.Name || "").trim() === expected.name;
        }
        return true;
      });
      if (!match) {
        return false;
      }
    }
    return !mounts.some((mount) => String(mount?.Destination || "").trim() === "/workspace-dev");
  }

  function buildObserverToolStateBootstrapScript() {
    return [
      `mkdir -p '${observerContainerStateRoot}'`,
      `mkdir -p '${observerContainerWorkspaceRoot}'`,
      `mkdir -p '${observerContainerWorkspaceRoot}/projects'`,
      `mkdir -p '${observerContainerWorkspaceRoot}/memory'`,
      `mkdir -p '${observerContainerWorkspaceRoot}/memory/questions'`,
      `mkdir -p '${observerContainerWorkspaceRoot}/memory/personal'`,
      `mkdir -p '${observerContainerWorkspaceRoot}/memory/briefings'`,
      `mkdir -p '${observerContainerSkillsRoot}'`,
      `chown -R ${runtimeUser}:${runtimeUser} '${observerContainerStateRoot}'`
    ].join(" && ");
  }

  async function bootstrapObserverToolStateVolume() {
    const result = await runCommand("docker", [
      "run",
      "--rm",
      "--user",
      "0",
      "-v",
      `${observerToolStateVolume}:${observerContainerStateRoot}`,
      observerToolImage,
      "sh",
      "-lc",
      buildObserverToolStateBootstrapScript()
    ], { timeoutMs: 30000 });
    if (result.code !== 0) {
      throw new Error(result.stderr || "failed to prepare observer sandbox state volume");
    }
  }

  async function ensureObserverToolContainer() {
    await ensureInputHostRoot();
    await ensureOutputHostRoot();
    await bootstrapObserverToolStateVolume();

    const details = await inspectObserverToolContainerDetails();
    if (details && observerToolContainerMatches(details)) {
      if (details?.State?.Running) {
        return;
      }
      const started = await runCommand("docker", ["start", observerToolContainer], { timeoutMs: 15000 });
      if (started.code === 0) {
        return;
      }
    }
    if (details) {
      await runCommand("docker", ["rm", "-f", observerToolContainer], { timeoutMs: 15000 });
    }
    const dockerArgs = [
      "run",
      "-d",
      "--name",
      observerToolContainer,
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "200",
      "--memory",
      "2g",
      "--cpus",
      "2.0",
      "--user",
      runtimeUser,
      "--tmpfs",
      "/tmp",
      "-w",
      observerContainerWorkspaceRoot,
      "-v",
      `${observerToolStateVolume}:${observerContainerStateRoot}`,
      "-v",
      `${observerInputHostRoot}:${observerContainerInputRoot}`,
      "-v",
      `${observerOutputHostRoot}:${observerContainerOutputRoot}`
    ];
    dockerArgs.push(
      observerToolImage,
      "sh",
      "-lc",
      `mkdir -p '${observerContainerWorkspaceRoot}' && sleep infinity`
    );
    const created = await runCommand("docker", dockerArgs, { timeoutMs: 30000 });
    if (created.code !== 0) {
      throw new Error(created.stderr || "failed to start observer sandbox container");
    }
  }

  async function runObserverToolContainerNode(script, payload = {}, { timeoutMs = 60000 } = {}) {
    await ensureObserverToolContainer();
    const result = await runCommand("docker", [
      "exec",
      "-i",
      observerToolContainer,
      "node",
      "-e",
      script
    ], {
      input: JSON.stringify(payload || {}),
      timeoutMs
    });
    if (result.code !== 0) {
      throw new Error(result.stderr || `container command failed with exit code ${result.code}`);
    }
    try {
      return JSON.parse(result.stdout || "{}");
    } catch {
      throw new Error("failed to parse container tool response");
    }
  }

  return {
    ensureObserverToolContainer,
    normalizeDockerComparePath,
    runObserverToolContainerNode
  };
}
