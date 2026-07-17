import crypto from "crypto";
import { createBrainEndpointHealthDomain } from "./lib/brain-endpoint-health-domain.js";
import { createBrainProviderEndpoints } from "./lib/brain-provider-endpoints.js";
import { createBrainRegistryDomain, toBrainLabel } from "./lib/brain-registry-domain.js";

export function createObserverBrainConfigDomain(options = {}) {
  const {
    agentBrains = [],
    compactTaskText = (value = "") => String(value || ""),
    broadcast = () => {},
    extractJsonObject = (value = "") => JSON.parse(String(value || "{}")),
    normalizeAgentSelfReference = (value = "") => String(value || ""),
    getObserverConfig = () => ({}),
    getRoutingConfig = () => ({}),
    getQueueConfig = () => ({}),
    sanitizeConfigId = (value = "", fallback = "") => String(value || fallback || "").trim(),
    isCapabilityCheckRequest = () => false,
    listAllTasks = async () => ({ queued: [], waiting: [], inProgress: [], done: [], failed: [] }),
    runCommand = async () => ({ code: 1, stdout: "", stderr: "unavailable" }),
    runOllamaGenerate = async () => ({ ok: false, stderr: "unavailable" }),
    runOllamaJsonGenerate = async () => ({ ok: false, stderr: "unavailable" }),
    attachHelperAnalysisToRelatedTasks = async () => {},
    localOllamaBaseUrl = "http://127.0.0.1:11434",
    modelKeepAlive = "",
    ollamaContainer = "nova-ollama",
    helperIdleReserveCount = 0,
    helperShadowCacheEnabled = false,
    helperAnalysisTimeoutMs = 1100,
    helperAnalysisCacheTtlMs = 15 * 60 * 1000,
    ollamaEndpointFailureCooldownMs = 2 * 60 * 1000
  } = options;

  const { normalizeProviderBaseUrl, normalizeProviderId } = createBrainProviderEndpoints({ localOllamaBaseUrl });

  const {
    clearOllamaEndpointTransportFailure,
    formatOllamaTransportError,
    getOllamaEndpointHealth,
    getOllamaEndpointTransportCooldown,
    getProviderEndpointHealth,
    invalidateCaches: invalidateEndpointHealthCaches,
    inspectOllamaEndpoint,
    inspectProviderEndpoint,
    isRetriableOllamaTransportError,
    listOllamaModels,
    markOllamaEndpointTransportFailure,
    normalizeOllamaBaseUrl,
    runOllamaEmbed
  } = createBrainEndpointHealthDomain({
    localOllamaBaseUrl,
    ollamaContainer,
    ollamaEndpointFailureCooldownMs,
    normalizeProviderId,
    normalizeProviderBaseUrl,
    runCommand
  });

  const {
    buildBrainConfigPayload,
    decorateBrain,
    findBrainByIdExact,
    getBrain,
    getBrainEndpointForId,
    getBrainQueueLane,
    getConfiguredBrainEndpoints,
    getEnabledBrainIds,
    invalidateCaches: invalidateBrainRegistryCaches,
    isCpuQueueLane,
    listAvailableBrains,
    serializeBrainEndpointConfig,
    serializeBuiltInBrainConfig,
    serializeCustomBrainConfig
  } = createBrainRegistryDomain({
    agentBrains,
    getObserverConfig,
    getQueueConfig,
    getRoutingConfig,
    localOllamaBaseUrl,
    normalizeProviderBaseUrl,
    normalizeProviderId,
    sanitizeConfigId
  });

  let brainWarmInFlight = false;
  let brainActivitySnapshotCache = { at: 0, snapshot: null };
  const helperShadowCache = new Map();

  function invalidateObserverConfigCaches() {
    invalidateBrainRegistryCaches();
    invalidateEndpointHealthCaches();
    brainActivitySnapshotCache = { at: 0, snapshot: null };
  }

  function groupTasksByBrainId(tasks = []) {
    const map = new Map();
    for (const task of tasks) {
      const brainId = String(task?.requestedBrainId || "");
      const list = map.get(brainId);
      if (list) {
        list.push(task);
      } else {
        map.set(brainId, [task]);
      }
    }
    return map;
  }

  function waitMs(delayMs = 0) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(delayMs || 0))));
  }

  async function listHealthyToolWorkers() {
    const availableBrains = await listAvailableBrains();
    const workerCandidates = availableBrains.filter((brain) => brain.kind === "worker" && brain.toolCapable);
    const healthEntries = await Promise.all(workerCandidates.map(async (brain) => ({
      brain,
      health: await getProviderEndpointHealth(brain)
    })));
    return healthEntries.filter((entry) => entry.health?.running).map((entry) => entry.brain);
  }

  function isGenerativeHelperBrain(brain = {}) {
    if (String(brain.kind || "").trim() !== "helper") {
      return false;
    }
    const specialty = String(brain.specialty || "").trim().toLowerCase();
    const text = [brain.id, brain.label, brain.model, brain.description, specialty].map((value) => String(value || "")).join(" ").toLowerCase();
    return specialty !== "retrieval" && !/\b(embed|embedding|vector|mxbai)\b/.test(text);
  }

  function isFastThinkingBrain(brain = {}) {
    const specialty = String(brain?.specialty || "").trim().toLowerCase();
    const id = String(brain?.id || "").trim().toLowerCase();
    return (specialty === "fast_worker" || id === "fast_worker")
      && ["worker", "helper"].includes(String(brain?.kind || "").trim());
  }

  function hasThinkingAnalysisBrainConfigured() {
    const enabledBrainIds = getEnabledBrainIds();
    if (enabledBrainIds.has("helper") || enabledBrainIds.has("fast_worker")) {
      return true;
    }
    const customBrains = Array.isArray(getObserverConfig()?.brains?.custom)
      ? getObserverConfig().brains.custom
      : [];
    return customBrains.some((brain) =>
      enabledBrainIds.has(String(brain?.id || "").trim())
      && String(brain?.specialty || "").trim().toLowerCase() === "fast_worker"
    );
  }

  async function chooseThinkingAnalysisBrain() {
    const brains = await listAvailableBrains();
    const candidates = [
      ...brains.filter((brain) => isFastThinkingBrain(brain)),
      ...brains.filter((brain) => String(brain?.id || "").trim() === "helper")
    ];
    for (const brain of candidates) {
      if (!brain?.ollamaBaseUrl) {
        return brain;
      }
      const health = await getProviderEndpointHealth(brain).catch(() => null);
      if (health?.running) {
        return brain;
      }
    }
    return null;
  }

  async function listHealthyRoutingHelpers() {
    const availableBrains = await listAvailableBrains();
    const helperCandidates = availableBrains.filter((brain) => {
      if (brain.kind !== "helper" || !isGenerativeHelperBrain(brain)) {
        return false;
      }
      const specialty = String(brain.specialty || "").toLowerCase();
      const description = String(brain.description || "").toLowerCase();
      return specialty === "routing" || specialty === "general" || /\b(route|routing|triage|planner|planning|classification)\b/.test(description);
    });
    const healthEntries = await Promise.all(helperCandidates.map(async (brain) => ({
      brain,
      health: await getProviderEndpointHealth(brain)
    })));
    return healthEntries.filter((entry) => entry.health?.running).map((entry) => entry.brain);
  }

  async function getQueueLaneLoadSnapshot() {
    const counts = new Map();
    const record = async (task = {}) => {
      const lane = String(task?.queueLane || "").trim() || getBrainQueueLane(await getBrain(task?.requestedBrainId || "worker"));
      if (lane) {
        counts.set(lane, Number(counts.get(lane) || 0) + 1);
      }
    };
    const { queued, inProgress, waiting } = await listAllTasks();
    for (const task of [...queued, ...inProgress, ...waiting]) {
      await record(task);
    }
    return counts;
  }

  async function chooseHealthyRemoteTriageBrain({ availableBrains = null, laneLoad = null } = {}) {
    const routing = getRoutingConfig();
    const brains = Array.isArray(availableBrains) ? availableBrains : await listAvailableBrains();
    const queueLaneLoad = laneLoad instanceof Map ? laneLoad : await getQueueLaneLoadSnapshot();
    const healthyRoutingHelpers = await listHealthyRoutingHelpers();
    const configuredPlanner = routing.remoteTriageBrainId ? brains.find((brain) => brain.id === routing.remoteTriageBrainId) : null;
    const candidates = [configuredPlanner, ...healthyRoutingHelpers].filter(Boolean).filter((brain) => brain.remote === true);
    return candidates.sort((left, right) => {
      const leftLoad = Number(queueLaneLoad.get(getBrainQueueLane(left)) || 0);
      const rightLoad = Number(queueLaneLoad.get(getBrainQueueLane(right)) || 0);
      if (leftLoad !== rightLoad) return leftLoad - rightLoad;
      const leftConfigured = left.id === String(routing.remoteTriageBrainId || "").trim() ? 1 : 0;
      const rightConfigured = right.id === String(routing.remoteTriageBrainId || "").trim() ? 1 : 0;
      if (leftConfigured !== rightConfigured) return rightConfigured - leftConfigured;
      return String(left.id || "").localeCompare(String(right.id || ""));
    })[0] || null;
  }

  async function getHealthyWorkerLaneIds() {
    const workers = await listHealthyToolWorkers();
    return [...new Set(workers.map((brain) => String(brain.queueLane || getBrainQueueLane(brain)).trim()).filter(Boolean))];
  }

  async function isRemoteParallelDispatchEnabled() {
    const queueConfig = getQueueConfig();
    const routing = getRoutingConfig();
    if (!queueConfig.remoteParallel || !routing.enabled) {
      return false;
    }
    const remoteTriageBrain = await chooseHealthyRemoteTriageBrain();
    return remoteTriageBrain?.remote === true;
  }

  async function getTotalBackgroundExecutionCapacity() {
    const queueConfig = getQueueConfig();
    if (!(await isRemoteParallelDispatchEnabled())) {
      return 1;
    }
    const laneIds = await getHealthyWorkerLaneIds();
    return Math.max(1, Math.min(queueConfig.remoteParallel ? (laneIds.length || 1) : 1, 6));
  }

  async function getIdleBackgroundExecutionCapacity() {
    return getTotalBackgroundExecutionCapacity();
  }

  async function buildBrainActivitySnapshot() {
    if (Date.now() - Number(brainActivitySnapshotCache.at || 0) < 2000 && brainActivitySnapshotCache.snapshot) {
      return brainActivitySnapshotCache.snapshot;
    }
    const brains = await listAvailableBrains();
    const { queued, waiting, inProgress, done, failed } = await listAllTasks();
    const now = Date.now();
    const queuedByBrain = groupTasksByBrainId(queued);
    const waitingByBrain = groupTasksByBrainId(waiting);
    const inProgressByBrain = groupTasksByBrainId(inProgress);
    const doneByBrain = groupTasksByBrainId(done);
    const failedByBrain = groupTasksByBrainId(failed);
    const snapshot = await Promise.all(brains.map(async (brain) => {
      const brainId = String(brain.id || "");
      const queueLane = String(brain.queueLane || getBrainQueueLane(brain)).trim();
      const brainQueued = queuedByBrain.get(brainId) || [];
      const brainWaiting = waitingByBrain.get(brainId) || [];
      const brainInProgress = inProgressByBrain.get(brainId) || [];
      const brainDone = doneByBrain.get(brainId) || [];
      const brainFailed = failedByBrain.get(brainId) || [];
      const brainTasks = [...brainQueued, ...brainWaiting, ...brainInProgress, ...brainDone, ...brainFailed];
      const activeTask = brainInProgress[0];
      const lastActivityTs = brainTasks.reduce((best, task) =>
        Math.max(best, Number(task.completedAt || task.updatedAt || task.startedAt || task.createdAt || 0)), 0);
      const endpointHealthy = brain.ollamaBaseUrl ? (await getProviderEndpointHealth(brain))?.running === true : true;
      const timedTasks = brainDone
        .filter((task) => Number(task.startedAt || 0) > 0 && Number(task.completedAt || 0) > 0)
        .map((task) => Number(task.completedAt) - Number(task.startedAt))
        .filter((ms) => ms > 0);
      const avgRequestMs = timedTasks.length ? Math.round(timedTasks.reduce((sum, ms) => sum + ms, 0) / timedTasks.length) : 0;
      return {
        id: brain.id,
        label: brain.label,
        kind: brain.kind,
        model: brain.model,
        endpointId: brain.endpointId || "local",
        queueLane,
        remote: brain.remote === true,
        active: Boolean(activeTask),
        activeTaskId: String(activeTask?.id || ""),
        activeTaskCodename: String(activeTask?.codename || ""),
        queuedCount: brainQueued.length,
        waitingCount: brainWaiting.length,
        inProgressCount: brainInProgress.length,
        completedCount: brainDone.length,
        failedCount: brainFailed.length,
        lastActivityAt: lastActivityTs || 0,
        idleForMs: lastActivityTs ? Math.max(0, now - lastActivityTs) : 0,
        avgRequestMs,
        avgRequestSampleCount: timedTasks.length,
        endpointHealthy
      };
    }));
    brainActivitySnapshotCache = { at: Date.now(), snapshot };
    return snapshot;
  }

  async function countIdleBackgroundWorkerBrains() {
    const snapshot = await buildBrainActivitySnapshot();
    return snapshot.filter((entry) => entry.kind === "worker" && entry.endpointHealthy && !entry.active && !entry.queuedCount && !entry.waitingCount && !!entry.queueLane).length;
  }

  async function countIdleHelperBrains() {
    const snapshot = await buildBrainActivitySnapshot();
    return snapshot.filter((entry) =>
      entry.kind === "helper" && isGenerativeHelperBrain(entry) && isCpuQueueLane(entry) && entry.endpointHealthy && !entry.active && !entry.queuedCount && !entry.waitingCount && !!entry.queueLane
    ).length;
  }

  async function listIdleHelperBrains(limit = 4) {
    const brains = await listAvailableBrains();
    const snapshot = await buildBrainActivitySnapshot();
    const snapshotById = new Map(snapshot.map((entry) => [String(entry.id || ""), entry]));
    return brains
      .filter((brain) => brain.kind === "helper" && isGenerativeHelperBrain(brain) && isCpuQueueLane(brain))
      .map((brain) => ({ brain, activity: snapshotById.get(String(brain.id || "")) || {} }))
      .filter((entry) =>
        entry.activity.endpointHealthy !== false
        && !entry.activity.active
        && !Number(entry.activity.queuedCount || 0)
        && !Number(entry.activity.waitingCount || 0)
        && String(entry.brain.queueLane || getBrainQueueLane(entry.brain)).trim()
      )
      .sort((left, right) => Number(right.activity.idleForMs || 0) - Number(left.activity.idleForMs || 0))
      .slice(0, Math.max(1, Number(limit || 1)))
      .map((entry) => entry.brain);
  }

  async function chooseDedicatedHelperScoutBrain() {
    const idleHelpers = await listIdleHelperBrains(6);
    for (const brainId of ["lappy_cpu"]) {
      const matched = idleHelpers.find((brain) => String(brain.id || "").trim() === brainId);
      if (matched) {
        return matched;
      }
    }
    return idleHelpers[0] || null;
  }

  function scoreHelperReservePriority(brain = {}) {
    const id = String(brain.id || "").trim().toLowerCase();
    const specialty = String(brain.specialty || "").trim().toLowerCase();
    const description = String(brain.description || "").trim().toLowerCase();
    let score = 0;
    if (id === "remote_cpu") score += 1000;
    if (specialty === "routing" || specialty === "general") score += 100;
    if (/\b(route|routing|triage|planner|planning|classification)\b/.test(description)) score += 20;
    return score;
  }

  async function chooseHelperScoutBrains(limit = 4) {
    const idleHelpers = await listIdleHelperBrains(8);
    if (!idleHelpers.length) {
      return [];
    }
    const reserveIds = new Set(
      idleHelpers
        .slice()
        .sort((left, right) => {
          const scoreDiff = scoreHelperReservePriority(right) - scoreHelperReservePriority(left);
          return scoreDiff || String(left.id || "").localeCompare(String(right.id || ""));
        })
        .slice(0, Math.max(0, helperIdleReserveCount))
        .map((brain) => String(brain.id || "").trim())
        .filter(Boolean)
    );
    return idleHelpers
      .filter((brain) => !reserveIds.has(String(brain.id || "").trim()))
      .sort((left, right) => {
        const preferredLeft = String(left.id || "").trim() === "lappy_cpu" ? 1 : 0;
        const preferredRight = String(right.id || "").trim() === "lappy_cpu" ? 1 : 0;
        return preferredRight - preferredLeft || String(left.id || "").localeCompare(String(right.id || ""));
      })
      .slice(0, Math.max(0, Number(limit || 0)));
  }

  function scoreBrainForSpecialty(brain = {}, specialty = "general") {
    const normalizedSpecialty = String(specialty || "general").trim().toLowerCase();
    const brainSpecialty = String(brain?.specialty || "").trim().toLowerCase();
    const normalizedToken = normalizedSpecialty.replace(/[^a-z0-9_-]+/g, "");
    const text = [brain?.id, brain?.label, brain?.model, brain?.description, brainSpecialty]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    let score = 0;
    if (brainSpecialty === normalizedSpecialty) score += 100;
    if (brainSpecialty === "general") score += 20;
    if (normalizedSpecialty === "general" && brainSpecialty !== "retrieval") score += 10;
    if (normalizedToken && new RegExp(`\\b${normalizedToken}\\b`, "i").test(text)) score += 20;
    return score;
  }

  function canBrainHandleSpecialty(brain = {}, specialty = "general") {
    const normalizedSpecialty = String(specialty || "general").trim().toLowerCase();
    if (!normalizedSpecialty || normalizedSpecialty === "general") {
      return true;
    }
    const text = [brain?.specialty, brain?.description, brain?.label, brain?.id].map((value) => String(value || "").toLowerCase()).join(" ");
    return text.includes(normalizedSpecialty) || String(brain?.specialty || "").trim().toLowerCase() === "general";
  }

  async function chooseIdleWorkerBrainForSpecialty(specialty = "general") {
    const availableBrains = await listAvailableBrains();
    const snapshot = await buildBrainActivitySnapshot();
    const snapshotById = new Map(snapshot.map((entry) => [String(entry.id || ""), entry]));
    const ranked = availableBrains
      .filter((brain) => brain.kind === "worker" && brain.toolCapable && canBrainHandleSpecialty(brain, specialty))
      .map((brain) => {
        const activity = snapshotById.get(String(brain.id || "")) || {};
        return {
          brain,
          activity,
          score: scoreBrainForSpecialty(brain, specialty),
          idle: !activity.active && !Number(activity.queuedCount || 0) && activity.endpointHealthy !== false,
          idleForMs: Number(activity.idleForMs || 0)
        };
      })
      .filter((entry) => entry.activity.endpointHealthy !== false)
      .sort((left, right) =>
        Number(Boolean(right.idle)) - Number(Boolean(left.idle))
        || right.score - left.score
        || right.idleForMs - left.idleForMs
        || String(left.brain.id || "").localeCompare(String(right.brain.id || ""))
      );
    return ranked[0]?.brain || null;
  }

  async function chooseIdleWorkerBrainForSpecialtyExcluding(specialty = "general", excludedBrainIds = []) {
    const excluded = new Set((Array.isArray(excludedBrainIds) ? excludedBrainIds : [excludedBrainIds]).map((value) => String(value || "").trim()).filter(Boolean));
    const availableBrains = await listAvailableBrains();
    const snapshot = await buildBrainActivitySnapshot();
    const snapshotById = new Map(snapshot.map((entry) => [String(entry.id || ""), entry]));
    const ranked = availableBrains
      .filter((brain) => brain.kind === "worker" && brain.toolCapable && !excluded.has(String(brain.id || "").trim()) && canBrainHandleSpecialty(brain, specialty))
      .map((brain) => {
        const activity = snapshotById.get(String(brain.id || "")) || {};
        return {
          brain,
          activity,
          score: scoreBrainForSpecialty(brain, specialty),
          idle: !activity.active && !Number(activity.queuedCount || 0) && activity.endpointHealthy !== false,
          idleForMs: Number(activity.idleForMs || 0)
        };
      })
      .filter((entry) => entry.activity.endpointHealthy !== false)
      .sort((left, right) =>
        Number(Boolean(right.idle)) - Number(Boolean(left.idle))
        || right.score - left.score
        || right.idleForMs - left.idleForMs
        || String(left.brain.id || "").localeCompare(String(right.brain.id || ""))
      );
    return ranked[0]?.brain || null;
  }

  async function chooseIdleWorkerBrainForTransportFailover(task = {}, specialty = "general", excludedBrainIds = []) {
    const excluded = new Set((Array.isArray(excludedBrainIds) ? excludedBrainIds : [excludedBrainIds]).map((value) => String(value || "").trim()).filter(Boolean));
    const currentBrain = await getBrain(String(task?.requestedBrainId || "worker").trim() || "worker");
    const currentLane = String(task?.queueLane || currentBrain?.queueLane || getBrainQueueLane(currentBrain)).trim();
    const currentEndpoint = normalizeProviderBaseUrl(String(task?.ollamaBaseUrl || currentBrain?.ollamaBaseUrl || "").trim(), currentBrain?.provider || "ollama");
    const availableBrains = await listAvailableBrains();
    const snapshot = await buildBrainActivitySnapshot();
    const snapshotById = new Map(snapshot.map((entry) => [String(entry.id || ""), entry]));
    const ranked = availableBrains
      .filter((brain) => brain.kind === "worker" && brain.toolCapable && !excluded.has(String(brain.id || "").trim()) && canBrainHandleSpecialty(brain, specialty))
      .map((brain) => {
        const activity = snapshotById.get(String(brain.id || "")) || {};
        const lane = String(brain.queueLane || getBrainQueueLane(brain)).trim();
        const endpoint = normalizeProviderBaseUrl(String(brain.ollamaBaseUrl || "").trim(), brain.provider || "ollama");
        return {
          brain,
          activity,
          score: scoreBrainForSpecialty(brain, specialty),
          idle: !activity.active && !Number(activity.queuedCount || 0) && activity.endpointHealthy !== false,
          idleForMs: Number(activity.idleForMs || 0),
          differentTransport: (!currentLane || lane !== currentLane) || (!currentEndpoint || endpoint !== currentEndpoint)
        };
      })
      .filter((entry) => entry.activity.endpointHealthy !== false && entry.differentTransport)
      .sort((left, right) =>
        Number(Boolean(right.idle)) - Number(Boolean(left.idle))
        || right.score - left.score
        || right.idleForMs - left.idleForMs
        || String(left.brain.id || "").localeCompare(String(right.brain.id || ""))
      );
    return ranked[0]?.brain || null;
  }

  function scorePlannerRepairBrain(brain = {}) {
    const specialty = String(brain?.specialty || "").trim().toLowerCase();
    const description = String(brain?.description || "").trim().toLowerCase();
    const id = String(brain?.id || "").trim().toLowerCase();
    const hasRoutingSignal = specialty === "routing" || specialty === "planner" || /\b(route|routing|router|planner|planning)\b/.test(description);
    const hasToolingSignal = /\b(tooling|tool plan|tool repair|tools)\b/.test(description);
    if (!(hasRoutingSignal && hasToolingSignal)) return 0;
    let score = 100;
    if (specialty === "routing" || specialty === "planner") score += 40;
    if (/\btoolrouter\b/.test(id)) score += 20;
    return score;
  }

  async function choosePlannerRepairBrain(candidateIds = [], { preferRemote = false, fallbackBrainId = "bitnet" } = {}) {
    const availableBrains = await listAvailableBrains();
    const laneLoad = await getQueueLaneLoadSnapshot();
    const explicitBrains = (Array.isArray(candidateIds) ? candidateIds : [])
      .map((candidate) => availableBrains.find((entry) => String(entry?.id || "").trim() === String(candidate || "").trim()) || null)
      .filter(Boolean);
    const remotePlanner = preferRemote ? await chooseHealthyRemoteTriageBrain({ availableBrains, laneLoad }) : null;
    const fallbackBrain = fallbackBrainId
      ? availableBrains.find((entry) => String(entry?.id || "").trim() === String(fallbackBrainId || "").trim()) || null
      : null;
    const candidates = [...explicitBrains, remotePlanner, fallbackBrain]
      .filter(Boolean)
      .filter((brain, index, list) => list.findIndex((entry) => String(entry?.id || "").trim() === String(brain?.id || "").trim()) === index);
    return candidates.sort((left, right) => {
      if (preferRemote && Boolean(right.remote) !== Boolean(left.remote)) {
        return Number(Boolean(right.remote)) - Number(Boolean(left.remote));
      }
      const scoreDiff = scorePlannerRepairBrain(right) - scorePlannerRepairBrain(left);
      if (scoreDiff) return scoreDiff;
      const leftLoad = Number(laneLoad.get(getBrainQueueLane(left)) || 0);
      const rightLoad = Number(laneLoad.get(getBrainQueueLane(right)) || 0);
      return leftLoad - rightLoad || String(left.id || "").localeCompare(String(right.id || ""));
    })[0] || null;
  }

  function scoreIntakePlanningBrain(brain = {}) {
    if (!brain || (String(brain.kind || "").trim() === "worker" && brain.toolCapable !== true)) {
      return 0;
    }
    const kind = String(brain?.kind || "").trim().toLowerCase();
    const specialty = String(brain?.specialty || "").trim().toLowerCase();
    const text = [brain?.id, brain?.label, brain?.model, brain?.description, specialty].map((value) => String(value || "").toLowerCase()).join(" ");
    let score = 0;
    if (kind === "intake") score += 140;
    if (kind === "helper") score += 120;
    if (kind === "worker" && brain.toolCapable === true) score += 40;
    if (specialty === "routing" || specialty === "planner") score += 60;
    if (specialty === "general") score += 30;
    if (/\b(route|routing|router|planner|planning|triage|intake)\b/.test(text)) score += 25;
    if (String(brain?.id || "").trim().toLowerCase() === "bitnet") score += 20;
    if (String(brain?.id || "").trim().toLowerCase() === "helper") score += 10;
    return score;
  }

  async function chooseIntakePlanningBrain({ candidateIds = [], preferRemote = false, fallbackBrainIds = ["bitnet", "helper", "worker"] } = {}) {
    const availableBrains = await listAvailableBrains();
    const laneLoad = await getQueueLaneLoadSnapshot();
    const explicitBrains = (Array.isArray(candidateIds) ? candidateIds : [])
      .map((candidate) => availableBrains.find((entry) => String(entry?.id || "").trim() === String(candidate || "").trim()) || null)
      .filter(Boolean);
    const remotePlanner = preferRemote ? await chooseHealthyRemoteTriageBrain({ availableBrains, laneLoad }) : null;
    const fallbackBrains = (Array.isArray(fallbackBrainIds) ? fallbackBrainIds : [fallbackBrainIds])
      .map((candidate) => availableBrains.find((entry) => String(entry?.id || "").trim() === String(candidate || "").trim()) || null)
      .filter(Boolean);
    const localSurvivalBrain = availableBrains
      .filter((brain) => brain.remote !== true)
      .sort((left, right) => {
        const scoreDiff = scoreIntakePlanningBrain(right) - scoreIntakePlanningBrain(left);
        const leftLoad = Number(laneLoad.get(getBrainQueueLane(left)) || 0);
        const rightLoad = Number(laneLoad.get(getBrainQueueLane(right)) || 0);
        return scoreDiff || leftLoad - rightLoad || String(left.id || "").localeCompare(String(right.id || ""));
      })[0] || null;
    const candidates = [...explicitBrains, remotePlanner, ...fallbackBrains, localSurvivalBrain]
      .filter(Boolean)
      .filter((brain, index, list) => list.findIndex((entry) => String(entry?.id || "").trim() === String(brain?.id || "").trim()) === index);
    return candidates.sort((left, right) => {
      if (preferRemote && Boolean(right.remote) !== Boolean(left.remote)) {
        return Number(Boolean(right.remote)) - Number(Boolean(left.remote));
      }
      const scoreDiff = scoreIntakePlanningBrain(right) - scoreIntakePlanningBrain(left);
      const leftLoad = Number(laneLoad.get(getBrainQueueLane(left)) || 0);
      const rightLoad = Number(laneLoad.get(getBrainQueueLane(right)) || 0);
      return scoreDiff || leftLoad - rightLoad || String(left.id || "").localeCompare(String(right.id || ""));
    })[0] || null;
  }

  async function warmRuntimeBrains() {
    if (brainWarmInFlight) {
      return;
    }
    brainWarmInFlight = true;
    try {
      const intakeBrain = await chooseIntakePlanningBrain() || await getBrain("bitnet");
      const workerBrain = await getBrain("worker");
      for (const warmup of [
        { brain: intakeBrain, prompt: "READY", options: { ...(intakeBrain.numGpu != null ? { num_gpu: intakeBrain.numGpu } : {}), temperature: 0, top_k: 1, num_predict: 1 } },
        { brain: workerBrain, prompt: "READY", options: { temperature: 0, top_k: 1, num_predict: 1 } }
      ]) {
        const result = await runOllamaGenerate(warmup.brain.model, warmup.prompt, {
          timeoutMs: 180000,
          keepAlive: modelKeepAlive,
          options: warmup.options,
          baseUrl: warmup.brain.ollamaBaseUrl,
          provider: warmup.brain.provider,
          apiKeyEnv: warmup.brain.apiKeyEnv,
          brainId: warmup.brain.id,
          leaseOwnerId: `warmup:${String(warmup.brain.id || warmup.brain.model || "brain").trim()}`,
          leaseWaitMs: 1000
        });
        if (!result.ok) {
          broadcast(`[observer] unable to warm ${warmup.brain.label}: ${result.stderr || "unknown error"}`);
        }
      }
    } finally {
      brainWarmInFlight = false;
    }
  }

  function cosineSimilarity(left = [], right = []) {
    if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) {
      return 0;
    }
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
      const a = Number(left[index] || 0);
      const b = Number(right[index] || 0);
      dot += a * b;
      leftNorm += a * a;
      rightNorm += b * b;
    }
    return !leftNorm || !rightNorm ? 0 : dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  }

  function getAgentPersonaName() {
    return String(getObserverConfig()?.app?.botName || "Agent").trim() || "Agent";
  }

  function buildHelperCacheKey({ message = "", sessionId = "Main" } = {}) {
    return `helper:${crypto.createHash("sha1").update(`${String(sessionId || "Main").trim()}\n${String(message || "").trim()}`).digest("hex")}`;
  }

  function pruneHelperShadowCache() {
    const now = Date.now();
    for (const [key, entry] of helperShadowCache.entries()) {
      const expiresAt = Number(entry?.expiresAt || 0);
      if (!expiresAt || expiresAt <= now || (!helperShadowCacheEnabled && entry?.state === "done")) {
        helperShadowCache.delete(key);
      }
    }
  }

  function shouldUseHelperAnalysis(message = "") {
    const text = String(message || "").trim();
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean).length;
    return hasThinkingAnalysisBrainConfigured()
      && !!text
      && (
        text.length >= 180
        || words >= 32
        || isCapabilityCheckRequest(text)
        || (lower.match(/\band\b/g) || []).length >= 2
        || (/[.;:\n]/.test(text) && words >= 18)
      );
  }

  async function runHelperAnalysis({ message = "", sessionId = "Main" } = {}) {
    const helperBrain = await chooseThinkingAnalysisBrain();
    if (!helperBrain) {
      return null;
    }
    const prompt = [
      "You are a silent helper model for Nova.",
      `Nova's public name is ${getAgentPersonaName()}.`,
      "Analyze the user request and return JSON only.",
      "Do not mention internal routing or models.",
      "Return this schema exactly:",
      "{\"summary\":\"...\",\"intent\":\"...\",\"suggested_action\":\"reply_only|intake_tool|enqueue_worker\",\"draft_reply\":\"...\",\"confidence\":0.0,\"reasons\":[\"...\"]}",
      "Keep summary and draft_reply concise.",
      "Choose enqueue_worker only when deeper execution or follow-through is genuinely needed.",
      `Session: ${String(sessionId || "Main").trim() || "Main"}`,
      `User request: ${String(message || "").trim()}`
    ].join("\n");
    const result = await runOllamaJsonGenerate(helperBrain.model, prompt, {
      timeoutMs: helperAnalysisTimeoutMs,
      keepAlive: modelKeepAlive,
      baseUrl: helperBrain.ollamaBaseUrl,
      provider: helperBrain.provider,
      apiKeyEnv: helperBrain.apiKeyEnv,
      brainId: helperBrain.id,
      leaseOwnerId: `helper-analysis:${String(sessionId || "Main").trim() || "Main"}`,
      leaseWaitMs: Math.min(Number(helperAnalysisTimeoutMs || 0), 500)
    });
    if (!result.ok) {
      return null;
    }
    let parsed;
    try {
      parsed = extractJsonObject(result.text);
    } catch {
      return null;
    }
    return {
      model: helperBrain.model,
      at: Date.now(),
      summary: compactTaskText(String(parsed.summary || "").trim(), 220),
      intent: compactTaskText(String(parsed.intent || "").trim(), 80),
      suggestedAction: ["reply_only", "intake_tool", "enqueue_worker"].includes(String(parsed.suggested_action || "")) ? String(parsed.suggested_action) : "reply_only",
      draftReply: compactTaskText(normalizeAgentSelfReference(String(parsed.draft_reply || "").trim()), 280),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0) || 0)),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((entry) => compactTaskText(String(entry || "").trim(), 120)).filter(Boolean).slice(0, 4)
        : []
    };
  }

  function startHelperAnalysisForRequest({ message = "", sessionId = "Main" } = {}) {
    if (!shouldUseHelperAnalysis(message)) {
      return null;
    }
    pruneHelperShadowCache();
    const key = buildHelperCacheKey({ message, sessionId });
    const cached = helperShadowCache.get(key);
    if (helperShadowCacheEnabled && cached?.state === "done" && cached.value) {
      return Promise.resolve(cached.value);
    }
    if (cached?.state === "pending" && cached.promise) {
      return cached.promise;
    }
    const promise = runHelperAnalysis({ message, sessionId })
      .then(async (value) => {
        if (value) {
          await attachHelperAnalysisToRelatedTasks({ message, sessionId, helperAnalysis: value });
          if (helperShadowCacheEnabled) {
            helperShadowCache.set(key, {
              state: "done",
              value,
              createdAt: Date.now(),
              expiresAt: Date.now() + helperAnalysisCacheTtlMs
            });
          } else {
            helperShadowCache.delete(key);
          }
        } else {
          helperShadowCache.delete(key);
        }
        return value;
      })
      .catch(() => {
        helperShadowCache.delete(key);
        return null;
      });
    helperShadowCache.set(key, {
      state: "pending",
      promise,
      createdAt: Date.now(),
      expiresAt: Date.now() + helperAnalysisCacheTtlMs
    });
    return promise;
  }

  async function getHelperAnalysisForRequest({ message = "", sessionId = "Main", waitMs: helperWaitMs = 0 } = {}) {
    if (!shouldUseHelperAnalysis(message)) {
      return null;
    }
    pruneHelperShadowCache();
    const key = buildHelperCacheKey({ message, sessionId });
    const cached = helperShadowCache.get(key);
    if (helperShadowCacheEnabled && cached?.state === "done" && cached.value) {
      return cached.value;
    }
    if (cached?.state === "pending" && cached.promise) {
      if (helperWaitMs > 0) {
        return Promise.race([cached.promise, new Promise((resolve) => setTimeout(() => resolve(null), helperWaitMs))]);
      }
      return null;
    }
    const promise = startHelperAnalysisForRequest({ message, sessionId });
    if (!promise || helperWaitMs <= 0) {
      return null;
    }
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), helperWaitMs))]);
  }

  return {
    buildBrainActivitySnapshot,
    buildBrainConfigPayload,
    canBrainHandleSpecialty,
    chooseDedicatedHelperScoutBrain,
    chooseHealthyRemoteTriageBrain,
    chooseHelperScoutBrains,
    chooseIdleWorkerBrainForSpecialty,
    chooseIdleWorkerBrainForSpecialtyExcluding,
    chooseIdleWorkerBrainForTransportFailover,
    chooseIntakePlanningBrain,
    choosePlannerRepairBrain,
    clearOllamaEndpointTransportFailure,
    cosineSimilarity,
    countIdleBackgroundWorkerBrains,
    countIdleHelperBrains,
    decorateBrain,
    findBrainByIdExact,
    formatOllamaTransportError,
    getAgentPersonaName,
    getBrain,
    getBrainEndpointForId,
    getBrainQueueLane,
    getConfiguredBrainEndpoints,
    getEnabledBrainIds,
    getHelperAnalysisForRequest,
    getIdleBackgroundExecutionCapacity,
    getOllamaEndpointHealth,
    getOllamaEndpointTransportCooldown,
    getProviderEndpointHealth,
    getQueueLaneLoadSnapshot,
    getTotalBackgroundExecutionCapacity,
    inspectOllamaEndpoint,
    inspectProviderEndpoint,
    invalidateObserverConfigCaches,
    isCpuQueueLane,
    isGenerativeHelperBrain,
    isRemoteParallelDispatchEnabled,
    isRetriableOllamaTransportError,
    listAvailableBrains,
    listHealthyRoutingHelpers,
    listIdleHelperBrains,
    listHealthyToolWorkers,
    listOllamaModels,
    markOllamaEndpointTransportFailure,
    normalizeOllamaBaseUrl,
    normalizeProviderBaseUrl,
    normalizeProviderId,
    runOllamaEmbed,
    scoreBrainForSpecialty,
    scoreIntakePlanningBrain,
    scorePlannerRepairBrain,
    serializeBrainEndpointConfig,
    serializeBuiltInBrainConfig,
    serializeCustomBrainConfig,
    startHelperAnalysisForRequest,
    toBrainLabel,
    waitMs,
    warmRuntimeBrains
  };
}
