export function createTaskFlightRecorderService(options = {}) {
  const {
    compactTaskText = (value = "") => String(value || ""),
    emitCoreEvent = async () => null,
    fs = null,
    listTransactionsForTask = async () => [],
    pathModule = null,
    readTaskHistory = async () => [],
    root = ""
  } = options;

  function taskRoot(taskId = "") {
    return pathModule.join(root, sanitizeTaskId(taskId));
  }

  function sanitizeTaskId(value = "") {
    return String(value || "").trim().replace(/[^a-z0-9_.-]/gi, "_") || "unknown-task";
  }

  function jsonlPath(taskId = "", name = "") {
    return pathModule.join(taskRoot(taskId), `${name}.jsonl`);
  }

  function statePath(taskId = "", name = "") {
    return pathModule.join(taskRoot(taskId), `${name}.json`);
  }

  async function appendJsonLine(filePath = "", record = {}) {
    await fs.mkdir(pathModule.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async function readJsonLines(filePath = "", limit = 80) {
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        return [];
      }
      throw error;
    }
    return String(raw || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(Number(limit || 80), 500)));
  }

  async function appendProviderHistory(taskId = "", entry = {}) {
    const normalizedTaskId = String(taskId || entry?.taskId || "").trim();
    if (!normalizedTaskId) {
      return null;
    }
    const record = await appendJsonLine(jsonlPath(normalizedTaskId, "provider-history"), {
      schemaVersion: 1,
      at: Date.now(),
      taskId: normalizedTaskId,
      provider: String(entry.provider || "ollama").trim(),
      model: String(entry.model || "").trim(),
      brainId: String(entry.brainId || "").trim(),
      step: Number(entry.step || 0),
      role: String(entry.role || (entry.normalizedDecision ? "assistant_decision" : "assistant")).trim(),
      ok: entry.ok === true,
      durationMs: Math.max(0, Number(entry.durationMs || 0)),
      promptHash: String(entry.promptHash || "").trim(),
      rawText: compactTaskText(String(entry.rawText || ""), 12000),
      normalizedDecision: entry.normalizedDecision && typeof entry.normalizedDecision === "object" ? entry.normalizedDecision : null,
      error: compactTaskText(String(entry.error || ""), 1000),
      providerState: entry.providerState && typeof entry.providerState === "object" ? entry.providerState : {}
    });
    const previous = await readProviderSummary(normalizedTaskId);
    await writeProviderSummary(normalizedTaskId, {
      ...(previous && typeof previous === "object" ? previous : {}),
      provider: record.provider,
      model: record.model || previous?.model || "",
      brainId: record.brainId || previous?.brainId || "",
      latestProviderStep: Math.max(Number(previous?.latestProviderStep || 0), Number(record.step || 0)),
      latestProviderRecordAt: record.at,
      continuation: {
        sameProviderResumeAvailable: Boolean(previous?.continuation?.sameProviderResumeAvailable || record.providerState?.continuationToken || record.providerState?.responseId),
        crossProviderResumeAvailable: true,
        visibleTranscriptAvailable: true,
        preservedProviderStateKeys: [...new Set([
          ...(Array.isArray(previous?.continuation?.preservedProviderStateKeys) ? previous.continuation.preservedProviderStateKeys : []),
          ...Object.keys(record.providerState || {})
        ])].sort()
      }
    });
    await emitCoreEvent({
      type: "provider.history_saved",
      taskId: normalizedTaskId,
      provider: record.provider,
      status: record.ok ? "ok" : "failed",
      summary: `${record.provider || "provider"} history saved for step ${record.step || 0}`
    }).catch(() => {});
    return record;
  }

  async function appendToolStep(taskId = "", entry = {}) {
    const normalizedTaskId = String(taskId || entry?.taskId || "").trim();
    if (!normalizedTaskId) {
      return null;
    }
    const record = await appendJsonLine(jsonlPath(normalizedTaskId, "tool-steps"), {
      schemaVersion: 1,
      at: Date.now(),
      taskId: normalizedTaskId,
      step: Number(entry.step || 0),
      toolCallId: String(entry.toolCallId || "").trim(),
      name: String(entry.name || "").trim(),
      argsPreview: compactTaskText(String(entry.argsPreview || ""), 2000),
      transportOk: entry.transportOk === true,
      semanticOk: entry.semanticOk === true,
      durationMs: Math.max(0, Number(entry.durationMs || 0)),
      transactionId: String(entry.transactionId || entry.toolResult?.transactionId || "").trim(),
      failureClass: String(entry.failureClass || "").trim(),
      error: compactTaskText(String(entry.error || ""), 1000),
      resultPreview: compactTaskText(String(entry.resultPreview || ""), 4000)
    });
    await emitCoreEvent({
      type: "tool.step_recorded",
      taskId: normalizedTaskId,
      toolName: record.name,
      transactionId: record.transactionId,
      status: record.semanticOk ? "ok" : "failed",
      summary: `${record.name || "tool"} ${record.semanticOk ? "completed" : "failed"}`
    }).catch(() => {});
    return record;
  }

  async function appendHookTrace(taskId = "", entry = {}) {
    const normalizedTaskId = String(taskId || entry?.taskId || "").trim();
    if (!normalizedTaskId) {
      return null;
    }
    return appendJsonLine(jsonlPath(normalizedTaskId, "hook-trace"), {
      schemaVersion: 1,
      at: Date.now(),
      taskId: normalizedTaskId,
      hook: String(entry.hook || "").trim(),
      pluginId: String(entry.pluginId || "").trim(),
      effect: compactTaskText(String(entry.effect || ""), 1000),
      payloadPreview: compactTaskText(String(entry.payloadPreview || ""), 4000)
    });
  }

  async function appendReadBasis(taskId = "", entry = {}) {
    const normalizedTaskId = String(taskId || entry?.taskId || "").trim();
    if (!normalizedTaskId) {
      return null;
    }
    return appendJsonLine(jsonlPath(normalizedTaskId, "read-basis"), {
      schemaVersion: 1,
      at: Date.now(),
      taskId: normalizedTaskId,
      toolCallId: String(entry.toolCallId || "").trim(),
      path: String(entry.path || "").trim(),
      scope: String(entry.scope || "container_workspace").trim(),
      size: Math.max(0, Number(entry.size || 0)),
      hash: String(entry.hash || "").trim(),
      source: String(entry.source || "read_file").trim()
    });
  }

  async function writeProviderSummary(taskId = "", summary = {}) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) {
      return null;
    }
    const record = {
      schemaVersion: 1,
      taskId: normalizedTaskId,
      updatedAt: Date.now(),
      ...summary
    };
    const filePath = statePath(normalizedTaskId, "provider-summary");
    await fs.mkdir(pathModule.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  async function readProviderSummary(taskId = "") {
    try {
      return JSON.parse(await fs.readFile(statePath(taskId, "provider-summary"), "utf8"));
    } catch {
      return null;
    }
  }

  async function listRecordedTaskIds({ limit = 50 } = {}) {
    let entries = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const dirs = [];
    for (const entry of entries) {
      if (!entry?.isDirectory?.()) continue;
      const taskId = String(entry.name || "").trim();
      if (!taskId) continue;
      let modifiedAt = 0;
      try {
        const stat = await fs.stat(pathModule.join(root, taskId));
        modifiedAt = Number(stat.mtimeMs || 0);
      } catch {
        modifiedAt = 0;
      }
      dirs.push({ taskId, modifiedAt });
    }
    return dirs
      .sort((left, right) => Number(right.modifiedAt || 0) - Number(left.modifiedAt || 0))
      .slice(0, Math.max(1, Math.min(Number(limit || 50), 500)));
  }

  async function patchProviderSummary(taskId = "", patch = {}) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId || !patch || typeof patch !== "object") return null;
    const previous = await readProviderSummary(normalizedTaskId);
    return writeProviderSummary(normalizedTaskId, {
      ...(previous && typeof previous === "object" ? previous : {}),
      ...patch
    });
  }

  async function buildTaskResumeSummary(taskId = "", options = {}) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return null;
    const limit = Math.max(5, Math.min(Number(options.limit || 40), 120));
    const [toolSteps, transactions, readBasis, providerSummary, providerHistory, hookTrace] = await Promise.all([
      readJsonLines(jsonlPath(normalizedTaskId, "tool-steps"), limit),
      listTransactionsForTask(normalizedTaskId),
      readJsonLines(jsonlPath(normalizedTaskId, "read-basis"), limit),
      readProviderSummary(normalizedTaskId),
      readJsonLines(jsonlPath(normalizedTaskId, "provider-history"), limit),
      readJsonLines(jsonlPath(normalizedTaskId, "hook-trace"), limit)
    ]);
    if (!toolSteps.length && !transactions.length && !readBasis.length && !providerHistory.length && !hookTrace.length) {
      return null;
    }
    const lines = ["Prior run context for this task (do not repeat completed work):"];
    if (providerSummary?.lastRunOutcome) {
      const outcome = String(providerSummary.lastRunOutcome || "").trim();
      const stopReason = String(providerSummary.lastRunStopReason || "").trim();
      lines.push(`- Last run outcome: ${outcome}${stopReason ? ` (${stopReason})` : ""}`);
    }
    const appliedTransactions = Array.isArray(transactions)
      ? transactions.filter((t) => String(t.status || "").trim() === "applied")
      : [];
    const uniquePaths = [...new Set(readBasis.map((e) => String(e.path || "").trim()).filter(Boolean))];
    if (appliedTransactions.length) {
      lines.push(`- Applied changes (${appliedTransactions.length}):`);
      for (const txn of appliedTransactions.slice(-8)) {
        const op = String(txn.operation || "").trim();
        const target = String(txn.target?.path || txn.target || "").trim();
        const entry = `  ${op}${target ? ` ${target}` : ""}`.trimEnd();
        if (entry.trim()) lines.push(entry);
      }
    }
    if (readBasis.length) {
      if (uniquePaths.length) {
        lines.push(`- Files read (${uniquePaths.length}): ${uniquePaths.slice(-6).join(", ")}`);
      }
    }
    if (toolSteps.length) {
      const stepSummary = toolSteps.slice(-6).map((s) => {
        const name = String(s.name || "").trim();
        const ok = s.semanticOk ? "ok" : "failed";
        return `${name}(${ok})`;
      });
      lines.push(`- Last tool steps: ${stepSummary.join(", ")}`);
    }
    const evalSummary = buildHarnessEvalSummary({
      providerHistory,
      toolSteps,
      hookTrace,
      readBasis,
      transactions
    });
    const health = evalSummary.health && typeof evalSummary.health === "object" ? evalSummary.health : {};
    const healthStatus = String(health.status || "").trim();
    const healthReasons = Array.isArray(health.reasons)
      ? health.reasons.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (healthStatus && healthStatus !== "healthy") {
      lines.push(`- Harness health: ${healthStatus}${healthReasons.length ? ` (${healthReasons.join(", ")})` : ""}`);
    }
    if (healthReasons.includes("hidden_tool_violation")) {
      const latestVisibleTools = Array.isArray(evalSummary.tools?.latestVisibleTools)
        ? evalSummary.tools.latestVisibleTools.map((tool) => String(tool || "").trim()).filter(Boolean)
        : [];
      lines.push(`- Resume guidance: stay inside the currently exposed tools${latestVisibleTools.length ? ` (${latestVisibleTools.join(", ")})` : ""}; request or search for missing capability instead of calling hidden tools.`);
    }
    if (healthReasons.includes("inspection_heavy")) {
      lines.push("- Resume guidance: avoid another broad read/list pass; choose one concrete action, validation, capability request, or valid no-change conclusion.");
      const recentReadTargets = uniquePaths.slice(-6);
      if (recentReadTargets.length) {
        lines.push(`- Resume guidance: already inspected ${recentReadTargets.join(", ")}; do not reread those targets unless they changed or you can name the exact missing fact.`);
      }
      lines.push("- Resume contract: before any more read-only calls, name the one missing fact that blocks action; otherwise use an available action/capability tool, ask one focused QUESTION FOR USER, or finish with the required no-change wording and inspected paths.");
    }
    if (healthReasons.includes("tool_selection_uncertain")) {
      const selectorReason = String(evalSummary.tools?.toolSelectionReason || "").trim();
      const matchedFamilies = Array.isArray(evalSummary.tools?.matchedToolFamilies)
        ? evalSummary.tools.matchedToolFamilies.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      lines.push(`- Resume guidance: previous tool selection was uncertain${selectorReason ? ` (${selectorReason})` : ""}${matchedFamilies.length ? ` after matching ${matchedFamilies.join(", ")}` : ""}; prefer the visible tools already exposed and request/search for missing capability instead of guessing.`);
    }
    if (healthReasons.includes("completion_policy_rejection")) {
      const completion = evalSummary.completion && typeof evalSummary.completion === "object" ? evalSummary.completion : {};
      const reasons = Array.isArray(completion.rejectionReasons)
        ? completion.rejectionReasons.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3)
        : [];
      lines.push(`- Resume guidance: the previous final_text was rejected by completion policy${reasons.length ? ` (${reasons.join(" | ")})` : ""}. Do not repeat that final answer; keep working until the blocker is fixed, then finish with changed files, validation outcome, or valid no-change evidence.`);
    }
    return lines.join("\n");
  }

  async function buildDebugPacket(taskId = "", options = {}) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) {
      throw new Error("taskId is required");
    }
    const limit = Math.max(5, Math.min(Number(options.limit || 80), 500));
    const [timeline, providerHistory, toolSteps, transactions, hookTrace, providerSummary, readBasis] = await Promise.all([
      readTaskHistory(normalizedTaskId, { limit }),
      readJsonLines(jsonlPath(normalizedTaskId, "provider-history"), limit),
      readJsonLines(jsonlPath(normalizedTaskId, "tool-steps"), limit),
      listTransactionsForTask(normalizedTaskId),
      readJsonLines(jsonlPath(normalizedTaskId, "hook-trace"), limit),
      readProviderSummary(normalizedTaskId),
      readJsonLines(jsonlPath(normalizedTaskId, "read-basis"), limit)
    ]);
    return {
      ok: true,
      taskId: normalizedTaskId,
      timeline,
      providerSummary,
      harnessEval: buildHarnessEvalSummary({
        providerHistory,
        toolSteps,
        hookTrace,
        readBasis,
        transactions
      }),
      providerHistory,
      toolSteps,
      transactions,
      hookTrace,
      readBasis
    };
  }

  function countBy(values = []) {
    const counts = {};
    for (const value of Array.isArray(values) ? values : []) {
      const key = String(value || "").trim();
      if (!key) continue;
      counts[key] = Number(counts[key] || 0) + 1;
    }
    return counts;
  }

  function uniqueStrings(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean))];
  }

  function buildHarnessEvalSummary({
    providerHistory = [],
    toolSteps = [],
    hookTrace = [],
    readBasis = [],
    transactions = []
  } = {}) {
    const providers = Array.isArray(providerHistory) ? providerHistory : [];
    const steps = Array.isArray(toolSteps) ? toolSteps : [];
    const hooks = Array.isArray(hookTrace) ? hookTrace : [];
    const providerPromptStates = providers
      .filter((entry) => entry?.role === "assistant" && entry?.providerState && typeof entry.providerState === "object")
      .map((entry) => entry.providerState);
    const contextStates = providerPromptStates.filter((state) => Object.prototype.hasOwnProperty.call(state, "contextReduced"));
    const latestContextState = contextStates[contextStates.length - 1] || {};
    const visibleToolLists = providerPromptStates
      .map((state) => Array.isArray(state.visibleTools) ? state.visibleTools.map((tool) => String(tool || "").trim()).filter(Boolean) : [])
      .filter((tools) => tools.length);
    const latestVisibleTools = visibleToolLists[visibleToolLists.length - 1] || [];
    const latestHasToolSelectionConfidence = Object.prototype.hasOwnProperty.call(latestContextState, "toolSelectionConfident");
    const latestToolSelectionConfident = latestContextState.toolSelectionConfident === true;
    const toolSelectionUncertain = latestVisibleTools.length > 0 && latestHasToolSelectionConfidence && !latestToolSelectionConfident;
    const matchedToolFamilies = Array.isArray(latestContextState.matchedToolFamilies)
      ? latestContextState.matchedToolFamilies.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const optionalToolFamiliesMatched = Number(latestContextState.optionalToolFamiliesMatched || 0);
    const totalOptionalToolFamilies = Number(latestContextState.totalOptionalToolFamilies || 0);
    const toolSelectionReason = String(latestContextState.toolSelectionReason || "").trim();
    const hiddenToolSteps = steps.filter((step) => String(step?.failureClass || "").trim() === "hidden_tool_not_available");
    const failedToolSteps = steps.filter((step) => step?.semanticOk !== true);
    const readOnlyNames = new Set(["list_files", "read_document", "read_file", "shell_command", "web_fetch", "summarize"]);
    const semanticOkSteps = steps.filter((step) => step?.semanticOk === true);
    const readOnlyOkCount = semanticOkSteps.filter((step) => readOnlyNames.has(String(step?.name || "").trim())).length;
    const actionOkCount = Math.max(0, semanticOkSteps.length - readOnlyOkCount);
    const appliedTransactions = (Array.isArray(transactions) ? transactions : [])
      .filter((txn) => String(txn?.status || "").trim() === "applied");
    const promptChars = providerPromptStates
      .map((state) => Number(state.promptChars || 0))
      .filter((value) => value > 0);
    const originalChars = contextStates
      .map((state) => Number(state.originalUserRequestChars || 0))
      .filter((value) => value > 0);
    const focusedChars = contextStates
      .map((state) => Number(state.userRequestChars || 0))
      .filter((value) => value > 0);
    const contextReducedCount = contextStates.filter((state) => state.contextReduced === true).length;
    const promptContextTraces = hooks.filter((entry) => String(entry?.hook || "") === "worker:prompt:context");
    const hiddenToolTraces = hooks.filter((entry) => String(entry?.hook || "") === "worker:tool-call:hidden-tool");
    const completionPolicyTraces = hooks.filter((entry) => String(entry?.hook || "") === "worker:completion-policy:rejected");
    const completionPolicyReasons = uniqueStrings(completionPolicyTraces.map((entry) => entry.effect || entry.payloadPreview || ""));
    const failureClasses = countBy(failedToolSteps.map((step) => step.failureClass || (step.error ? "tool_error" : "")));
    const toolUsage = countBy(steps.map((step) => step.name));
    const signals = [];
    if (contextReducedCount > 0) signals.push("context_reduced");
    if (latestVisibleTools.length > 0) signals.push("focused_tools_recorded");
    if (toolSelectionUncertain) signals.push("tool_selection_uncertain");
    if (hiddenToolSteps.length > 0 || hiddenToolTraces.length > 0) signals.push("hidden_tool_violation");
    if (readOnlyOkCount >= 3 && actionOkCount === 0 && appliedTransactions.length === 0) signals.push("inspection_heavy");
    if (failedToolSteps.length > 0) signals.push("tool_failures");
    if (completionPolicyTraces.length > 0) signals.push("completion_policy_rejection");
    if (appliedTransactions.length > 0) signals.push("workspace_progress");
    const recommendations = [];
    if (!contextStates.length) {
      recommendations.push("No focused-context providerState was recorded; verify this task ran after the focused harness changes.");
    }
    if (hiddenToolSteps.length > 0 || hiddenToolTraces.length > 0) {
      recommendations.push("Model attempted hidden tools; inspect visibleTools and consider whether selector is too narrow or prompt memory is leaking old tool names.");
    }
    if (toolSelectionUncertain) {
      recommendations.push("Tool selector was not confident; inspect the visible tool list and task routing hints before blaming the model.");
    }
    if (readOnlyOkCount >= 3 && actionOkCount === 0 && appliedTransactions.length === 0) {
      recommendations.push("Run is inspection-heavy without concrete action; inspect post-tool checkpoint behavior and project-cycle completion policy.");
    }
    if (failedToolSteps.length > 0 && hiddenToolSteps.length === 0) {
      recommendations.push("Tool failures occurred; inspect failureClasses and argsPreview for repair or permission gaps.");
    }
    if (completionPolicyTraces.length > 0) {
      recommendations.push("Completion policy rejected at least one final_text; inspect completion.rejectionReasons and the final summary evidence before changing prompts.");
    }
    if (!recommendations.length) {
      recommendations.push("Harness trace looks structurally healthy; evaluate task outcome quality and project progress next.");
    }
    const healthReasons = [];
    if (!contextStates.length) healthReasons.push("missing_focused_context_state");
    if (toolSelectionUncertain) healthReasons.push("tool_selection_uncertain");
    if (hiddenToolSteps.length > 0 || hiddenToolTraces.length > 0) healthReasons.push("hidden_tool_violation");
    if (readOnlyOkCount >= 3 && actionOkCount === 0 && appliedTransactions.length === 0) healthReasons.push("inspection_heavy");
    if (failedToolSteps.length > 0 && hiddenToolSteps.length === 0) healthReasons.push("tool_failures");
    if (completionPolicyTraces.length > 0) healthReasons.push("completion_policy_rejection");
    let healthStatus = "watch";
    if (healthReasons.length) {
      healthStatus = "needs_attention";
    } else if (signals.includes("workspace_progress") || semanticOkSteps.length > 0) {
      healthStatus = "healthy";
    }
    return {
      schemaVersion: 1,
      health: {
        status: healthStatus,
        reasons: healthReasons
      },
      providerRecordCount: providers.filter((entry) => entry?.provider && entry.provider !== "observer-normalized").length,
      decisionRecordCount: providers.filter((entry) => entry?.role === "assistant_decision").length,
      toolStepCount: steps.length,
      successfulToolStepCount: semanticOkSteps.length,
      failedToolStepCount: failedToolSteps.length,
      appliedTransactionCount: appliedTransactions.length,
      readBasisCount: Array.isArray(readBasis) ? readBasis.length : 0,
      prompt: {
        contextStateCount: contextStates.length,
        contextReducedCount,
        latestContextReduced: latestContextState.contextReduced === true,
        latestPromptChars: Number(latestContextState.promptChars || 0),
        latestUserRequestChars: Number(latestContextState.userRequestChars || 0),
        latestOriginalUserRequestChars: Number(latestContextState.originalUserRequestChars || 0),
        maxPromptChars: promptChars.length ? Math.max(...promptChars) : 0,
        maxOriginalUserRequestChars: originalChars.length ? Math.max(...originalChars) : 0,
        minFocusedUserRequestChars: focusedChars.length ? Math.min(...focusedChars) : 0,
        promptContextTraceCount: promptContextTraces.length
      },
      tools: {
        latestVisibleTools,
        latestVisibleToolCount: latestVisibleTools.length,
        toolSelectionConfident: latestToolSelectionConfident,
        toolSelectionReason,
        matchedToolFamilies,
        optionalToolFamiliesMatched,
        totalOptionalToolFamilies,
        hiddenToolViolationCount: hiddenToolSteps.length + hiddenToolTraces.length,
        readOnlyOkCount,
        actionOkCount,
        toolUsage,
        failureClasses
      },
      completion: {
        policyRejectionCount: completionPolicyTraces.length,
        rejectionReasons: completionPolicyReasons.slice(0, 6)
      },
      signals,
      recommendations
    };
  }

  function mergeCountMaps(target = {}, source = {}) {
    for (const [key, value] of Object.entries(source || {})) {
      if (!key) continue;
      target[key] = Number(target[key] || 0) + Number(value || 0);
    }
    return target;
  }

  function pct(value = 0) {
    return `${Math.round(Number(value || 0) * 100)}%`;
  }

  function buildHarnessImprovementBacklog({ totals = {}, rates = {}, tasks = [], failureClasses = {} } = {}) {
    const taskList = Array.isArray(tasks) ? tasks : [];
    const items = [];
    const addItem = ({
      id = "",
      title = "",
      severity = "medium",
      score = 0,
      evidence = "",
      action = "",
      taskIds = []
    } = {}) => {
      if (!id || !title) return;
      items.push({
        id,
        title,
        severity,
        score: Number(score || 0),
        evidence: compactTaskText(evidence, 500),
        action: compactTaskText(action, 500),
        taskIds: uniqueStrings(taskIds).slice(0, 6)
      });
    };
    const taskCount = Math.max(1, Number(totals.taskCount || 0));
    const hiddenTaskIds = taskList
      .filter((task) => Number(task?.tools?.hiddenToolViolationCount || 0) > 0 || (Array.isArray(task?.signals) && task.signals.includes("hidden_tool_violation")))
      .map((task) => task.taskId);
    if (Number(totals.hiddenToolViolationCount || 0) > 0) {
      addItem({
        id: "hidden-tool-violations",
        title: "Stop hidden tool calls",
        severity: "critical",
        score: 100 + Number(totals.hiddenToolViolationCount || 0),
        evidence: `${Number(totals.hiddenToolViolationCount || 0)} hidden-tool hit(s) across ${hiddenTaskIds.length || "unknown"} task(s).`,
        action: "Inspect visibleTools for the affected tasks; if the selector is too narrow, expose the needed family, otherwise remove leaked hidden tool names from prompts and memory.",
        taskIds: hiddenTaskIds
      });
    }
    const uncertainTaskIds = taskList
      .filter((task) => Array.isArray(task?.signals) && task.signals.includes("tool_selection_uncertain"))
      .map((task) => task.taskId);
    if (Number(totals.toolSelectionUncertainCount || 0) > 0) {
      addItem({
        id: "tool-selection-uncertainty",
        title: "Tighten dynamic tool selection",
        severity: Number(rates.toolSelectionUncertainTaskRate || 0) >= 0.25 ? "high" : "medium",
        score: 80 + Number(totals.toolSelectionUncertainCount || 0),
        evidence: `${pct(rates.toolSelectionUncertainTaskRate)} of recent tasks had uncertain tool selection.`,
        action: "Review matched tool families and selector reasons; split broad task routing hints or add sharper family keywords before blaming model behavior.",
        taskIds: uncertainTaskIds
      });
    }
    const inspectionTaskIds = taskList
      .filter((task) => Array.isArray(task?.signals) && task.signals.includes("inspection_heavy"))
      .map((task) => task.taskId);
    if (Number(totals.inspectionHeavyCount || 0) > 0 && (
      Number(totals.inspectionHeavyCount || 0) > Number(totals.workspaceProgressCount || 0)
      || Number(rates.inspectionHeavyTaskRate || 0) >= 0.25
    )) {
      addItem({
        id: "inspection-heavy-no-progress",
        title: "Convert inspection loops into action checkpoints",
        severity: Number(totals.workspaceProgressCount || 0) === 0 ? "high" : "medium",
        score: 70 + Number(totals.inspectionHeavyCount || 0) - Number(totals.workspaceProgressCount || 0),
        evidence: `${Number(totals.inspectionHeavyCount || 0)} inspection-heavy task(s) vs ${Number(totals.workspaceProgressCount || 0)} workspace-progress task(s).`,
        action: "Strengthen post-read checkpoints and project-cycle gates so repeated reads must transition into edit, write, ask, or explicit blocker states.",
        taskIds: inspectionTaskIds
      });
    }
    const toolFailureTaskIds = taskList
      .filter((task) => Array.isArray(task?.signals) && task.signals.includes("tool_failures"))
      .map((task) => task.taskId);
    if (Number(rates.toolFailureTaskRate || 0) > 0.2) {
      const topFailure = Object.entries(failureClasses || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0] || [];
      addItem({
        id: "tool-failure-rate",
        title: "Repair recurring tool failures",
        severity: Number(rates.toolFailureTaskRate || 0) >= 0.5 ? "high" : "medium",
        score: 60 + Number(totals.toolFailuresCount || 0),
        evidence: `${pct(rates.toolFailureTaskRate)} of recent tasks had tool failures${topFailure[0] ? `; top class ${topFailure[0]}=${topFailure[1]}` : ""}.`,
        action: "Inspect argsPreview and failureClasses, then add argument repair, permission guidance, or narrower tool routing for the dominant failure class.",
        taskIds: toolFailureTaskIds
      });
    }
    const completionPolicyTaskIds = taskList
      .filter((task) => Array.isArray(task?.signals) && task.signals.includes("completion_policy_rejection"))
      .map((task) => task.taskId);
    if (Number(totals.completionPolicyRejectionTaskCount || 0) > 0) {
      addItem({
        id: "completion-policy-rejections",
        title: "Tune completion validation friction",
        severity: Number(rates.completionPolicyRejectionTaskRate || 0) >= 0.25 ? "high" : "medium",
        score: 65 + Number(totals.completionPolicyRejectionCount || 0),
        evidence: `${pct(rates.completionPolicyRejectionTaskRate)} of recent tasks hit completion-policy rejection (${Number(totals.completionPolicyRejectionCount || 0)} rejection event(s)).`,
        action: "Inspect completion.rejectionReasons for affected tasks; if the policy is right, sharpen retry guidance, otherwise loosen the overly strict blocker.",
        taskIds: completionPolicyTaskIds
      });
    }
    if (!Number(totals.contextStateCount || 0)) {
      addItem({
        id: "missing-focused-context-state",
        title: "Restore focused-context telemetry",
        severity: "high",
        score: 90,
        evidence: "No recent tasks recorded focused-context providerState.",
        action: "Run fresh queued work after the harness changes or verify providerState persistence in observer-execution-runner.",
        taskIds: taskList.map((task) => task.taskId)
      });
    }
    if (!items.length) {
      addItem({
        id: "outcome-quality-review",
        title: "Review outcome quality next",
        severity: "low",
        score: 10,
        evidence: `Structural harness signals look healthy across ${taskCount} recent task(s).`,
        action: "Sample completed task artifacts and compare user-visible outcome quality; expand deterministic checks for any recurring quality gap.",
        taskIds: taskList.slice(0, 6).map((task) => task.taskId)
      });
    }
    return items.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((item, index) => ({
      ...item,
      rank: index + 1
    }));
  }

  async function buildHarnessEvalReport(options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 40), 200));
    const perTaskLimit = Math.max(5, Math.min(Number(options.perTaskLimit || 80), 500));
    const tasks = await listRecordedTaskIds({ limit });
    const summaries = [];
    const totals = {
      taskCount: 0,
      providerRecordCount: 0,
      decisionRecordCount: 0,
      toolStepCount: 0,
      successfulToolStepCount: 0,
      failedToolStepCount: 0,
      appliedTransactionCount: 0,
      contextStateCount: 0,
      contextReducedCount: 0,
      contextReducedTaskCount: 0,
      hiddenToolViolationCount: 0,
      hiddenToolViolationTaskCount: 0,
      inspectionHeavyCount: 0,
      workspaceProgressCount: 0,
      toolFailuresCount: 0,
      completionPolicyRejectionCount: 0,
      completionPolicyRejectionTaskCount: 0,
      focusedToolsRecordedCount: 0,
      toolSelectionUncertainCount: 0
    };
    const signalCounts = {};
    const failureClasses = {};
    const toolUsage = {};
    for (const task of tasks) {
      let packet = null;
      try {
        packet = await buildDebugPacket(task.taskId, { limit: perTaskLimit });
      } catch (error) {
        summaries.push({
          taskId: task.taskId,
          modifiedAt: task.modifiedAt,
          error: compactTaskText(String(error?.message || error || "failed to build debug packet"), 300)
        });
        continue;
      }
      const evalSummary = packet?.harnessEval && typeof packet.harnessEval === "object" ? packet.harnessEval : {};
      const signals = Array.isArray(evalSummary.signals) ? evalSummary.signals : [];
      const prompt = evalSummary.prompt || {};
      const tools = evalSummary.tools || {};
      const completion = evalSummary.completion || {};
      totals.taskCount += 1;
      totals.providerRecordCount += Number(evalSummary.providerRecordCount || 0);
      totals.decisionRecordCount += Number(evalSummary.decisionRecordCount || 0);
      totals.toolStepCount += Number(evalSummary.toolStepCount || 0);
      totals.successfulToolStepCount += Number(evalSummary.successfulToolStepCount || 0);
      totals.failedToolStepCount += Number(evalSummary.failedToolStepCount || 0);
      totals.appliedTransactionCount += Number(evalSummary.appliedTransactionCount || 0);
      totals.contextStateCount += Number(prompt.contextStateCount || 0);
      totals.contextReducedCount += Number(prompt.contextReducedCount || 0);
      totals.hiddenToolViolationCount += Number(tools.hiddenToolViolationCount || 0);
      totals.completionPolicyRejectionCount += Number(completion.policyRejectionCount || 0);
      if (signals.includes("context_reduced")) totals.contextReducedTaskCount += 1;
      if (signals.includes("hidden_tool_violation")) totals.hiddenToolViolationTaskCount += 1;
      if (signals.includes("inspection_heavy")) totals.inspectionHeavyCount += 1;
      if (signals.includes("workspace_progress")) totals.workspaceProgressCount += 1;
      if (signals.includes("tool_failures")) totals.toolFailuresCount += 1;
      if (signals.includes("completion_policy_rejection")) totals.completionPolicyRejectionTaskCount += 1;
      if (signals.includes("focused_tools_recorded")) totals.focusedToolsRecordedCount += 1;
      if (signals.includes("tool_selection_uncertain")) totals.toolSelectionUncertainCount += 1;
      for (const signal of signals) {
        signalCounts[signal] = Number(signalCounts[signal] || 0) + 1;
      }
      mergeCountMaps(failureClasses, tools.failureClasses);
      mergeCountMaps(toolUsage, tools.toolUsage);
      summaries.push({
        taskId: task.taskId,
        modifiedAt: task.modifiedAt,
        signals,
        recommendations: Array.isArray(evalSummary.recommendations) ? evalSummary.recommendations.slice(0, 3) : [],
        prompt: {
          latestContextReduced: prompt.latestContextReduced === true,
          latestPromptChars: Number(prompt.latestPromptChars || 0),
          latestUserRequestChars: Number(prompt.latestUserRequestChars || 0),
          latestOriginalUserRequestChars: Number(prompt.latestOriginalUserRequestChars || 0)
        },
        tools: {
          latestVisibleToolCount: Number(tools.latestVisibleToolCount || 0),
          toolSelectionConfident: tools.toolSelectionConfident === true,
          toolSelectionReason: String(tools.toolSelectionReason || "").trim(),
          matchedToolFamilies: Array.isArray(tools.matchedToolFamilies) ? tools.matchedToolFamilies.slice(0, 10) : [],
          optionalToolFamiliesMatched: Number(tools.optionalToolFamiliesMatched || 0),
          totalOptionalToolFamilies: Number(tools.totalOptionalToolFamilies || 0),
          hiddenToolViolationCount: Number(tools.hiddenToolViolationCount || 0),
          readOnlyOkCount: Number(tools.readOnlyOkCount || 0),
          actionOkCount: Number(tools.actionOkCount || 0)
        },
        completion: {
          policyRejectionCount: Number(completion.policyRejectionCount || 0),
          rejectionReasons: Array.isArray(completion.rejectionReasons) ? completion.rejectionReasons.slice(0, 3) : []
        }
      });
    }
    const taskCount = Math.max(1, Number(totals.taskCount || 0));
    const rates = {
      contextReducedTaskRate: totals.contextReducedTaskCount / taskCount,
      focusedToolsRecordedTaskRate: totals.focusedToolsRecordedCount / taskCount,
      toolSelectionUncertainTaskRate: totals.toolSelectionUncertainCount / taskCount,
      inspectionHeavyTaskRate: totals.inspectionHeavyCount / taskCount,
      workspaceProgressTaskRate: totals.workspaceProgressCount / taskCount,
      toolFailureTaskRate: totals.toolFailuresCount / taskCount,
      hiddenToolViolationTaskRate: totals.hiddenToolViolationTaskCount / taskCount,
      completionPolicyRejectionTaskRate: totals.completionPolicyRejectionTaskCount / taskCount
    };
    const recommendations = [];
    if (!totals.contextStateCount) {
      recommendations.push("No recent tasks include focused-context provider state; run fresh queued work before judging harness changes.");
    }
    if (totals.hiddenToolViolationCount > 0) {
      recommendations.push("Hidden-tool violations appeared recently; inspect those tasks before tightening selector rules further.");
    }
    if (totals.toolSelectionUncertainCount > 0) {
      recommendations.push("Tool selector uncertainty appeared recently; inspect task routing hints and selected tool subsets.");
    }
    if (totals.inspectionHeavyCount > totals.workspaceProgressCount) {
      recommendations.push("Inspection-heavy tasks outnumber workspace-progress tasks; continue moving project-cycle convergence into deterministic gates.");
    }
    if (totals.completionPolicyRejectionTaskCount > 0) {
      recommendations.push("Completion-policy rejections appeared recently; inspect whether blockers are catching weak finishes or creating too much retry friction.");
    }
    if (!recommendations.length) {
      recommendations.push("Recent harness traces look structurally healthy; compare task outcome quality and project progress next.");
    }
    const healthReasons = [];
    if (!totals.contextStateCount) healthReasons.push("missing_focused_context_state");
    if (totals.toolSelectionUncertainCount > 0) healthReasons.push("tool_selection_uncertain");
    if (totals.hiddenToolViolationCount > 0) healthReasons.push("hidden_tool_violations");
    if (totals.inspectionHeavyCount > totals.workspaceProgressCount) healthReasons.push("inspection_heavy_exceeds_progress");
    if (rates.toolFailureTaskRate > 0.2) healthReasons.push("tool_failure_rate_high");
    if (rates.completionPolicyRejectionTaskRate > 0.2) healthReasons.push("completion_policy_rejection_rate_high");
    let healthStatus = "watch";
    if (healthReasons.length) {
      healthStatus = "needs_attention";
    } else if (rates.focusedToolsRecordedTaskRate >= 0.8 && rates.workspaceProgressTaskRate > 0) {
      healthStatus = "healthy";
    }
    const backlog = buildHarnessImprovementBacklog({
      totals,
      rates,
      tasks: summaries,
      failureClasses
    });
    return {
      ok: true,
      generatedAt: Date.now(),
      limit,
      perTaskLimit,
      health: {
        status: healthStatus,
        reasons: healthReasons
      },
      totals,
      rates,
      signalCounts,
      failureClasses,
      toolUsage,
      backlog,
      recommendations,
      tasks: summaries
    };
  }

  async function validateProviderHistory(taskId = "", options = {}) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) {
      throw new Error("taskId is required");
    }
    const limit = Math.max(5, Math.min(Number(options.limit || 200), 500));
    const [providerHistory, toolSteps] = await Promise.all([
      readJsonLines(jsonlPath(normalizedTaskId, "provider-history"), limit),
      readJsonLines(jsonlPath(normalizedTaskId, "tool-steps"), limit)
    ]);
    const failures = [];
    const assistantDecisions = providerHistory.filter((entry) => entry.role === "assistant_decision");
    const seenToolCallIds = new Set();
    for (const decision of assistantDecisions) {
      const calls = Array.isArray(decision?.normalizedDecision?.tool_calls)
        ? decision.normalizedDecision.tool_calls
        : [];
      for (const call of calls) {
        const id = String(call?.id || "").trim();
        if (id) {
          seenToolCallIds.add(id);
        }
      }
    }
    const toolStepIds = new Set(toolSteps.map((entry) => String(entry.toolCallId || "").trim()).filter(Boolean));
    for (const id of seenToolCallIds) {
      if (!toolStepIds.has(id)) {
        failures.push(`tool call ${id} has no recorded tool step`);
      }
    }
    const providerRecords = providerHistory.filter((entry) => entry.provider && entry.provider !== "observer-normalized");
    if (!providerRecords.length) {
      failures.push("no provider records found");
    }
    const summary = await readProviderSummary(normalizedTaskId);
    if (!summary?.continuation?.crossProviderResumeAvailable) {
      failures.push("cross-provider resume transcript is not marked available");
    }
    return {
      ok: failures.length === 0,
      taskId: normalizedTaskId,
      failureCount: failures.length,
      failures,
      providerRecordCount: providerRecords.length,
      decisionCount: assistantDecisions.length,
      toolStepCount: toolSteps.length,
      summary
    };
  }

  return {
    appendHookTrace,
    appendProviderHistory,
    appendReadBasis,
    appendToolStep,
    buildDebugPacket,
    buildHarnessEvalSummary,
    buildHarnessEvalReport,
    buildTaskResumeSummary,
    listRecordedTaskIds,
    patchProviderSummary,
    readProviderSummary,
    validateProviderHistory,
    writeProviderSummary
  };
}
