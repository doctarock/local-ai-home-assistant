export function createObserverRuntimeSupport(options = {}) {
  const {
    clients = new Set(),
    compactHookText = (value = "") => String(value || ""),
    getObserverConfig = () => ({}),
    getPluginManager = () => null,
    getTaskDispatchScheduled = () => false,
    observerEventClients = new Set(),
    processQueuedTasksToCapacity = async () => {},
    recoverStaleTaskDispatchLock = async () => {},
    sanitizeHookToken = (value = "") => String(value || ""),
    setTaskDispatchScheduled = () => {}
  } = options;

  function broadcast(line) {
    const msg = `data: ${JSON.stringify({ ts: Date.now(), line })}\n\n`;
    for (const res of clients) {
      res.write(msg);
    }
  }

  function classifySubsystemForObserverEventType(eventType = "") {
    const prefix = String(eventType || "").trim().toLowerCase().split(".")[0];
    if (!prefix) {
      return "runtime";
    }
    if (prefix === "task") {
      return "queue";
    }
    if (["mail", "todo", "calendar", "cron", "projects", "project", "runtime", "plugin", "voice", "trust", "tools"].includes(prefix)) {
      return prefix === "project" ? "projects" : prefix;
    }
    return "runtime";
  }

  function summarizeObserverEventForHook(payload = {}) {
    const eventType = String(payload?.type || "").trim();
    const task = payload?.task && typeof payload.task === "object" ? payload.task : null;
    const mail = payload?.mail && typeof payload.mail === "object" ? payload.mail : null;
    const todo = payload?.todo && typeof payload.todo === "object" ? payload.todo : null;
    return {
      ts: Number(payload?.ts || Date.now()),
      type: eventType,
      subsystem: classifySubsystemForObserverEventType(eventType),
      taskId: String(task?.id || "").trim(),
      taskStatus: String(task?.status || "").trim(),
      mailId: String(mail?.id || "").trim(),
      mailSubject: compactHookText(String(mail?.subject || "").trim(), 180),
      todoId: String(todo?.id || "").trim(),
      todoStatus: String(todo?.status || "").trim()
    };
  }

  let broadcastEventSeq = 0;

  function setBroadcastSeqFloor(n) {
    broadcastEventSeq = Math.max(broadcastEventSeq, Math.max(0, Number(n || 0)));
  }

  function broadcastObserverEvent(event) {
    broadcastEventSeq += 1;
    const payload = {
      ts: Date.now(),
      ...event,
      eventSeq: broadcastEventSeq
    };
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of observerEventClients) {
      res.write(msg);
    }
    const hookPayload = summarizeObserverEventForHook(payload);
    const eventTypeToken = sanitizeHookToken(String(payload?.type || "").replace(/\./g, "-"));
    const pluginManager = getPluginManager();
    void pluginManager?.runHook?.("observer:event", hookPayload);
    if (eventTypeToken) {
      void pluginManager?.runHook?.(`observer:event:${eventTypeToken}`, hookPayload);
    }
    const subsystemToken = sanitizeHookToken(hookPayload.subsystem || "");
    if (subsystemToken) {
      void pluginManager?.runHook?.(`subsystem:${subsystemToken}:event`, hookPayload);
    }
  }

  function scheduleTaskDispatch(delayMs = 150) {
    if (getObserverConfig()?.queue?.paused === true) {
      return;
    }
    if (getTaskDispatchScheduled()) {
      return;
    }
    setTaskDispatchScheduled(true);
    setTimeout(async () => {
      setTaskDispatchScheduled(false);
      try {
        await recoverStaleTaskDispatchLock();
        await processQueuedTasksToCapacity();
      } catch (error) {
        broadcast(`[observer] task dispatch error: ${error.message}`);
      }
    }, delayMs);
  }

  return {
    broadcast,
    broadcastObserverEvent,
    setBroadcastSeqFloor,
    scheduleTaskDispatch
  };
}
