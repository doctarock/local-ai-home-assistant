export function registerIntakeRoutingRoutes(context = {}) {
  const app = context.app;
  const runHook = typeof context.runHook === "function"
    ? context.runHook
    : async (_name = "", payload = undefined) => payload;

  async function applyIntakeRequestHook(route = "", payload = {}) {
    const normalizedRoute = String(route || "").trim();
    const hookPayload = {
      ...payload,
      route: normalizedRoute,
      at: Date.now()
    };
    const nextPayload = await runHook("intake:request:received", hookPayload);
    const routeHookName = normalizedRoute
      ? `intake:${normalizedRoute}:request:received`
      : "";
    return routeHookName
      ? await runHook(routeHookName, nextPayload || hookPayload)
      : (nextPayload || hookPayload);
  }

  app.post("/api/tasks/triage", async (req, res) => {
    try {
      const requestPayload = await applyIntakeRequestHook("tasks:triage", {
        message: req.body?.message,
        sessionId: req.body?.sessionId || "Main",
        intakeBrainId: req.body?.intakeBrainId || "bitnet",
        internetEnabled: req.body?.internetEnabled,
        forceToolUse: req.body?.forceToolUse,
        sourceIdentity: req.body?.sourceIdentity || null,
        metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
      });
      const message = context.normalizeUserRequest(requestPayload?.message);
      const sessionId = String(requestPayload?.sessionId || "Main").trim();
      const intakeBrain = await context.getBrain(String(requestPayload?.intakeBrainId || "bitnet"));
      const internetEnabled = requestPayload?.internetEnabled == null
        ? context.getObserverConfig().defaults.internetEnabled
        : Boolean(requestPayload.internetEnabled);
      const selectedMountIds = Array.isArray(context.getObserverConfig().defaults.mountIds)
        ? context.getObserverConfig().defaults.mountIds.map((value) => String(value))
        : [];
      const forceToolUse = Boolean(requestPayload?.forceToolUse);
      const sourceIdentity = context.normalizeSourceIdentityRecord(requestPayload?.sourceIdentity);

      if (!message) {
        return res.status(400).json({ ok: false, error: "message is required" });
      }
      context.noteInteractiveActivity();

      const intakeResult = await context.runIntakeWithOptionalRewrite({
        message,
        sessionId,
        internetEnabled,
        selectedMountIds,
        forceToolUse,
        sourceIdentity
      });
      const effectiveMessage = String(intakeResult.effectiveMessage || message).trim() || message;
      const nativeResponse = intakeResult.nativeResponse;
      if (nativeResponse) {
        await context.appendDailyQuestionLog({
          message: effectiveMessage,
          sessionId,
          route: `observer-native:${nativeResponse.type}`,
          notes: nativeResponse.text || nativeResponse.detail || ""
        });
        if (typeof context.appendSessionExchange === "function") {
          context.appendSessionExchange(sessionId, {
            userText: effectiveMessage,
            agentText: nativeResponse.text || nativeResponse.detail || ""
          });
        }
        return res.json({
          ok: true,
          triage: {
            intakeBrainId: intakeBrain.id,
            brainId: "observer",
            mode: "observer-native",
            reason: nativeResponse.type,
            complexity: 0,
            signals: {},
            selectedBrainId: "observer",
            selectedBrainLabel: "Observer",
            selectedBrainModel: "native",
            nativeResponse,
            effectiveMessage,
            rewrite: intakeResult.rewrite || null
          }
        });
      }

      const triage = context.triageTaskRequest({
        message: effectiveMessage,
        intakeBrainId: intakeBrain.id,
        internetEnabled,
        selectedMountIds,
        forceToolUse
      });
      context.startHelperAnalysisForRequest({
        message: effectiveMessage,
        sessionId
      });
      const intakePlan = intakeResult.intakePlan;
      const selectedBrain = intakePlan.action === "reply_only"
        ? intakeBrain
        : await context.getBrain("worker");
      if (intakePlan.action === "reply_only") {
        await context.appendDailyQuestionLog({
          message: effectiveMessage,
          sessionId,
          route: `reply-only:${intakeBrain.id}`,
          notes: intakePlan.replyText || intakePlan.reason || ""
        });
      }
      if (typeof context.appendSessionExchange === "function" && intakePlan.replyText) {
        context.appendSessionExchange(sessionId, {
          userText: effectiveMessage,
          agentText: intakePlan.replyText,
          action: intakePlan.action
        });
      }
      res.json({
        ok: true,
        triage: {
          ...triage,
          mode: intakePlan.action === "reply_only" ? "reply_only" : triage.mode,
          brainId: intakePlan.action === "reply_only" ? intakeBrain.id : triage.brainId,
          replyText: intakePlan.replyText,
          plannedTasks: intakePlan.tasks,
          intakeReason: intakePlan.reason,
          action: intakePlan.action,
          helperAnalysis: await context.getHelperAnalysisForRequest({
            message: effectiveMessage,
            sessionId,
            waitMs: 50
          }),
          selectedBrainId: selectedBrain.id,
          selectedBrainLabel: selectedBrain.label,
          selectedBrainModel: selectedBrain.model,
          effectiveMessage,
          rewrite: intakeResult.rewrite || null
        }
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/agent/run", async (req, res) => {
    try {
      const requestPayload = await applyIntakeRequestHook("agent:run", {
        message: req.body?.message,
        sessionId: req.body?.sessionId || "Main",
        brainId: req.body?.brainId || "main",
        preset: req.body?.preset || "autonomous",
        internetEnabled: req.body?.internetEnabled,
        forceToolUse: req.body?.forceToolUse,
        requireWorkerPreflight: req.body?.requireWorkerPreflight,
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
        sourceIdentity: req.body?.sourceIdentity || null,
        metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
      });
      const message = context.normalizeUserRequest(requestPayload?.message);
      const sessionId = String(requestPayload?.sessionId || "Main").trim();
      const internetEnabled = requestPayload?.internetEnabled == null
        ? context.getObserverConfig().defaults.internetEnabled
        : Boolean(requestPayload.internetEnabled);
      const selectedMountIds = Array.isArray(context.getObserverConfig().defaults.mountIds)
        ? context.getObserverConfig().defaults.mountIds.map((value) => String(value))
        : [];
      const forceToolUse = Boolean(requestPayload?.forceToolUse);
      const requireWorkerPreflight = Boolean(requestPayload?.requireWorkerPreflight);
      const preset = String(requestPayload?.preset || "autonomous").trim();
      const attachments = Array.isArray(requestPayload?.attachments) ? requestPayload.attachments : [];
      const sourceIdentity = context.normalizeSourceIdentityRecord(requestPayload?.sourceIdentity);

      if (!message) {
        return res.status(400).json({ error: "message is required" });
      }
      context.noteInteractiveActivity();
      const intakeResult = await context.runIntakeWithOptionalRewrite({
        message,
        sessionId,
        internetEnabled,
        selectedMountIds,
        forceToolUse,
        sourceIdentity
      });
      const effectiveMessage = String(intakeResult.effectiveMessage || message).trim() || message;
      const nativeResponse = intakeResult.nativeResponse;
      if (nativeResponse) {
        if (typeof context.appendSessionExchange === "function") {
          context.appendSessionExchange(sessionId, {
            userText: effectiveMessage,
            agentText: nativeResponse.text || nativeResponse.detail || ""
          });
        }
        const outputFiles = nativeResponse.outputFiles || await context.listObserverOutputFiles();
        return res.json({
          ok: true,
          code: 0,
          preset,
          brain: {
            id: "observer",
            label: "Observer",
            model: "native"
          },
          forceToolUse: false,
          network: "native",
          mounts: [],
          attachments: [],
          outputFiles,
          parsed: {
            status: "ok",
            result: {
              payloads: [
                {
                  text: context.annotateNovaSpeechText(nativeResponse.text, nativeResponse.type === "question" ? "question" : "reply"),
                  mediaUrl: null
                }
              ],
              meta: {
                durationMs: 0,
                native: true
              }
            }
          },
          stdout: nativeResponse.detail || nativeResponse.text,
          stderr: "",
          rewrite: intakeResult.rewrite || null,
          effectiveMessage
        });
      }
      context.startHelperAnalysisForRequest({ message: effectiveMessage, sessionId });
      const intake = intakeResult.intakePlan;
      const enqueueResponse = intake.action === "enqueue"
        ? await (async () => {
            const helperAnalysis = await context.getHelperAnalysisForRequest({ message: effectiveMessage, sessionId, waitMs: 900 });
            const created = [];
            for (const task of intake.tasks.length ? intake.tasks : [{ message: effectiveMessage }]) {
              created.push(await context.createQueuedTask({
                message: task.message,
                sessionId,
                requestedBrainId: "worker",
                intakeBrainId: "bitnet",
                internetEnabled,
                selectedMountIds,
                forceToolUse,
                requireWorkerPreflight,
                attachments,
                helperAnalysis,
                notes: task.every ? "Observer queued periodic scheduler task." : "Observer queued task for deferred processing.",
                taskMeta: task.every ? {
                  scheduler: {
                    periodic: true,
                    name: task.message.slice(0, 80),
                    seriesId: `sched-${Date.now()}-${created.length + 1}`,
                    every: task.every,
                    everyMs: context.parseEveryToMs(task.every)
                  },
                  notBeforeAt: Date.now() + context.parseEveryToMs(task.every)
                } : {}
              }));
            }
            return created;
          })()
        : [];
      const agentReplyText = intake.replyText || (intake.action === "enqueue" ? "I'll take a closer look now." : "Done.");
      if (typeof context.appendSessionExchange === "function" && agentReplyText) {
        context.appendSessionExchange(sessionId, {
          userText: effectiveMessage,
          agentText: agentReplyText,
          action: intake.action
        });
      }
      res.json({
        ok: true,
        code: 0,
        preset,
        brain: {
          id: "bitnet",
          label: context.agentBrains[0].label,
          model: context.agentBrains[0].model
        },
        forceToolUse: false,
        network: "local",
        mounts: [],
        attachments: [],
        outputFiles: await context.listObserverOutputFiles(),
        parsed: {
          status: "ok",
          result: {
            payloads: [
              {
                text: context.annotateNovaSpeechText(
                  agentReplyText,
                  intake.action === "enqueue" ? "success" : "reply"
                ),
                mediaUrl: null
              }
            ],
            meta: {
              durationMs: 0,
              intake: true,
              tasksQueued: enqueueResponse.length
            }
          }
        },
        stdout: intake.replyText || "",
        stderr: "",
        tasks: enqueueResponse,
        rewrite: intakeResult.rewrite || null,
        effectiveMessage
      });
    } catch (error) {
      context.broadcast(`[observer] agent error: ${error.message}`);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}
