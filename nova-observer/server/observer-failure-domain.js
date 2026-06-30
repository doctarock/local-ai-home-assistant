export function createObserverFailureDomain(options = {}) {
  const {
    appendDailyOperationalMemory = async () => {},
    compactTaskText = (value = "") => String(value || ""),
    failureTelemetryLogPath = "",
    fs = null,
    getProjectNoChangeMinimumTargets = () => 3,
    getProjectsRuntime = () => null,
    looksLikePlaceholderTaskMessage = () => false,
    pathModule = null,
    queueMaintenanceLogPath = ""
  } = options;

  function classifyFailureText(text = "") {
    const lower = String(text || "").toLowerCase();
    if (/\bfetch failed\b/.test(lower)) return "tool_fetch_failed";
    if (/\btimeout\b|\btimed out\b/.test(lower)) return "timeout";
    if (/\binvalid json\b|\bjson parse\b|\bmalformed json\b/.test(lower)) return "invalid_json";
    if (/\bloop repair.*did not hold\b/.test(lower)) return "loop_repair_failed";
    if (/\btool plan repeated\b|\brepeated tool plan\b|\brepeated the same tool plan\b/.test(lower)) return "repeated_tool_plan";
    if (/\bplanner.*could not repair it\b/.test(lower)) return "loop_repair_failed";
    if (/\bnot available in the current focused tool set\b|\bhidden tool\b|\bhidden_tool_not_available\b/.test(lower)) return "hidden_tool_not_available";
    if (/\blow-value tool loop\b|\btool loop\b|\busing tools without concrete progress\b/.test(lower)) return "low_value_tool_loop";
    if (/\bno inspection\b|\bwithout any concrete inspection\b|\bwithout inspecting concrete\b|\bclaimed completion without inspecting\b/.test(lower)) return "no_inspection";
    if (/\bspeculative\b|\bfuture-tense\b/.test(lower)) return "speculative_completion";
    if (/\bno concrete outcome\b/.test(lower)) return "no_concrete_outcome";
    if (/\bno-change conclusion before inspecting enough\b/.test(lower)) return "no_change_insufficient_inspection";
    if (/\bno-change conclusion without naming the inspected targets\b|\bno change was possible without naming the inspected targets\b/.test(lower)) return "no_change_missing_targets";
    if (/\bno-change conclusion\b/.test(lower) && /\bobjective explicitly required a concrete improvement\b/.test(lower)) return "project_no_change_disallowed";
    if (/\bproject-cycle finalization\b/.test(lower) && /\bno concrete project file change was recorded\b/.test(lower)) return "project_missing_concrete_change";
    if (/\bproject-cycle finalization\b/.test(lower) && /\bwithout naming the changed project target\b/.test(lower)) return "project_final_missing_changed_target";
    if (/\bunresolved completion policy blockers\b|\bcompletion policy still has unresolved blockers\b/.test(lower)) return "project_completion_policy_blocked";
    if (/\bproject-cycle finalization\b/.test(lower) && /\bproject-todo\.md was not updated\b/.test(lower)) return "project_missing_todo_update";
    if (/\bproject-cycle finalization\b/.test(lower) && /\bdocumentation-only changes\b/.test(lower)) return "project_documentation_only_mismatch";
    if (/\binvalid envelope\b|\bechoed tool results\b/.test(lower)) return "invalid_envelope";
    if (/\bempty final response\b/.test(lower)) return "empty_final_response";
    if (/\bcould not.*capability\b|\btool unavailable\b|\bmissing capability\b|\bunsupported tool\b/.test(lower)) return "capability_unavailable";
    if (/\bstalled\b/.test(lower)) return "stalled";
    return "unknown";
  }

  function extractProjectCycleObjectiveText(task = {}) {
    const message = String(task?.message || "").trim();
    return getProjectsRuntime()?.extractTaskDirectiveValue?.(message, "Objective:")
      || getProjectsRuntime()?.extractTaskDirectiveValue?.(message, "Goal:")
      || message;
  }

  function isProjectCyclePlanningObjective(task = {}) {
    return /\b(plan|roadmap|approach|design|architecture)\b/i.test(extractProjectCycleObjectiveText(task));
  }

  function isCapabilityMismatchFailure(classification = "", task = {}) {
    const normalized = String(classification || "").trim().toLowerCase();
    if (["no_inspection", "no_concrete_outcome", "speculative_completion", "repeated_tool_plan", "low_value_tool_loop", "loop_repair_failed", "capability_unavailable", "hidden_tool_not_available"].includes(normalized)) {
      if (normalized === "low_value_tool_loop") {
        const diagnostics = task?.toolLoopDiagnostics && typeof task.toolLoopDiagnostics === "object" ? task.toolLoopDiagnostics : null;
        const hadConcreteProgress = diagnostics && (Number(diagnostics.concreteProgressStepCount || 0) > 0 || (Array.isArray(diagnostics.uniqueConcreteInspectionTargets) && diagnostics.uniqueConcreteInspectionTargets.length > 0));
        if (hadConcreteProgress) {
          const objectiveText = extractProjectCycleObjectiveText(task);
          const objectiveRequiresConcreteImprovementFn = getProjectsRuntime()?.objectiveRequiresConcreteImprovement;
          if (typeof objectiveRequiresConcreteImprovementFn === "function" && !objectiveRequiresConcreteImprovementFn(objectiveText)) {
            return false;
          }
        }
      }
      return true;
    }
    const summary = [
      String(task?.resultSummary || "").trim(),
      String(task?.reviewSummary || "").trim(),
      String(task?.workerSummary || "").trim(),
      String(task?.notes || "").trim()
    ].join(" ").toLowerCase();
    return /\b(could not inspect|tool unavailable|missing capability|lacked capability|unsupported tool)\b/.test(summary);
  }

  function isTransportFailoverFailure(classification = "", task = {}) {
    const normalized = String(classification || "").trim().toLowerCase();
    if (normalized === "tool_fetch_failed") {
      return true;
    }
    if (normalized !== "timeout") {
      return false;
    }
    const summary = [
      String(task?.resultSummary || "").trim(),
      String(task?.reviewSummary || "").trim(),
      String(task?.workerSummary || "").trim(),
      String(task?.notes || "").trim()
    ].join(" ").toLowerCase();
    return (
      summary.includes("headers timeout")
      || summary.includes("fetch failed")
      || summary.includes("failed to reach ollama api")
      || summary.includes("transport failure")
      || summary.includes("ollama api")
    );
  }

  function buildCapabilityMismatchRetryMessage(task = {}, failureClassification = "") {
    const baseMessage = String(task?.message || "").trim();
    if (!baseMessage) {
      return "";
    }
    const minConcreteTargets = getProjectNoChangeMinimumTargets();
    const projectPath = String(task?.projectPath || "").trim();
    const primaryTarget = String(task?.projectWorkPrimaryTarget || "").trim();
    const secondaryTarget = String(task?.projectWorkSecondaryTarget || "").trim();
    const tertiaryTarget = String(task?.projectWorkTertiaryTarget || "").trim();
    const projectsRuntime = getProjectsRuntime();
    const expectedFirstMove = String(task?.projectWorkExpectedFirstMove || "").trim()
      || projectsRuntime?.extractTaskDirectiveValue?.(baseMessage, "Expected first move:");
    const inspectFirst = projectsRuntime?.extractTaskDirectiveValue?.(baseMessage, "Inspect first:")
      || (projectPath && primaryTarget ? `${projectPath}/${primaryTarget}` : "");
    const inspectSecond = projectsRuntime?.extractTaskDirectiveValue?.(baseMessage, "Inspect second if needed:")
      || (projectPath && secondaryTarget ? `${projectPath}/${secondaryTarget}` : "");
    const inspectThird = projectsRuntime?.extractTaskDirectiveValue?.(baseMessage, "Inspect third if needed:")
      || (projectPath && tertiaryTarget ? `${projectPath}/${tertiaryTarget}` : "");
    const retryLines = [];
    const normalizedFailure = String(failureClassification || "").trim().toLowerCase();
    const harnessSignals = Array.isArray(task?.harnessEvalSnapshot?.signals)
      ? task.harnessEvalSnapshot.signals.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const harnessTools = task?.harnessEvalSnapshot?.tools && typeof task.harnessEvalSnapshot.tools === "object"
      ? task.harnessEvalSnapshot.tools
      : {};
    const harnessHealth = task?.harnessEvalSnapshot?.health && typeof task.harnessEvalSnapshot.health === "object"
      ? task.harnessEvalSnapshot.health
      : {};
    const harnessHealthStatus = String(harnessHealth.status || "").trim();
    const harnessHealthReasons = Array.isArray(harnessHealth.reasons)
      ? harnessHealth.reasons.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (normalizedFailure === "no_inspection") {
      retryLines.push("Retry note: the previous worker finished without any concrete inspection.");
      if (expectedFirstMove) {
        retryLines.push(`Start with this exact first move: ${expectedFirstMove}`);
      } else if (inspectFirst) {
        retryLines.push(`Start by inspecting this concrete target: ${inspectFirst}`);
      }
      retryLines.push("Do not return final=true before at least one successful inspection tool call.");
    } else if (normalizedFailure === "speculative_completion") {
      retryLines.push("Retry note: the previous worker stopped with speculative or future-tense language instead of completed work.");
      retryLines.push("Keep working with tools until you have a concrete change, artifact, or the exact no-change conclusion with inspected paths.");
    } else if (normalizedFailure === "no_concrete_outcome") {
      retryLines.push("Retry note: the previous worker finished without a concrete change, output artifact, or valid no-change conclusion.");
      retryLines.push("Either make one safe concrete improvement now or use the exact phrase 'no change is possible' with the inspected paths.");
    } else if (normalizedFailure === "no_change_insufficient_inspection") {
      retryLines.push("Retry note: the previous worker used a no-change conclusion before inspecting enough concrete implementation targets.");
      retryLines.push(`Inspect at least ${minConcreteTargets} distinct concrete implementation files or directories before using that conclusion again.`);
    } else if (normalizedFailure === "no_change_missing_targets") {
      retryLines.push("Retry note: the previous worker used a no-change conclusion without naming the inspected targets.");
      retryLines.push("Name the exact inspected files or directories in the conclusion.");
    } else if (normalizedFailure === "repeated_tool_plan") {
      retryLines.push("Retry note: the previous worker repeated the same tool plan without advancing the work.");
      if (inspectFirst) {
        retryLines.push(`Narrow this retry to ${inspectFirst} and continue from that concrete target instead of replaying the startup bundle.`);
        retryLines.push("Do not repeat the same inspection step twice. After the required read, make one concrete change or use the exact phrase 'no change is possible' with the inspected paths.");
        if (inspectSecond) {
          retryLines.push(`Only inspect ${inspectSecond} if the primary target truly requires it to complete the work.`);
        } else if (inspectThird) {
          retryLines.push(`Only inspect ${inspectThird} if the primary target truly requires it to complete the work.`);
        }
      } else if (inspectSecond) {
        retryLines.push(`Move to this next concrete target instead of replaying the startup bundle: ${inspectSecond}`);
      } else if (inspectThird) {
        retryLines.push(`Move to this next concrete target instead of replaying the startup bundle: ${inspectThird}`);
      } else {
        retryLines.push("Move to one different concrete file, directory, or edit step instead of repeating the same inspection loop.");
      }
    } else if (normalizedFailure === "low_value_tool_loop") {
      retryLines.push("Retry note: the previous worker kept using tools without converging to a concrete change, artifact, capability request, or valid no-change conclusion.");
      retryLines.push("Do not spend another pass on inspection-only steps once you already have enough evidence to act.");
      retryLines.push("If the fix is understood, use an available edit, write, move, or validation tool instead of more read-only inspection.");
      retryLines.push("For file and directory tools, include the explicit full path in the path field on every tool call.");
      retryLines.push("Either make one concrete change, search the skill library for the missing capability, record a capability request, or conclude with the exact phrase 'no change is possible' and the inspected paths.");
    } else if (normalizedFailure === "hidden_tool_not_available") {
      retryLines.push("Retry note: the previous worker tried to call a tool that was not exposed for the focused task.");
      retryLines.push("Use only the tools listed in the current prompt's Available tools section.");
      retryLines.push("If the hidden tool is genuinely required, search the skill library or record a capability request instead of calling it directly.");
      retryLines.push("Otherwise, complete the next step with the available file, inspection, edit, or no-change tools.");
    } else if (normalizedFailure === "project_no_change_disallowed") {
      retryLines.push("Retry note: the previous worker used a no-change conclusion even though this objective required a concrete improvement.");
      if (inspectFirst) {
        retryLines.push(`Continue from ${inspectFirst} and complete one concrete improvement before finishing.`);
      }
      retryLines.push("Do not use the no-change conclusion for this pass unless the objective itself is rewritten to a planning-only review.");
    } else if (normalizedFailure === "project_missing_concrete_change") {
      retryLines.push("Retry note: the previous worker tried to finish a project-cycle pass without a machine-verifiable project change.");
      if (inspectFirst) {
        retryLines.push(`Continue from ${inspectFirst} and complete one concrete project change before finishing.`);
      }
      retryLines.push("If this is a planning or export-readiness pass, update the project tracking docs directly and summarize that completed documentation change explicitly.");
    } else if (normalizedFailure === "project_final_missing_changed_target") {
      retryLines.push("Retry note: the previous worker changed project files but finished without naming the changed project target.");
      retryLines.push("Do not repeat the vague final answer; inspect the prior changed files if needed, then finish with final_text that names at least one changed project file or directory.");
    } else if (normalizedFailure === "project_completion_policy_blocked") {
      retryLines.push("Retry note: the previous worker hit unresolved project-cycle completion policy blockers.");
      const completion = task?.harnessEvalSnapshot?.completion && typeof task.harnessEvalSnapshot.completion === "object"
        ? task.harnessEvalSnapshot.completion
        : {};
      const reasons = Array.isArray(completion.rejectionReasons)
        ? completion.rejectionReasons.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3)
        : [];
      if (reasons.length) {
        retryLines.push(`Completion blocker evidence: ${reasons.join(" | ")}`);
      }
      retryLines.push("Resolve the named blocker before finishing; the next final_text must include changed files, validation outcome, or valid no-change evidence as required by the policy.");
    } else if (normalizedFailure === "project_missing_todo_update") {
      retryLines.push("Retry note: the previous worker made progress but did not update PROJECT-TODO.md before finishing.");
      if (projectPath) {
        retryLines.push(`Update ${projectPath}/PROJECT-TODO.md to check off the completed objective or rewrite it to reflect the remaining work.`);
        retryLines.push(`Keep ${projectPath}/PROJECT-ROLE-TASKS.md aligned with the confirmed next tasks for this pass.`);
      }
      retryLines.push("Finish only after the project tracking files reflect the completed work.");
    } else if (normalizedFailure === "project_documentation_only_mismatch") {
      retryLines.push("Retry note: the previous worker changed only documentation or planning files for an objective that required implementation work.");
      if (inspectFirst) {
        retryLines.push(`Return to ${inspectFirst} or another concrete implementation target and make one implementation change that matches the objective.`);
      }
      retryLines.push("Documentation updates can accompany the pass, but they cannot be the only completed change for this objective.");
    } else if (normalizedFailure === "invalid_envelope") {
      retryLines.push("Retry note: the previous worker echoed tool results instead of returning an assistant decision.");
      retryLines.push("Return either assistant tool_calls for more work or final=true with final_text. Do not output role=tool or tool_results as the top-level response.");
    } else if (normalizedFailure === "empty_final_response") {
      retryLines.push("Retry note: the previous worker ended the task without any usable final_text.");
      retryLines.push("Keep working until you can return a concrete final_text or another assistant tool envelope.");
    } else if (normalizedFailure === "stalled" || normalizedFailure === "timeout") {
      retryLines.push("Retry note: the previous worker stalled before reaching a concrete outcome.");
      if (expectedFirstMove) {
        retryLines.push(`Start with this exact first move: ${expectedFirstMove}`);
      } else if (inspectFirst) {
        retryLines.push(`Start by inspecting this concrete target: ${inspectFirst}`);
      }
      retryLines.push("Narrow the next pass to one concrete move before broadening the scope.");
    }

    const hasHarnessRetrySignal = harnessSignals.length > 0
      || harnessHealthReasons.length > 0
      || Number(harnessTools.hiddenToolViolationCount || 0) > 0
      || (Number(harnessTools.readOnlyOkCount || 0) > 0 && Number(harnessTools.actionOkCount || 0) === 0)
      || harnessTools.toolSelectionConfident === false;
    if (!retryLines.length && hasHarnessRetrySignal) {
      retryLines.push("Retry note: harness telemetry found a stuck execution pattern in the previous run.");
    } else if (!retryLines.length) {
      return baseMessage;
    }
    if (harnessSignals.includes("inspection_heavy")) {
      retryLines.push("Harness note: the previous run was inspection-heavy. Do not replay another broad read/list pass; choose one concrete action, capability request, or valid no-change conclusion after the required first inspection.");
    }
    if (harnessSignals.includes("hidden_tool_violation") || Number(harnessTools.hiddenToolViolationCount || 0) > 0) {
      retryLines.push("Harness note: the previous run tried a hidden tool. Use only tools exposed in the current prompt, or request/search for the missing capability instead of calling hidden tools directly.");
    }
    if (Number(harnessTools.readOnlyOkCount || 0) > 0 && Number(harnessTools.actionOkCount || 0) === 0) {
      retryLines.push(`Harness note: previous read/action balance was ${Number(harnessTools.readOnlyOkCount || 0)}/0. Move from inspection into an available action tool or a valid no-change conclusion.`);
      retryLines.push("Harness next-turn contract: before any more read-only calls, name the one missing fact that blocks action; otherwise use an available action/capability tool, ask one focused QUESTION FOR USER, or finish with the required no-change wording and inspected paths.");
    }
    if (harnessHealthReasons.includes("tool_selection_uncertain") || harnessTools.toolSelectionConfident === false) {
      const selectorReason = String(harnessTools.toolSelectionReason || "").trim();
      const matchedFamilies = Array.isArray(harnessTools.matchedToolFamilies)
        ? harnessTools.matchedToolFamilies.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      retryLines.push(`Harness note: tool selection was uncertain${selectorReason ? ` (${selectorReason})` : ""}${matchedFamilies.length ? ` after matching ${matchedFamilies.join(", ")}` : ""}. If a needed capability is missing, request/search for it instead of guessing hidden tools.`);
    }
    if (harnessHealthStatus === "needs_attention" && harnessHealthReasons.length) {
      retryLines.push(`Harness health: needs_attention (${harnessHealthReasons.join(", ")}). Treat these as constraints for the retry, not background notes.`);
    }
    return [baseMessage, "", ...retryLines].join("\n");
  }

  async function appendFailureTelemetryEntry({ task, phase = "execution", summary = "", classification = "" } = {}) {
    const taskId = String(task?.id || "").trim();
    if (!taskId) {
      return;
    }
    const stamp = new Date().toISOString();
    const finalClassification = String(classification || classifyFailureText(summary)).trim() || "unknown";
    const cleanSummary = compactTaskText(String(summary || "").replace(/\s+/g, " ").trim(), 320) || "No summary available.";
    const rawMessage = String(task?.message || "").replace(/\s+/g, " ").trim();
    const rawOriginalMessage = String(task?.originalMessage || "").replace(/\s+/g, " ").trim();
    const displayMessageSource = looksLikePlaceholderTaskMessage(rawMessage) && rawOriginalMessage
      ? rawOriginalMessage
      : rawMessage;
    const message = compactTaskText(displayMessageSource, 220) || "(no task message)";
    const details = [
      `## ${stamp}`,
      `- Task: ${task?.codename || taskId} (${taskId})`,
      `- Phase: ${String(phase || "execution").trim() || "execution"}`,
      `- Classification: ${finalClassification}`,
      `- Brain: ${String(task?.requestedBrainId || "").trim() || "unknown"}`,
      `- Session: ${String(task?.sessionId || "").trim() || "unknown"}`,
      `- Status: ${String(task?.status || "").trim() || "unknown"}`,
      `- Message: ${message}`,
      `- Summary: ${cleanSummary}`
    ];
    if (task?.previousTaskId) {
      details.push(`- Previous task: ${String(task.previousTaskId).trim()}`);
    }
    if (task?.parentTaskId) {
      details.push(`- Parent task: ${String(task.parentTaskId).trim()}`);
    }
    if (task?.toolLoopDiagnostics?.summary) {
      details.push(`- Tool loop: ${String(task.toolLoopDiagnostics.summary).trim()}`);
    }
    if (task?.harnessEvalSnapshot && typeof task.harnessEvalSnapshot === "object") {
      const signals = Array.isArray(task.harnessEvalSnapshot.signals)
        ? task.harnessEvalSnapshot.signals.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const tools = task.harnessEvalSnapshot.tools && typeof task.harnessEvalSnapshot.tools === "object"
        ? task.harnessEvalSnapshot.tools
        : {};
      const prompt = task.harnessEvalSnapshot.prompt && typeof task.harnessEvalSnapshot.prompt === "object"
        ? task.harnessEvalSnapshot.prompt
        : {};
      const health = task.harnessEvalSnapshot.health && typeof task.harnessEvalSnapshot.health === "object"
        ? task.harnessEvalSnapshot.health
        : {};
      const healthReasons = Array.isArray(health.reasons)
        ? health.reasons.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const matchedFamilies = Array.isArray(tools.matchedToolFamilies)
        ? tools.matchedToolFamilies.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      details.push(`- Harness eval: health=${String(health.status || "unknown").trim() || "unknown"}${healthReasons.length ? ` (${healthReasons.join(", ")})` : ""}; signals=${signals.join(", ") || "none"}; contextReduced=${prompt.latestContextReduced === true ? "yes" : "no"}; visibleTools=${Number(tools.latestVisibleToolCount || 0)}; selector=${tools.toolSelectionConfident === false ? "uncertain" : tools.toolSelectionConfident === true ? "confident" : "unknown"}${tools.toolSelectionReason ? `/${String(tools.toolSelectionReason).trim()}` : ""}${matchedFamilies.length ? ` [${matchedFamilies.join(", ")}]` : ""}; hiddenToolHits=${Number(tools.hiddenToolViolationCount || 0)}; read/action=${Number(tools.readOnlyOkCount || 0)}/${Number(tools.actionOkCount || 0)}`);
    }
    await fs.mkdir(pathModule.dirname(failureTelemetryLogPath), { recursive: true });
    await fs.appendFile(failureTelemetryLogPath, `${details.join("\n")}\n\n`, "utf8");
  }

  async function appendQueueMaintenanceReport(title, lines = []) {
    const heading = String(title || "").trim();
    const bodyLines = Array.isArray(lines)
      ? lines.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    if (!heading && !bodyLines.length) {
      return;
    }
    const stamp = new Date().toISOString();
    const content = [
      `## ${stamp}`,
      heading,
      ...bodyLines.map((line) => `- ${line}`),
      ""
    ].join("\n");
    await fs.mkdir(pathModule.dirname(queueMaintenanceLogPath), { recursive: true });
    await fs.appendFile(queueMaintenanceLogPath, `${content}\n`, "utf8");
    if (bodyLines.length) {
      await appendDailyOperationalMemory(heading, bodyLines);
    }
  }

  return {
    appendFailureTelemetryEntry,
    appendQueueMaintenanceReport,
    buildCapabilityMismatchRetryMessage,
    classifyFailureText,
    extractProjectCycleObjectiveText,
    isCapabilityMismatchFailure,
    isProjectCyclePlanningObjective,
    isTransportFailoverFailure
  };
}
