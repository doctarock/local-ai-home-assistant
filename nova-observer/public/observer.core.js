var observerApp = window.ObserverApp || (window.ObserverApp = {});

const appTitleEl = document.getElementById("appTitle");
const avatarCanvasEl = document.getElementById("avatarCanvas");
const panelDrawerEl = document.getElementById("panelDrawer");
const tabBarEl = panelDrawerEl?.querySelector(".tab-bar") || null;
const panelToggleBtn = document.getElementById("panelToggleBtn");
const panelToggleIconEl = document.getElementById("panelToggleIcon");
const panelCloseBtn = document.getElementById("panelCloseBtn");
const logsEl = document.getElementById("logs");
const resultEl = document.getElementById("result");
const payloadsEl = document.getElementById("payloads");
const runBtn = document.getElementById("runBtn");
const clearBtn = document.getElementById("clearBtn");
const voiceToggleBtn = document.getElementById("voiceToggleBtn");
const voiceTrustEl = document.getElementById("voiceTrust");
const voiceStatusEl = document.getElementById("voiceStatus");
const voiceMetaEl = document.getElementById("voiceMeta");
const refreshBtn = document.getElementById("refreshBtn");
const resetEventHistoryBtn = document.getElementById("resetEventHistoryBtn");
const fileInputEl = document.getElementById("fileInput");
const attachmentListEl = document.getElementById("attachmentList");
const gatewayStatusEl = document.getElementById("gatewayStatus");
const ollamaStatusEl = document.getElementById("ollamaStatus");
const qdrantStatusEl = document.getElementById("qdrantStatus");
const qdrantDetailsEl = document.getElementById("qdrantDetails");
const gpuStatusEl = document.getElementById("gpuStatus");
const checkedAtEl = document.getElementById("checkedAt");
const remoteBrainStatusEl = document.getElementById("remoteBrainStatus");
const brainLoadStatusEl = document.getElementById("brainLoadStatus");
const queueHandoffEl = document.getElementById("queueHandoff");
const refreshQueueBtn = document.getElementById("refreshQueueBtn");
const questionTimeBtn = document.getElementById("questionTimeBtn");
const dispatchNextBtn = document.getElementById("dispatchNextBtn");
const queueSummaryEl = document.getElementById("queueSummary");
const taskReshapeIssuesSummaryEl = document.getElementById("taskReshapeIssuesSummary");
const taskReshapeIssuesListEl = document.getElementById("taskReshapeIssuesList");
const resetTaskReshapeIssuesBtn = document.getElementById("resetTaskReshapeIssuesBtn");
const taskRepairMonitorSummaryEl = document.getElementById("taskRepairMonitorSummary");
const taskRepairActiveEl = document.getElementById("taskRepairActive");
const taskRepairReviewsEl = document.getElementById("taskRepairReviews");
const taskRepairRecentEl = document.getElementById("taskRepairRecent");
const taskQueueQueuedEl = document.getElementById("taskQueueQueued");
const taskQueueWaitingEl = document.getElementById("taskQueueWaiting");
const taskQueueInProgressEl = document.getElementById("taskQueueInProgress");
const taskQueueDoneEl = document.getElementById("taskQueueDone");
const taskQueueFailedEl = document.getElementById("taskQueueFailed");
const taskQueueQueuedCountEl = document.getElementById("taskQueueQueuedCount");
const novaQuestionsCountEl = document.getElementById("novaQuestionsCount");
const taskQueueInProgressCountEl = document.getElementById("taskQueueInProgressCount");
const taskQueueDoneCountEl = document.getElementById("taskQueueDoneCount");
const taskQueueFailedCountEl = document.getElementById("taskQueueFailedCount");
const taskQueueRepairsCountEl = document.getElementById("taskQueueRepairsCount");
const taskQueueIssuesCountEl = document.getElementById("taskQueueIssuesCount");
const queueSubtabButtons = Array.from(document.querySelectorAll("[data-queue-subtab-target]"));
const queueSubtabPanels = Array.from(document.querySelectorAll(".queue-panel"));
const taskFilesListEl = document.getElementById("taskFilesList");
const taskFileContentEl = document.getElementById("taskFileContent");
const stateFileBrowserEl = document.getElementById("stateFileBrowser");
const stateTaskFilesBrowserEl = document.getElementById("stateTaskFilesBrowser");
const runStatusEl = document.getElementById("runStatus");
const runBrainEl = document.getElementById("runBrain");
const runModelEl = document.getElementById("runModel");
const runDurationEl = document.getElementById("runDuration");
const hintEl = document.getElementById("hint");
const cronBrainSelectEl = document.getElementById("cronBrainSelect");
const cronNameEl = document.getElementById("cronName");
const cronEveryEl = document.getElementById("cronEvery");
const cronMessageEl = document.getElementById("cronMessage");
const cronAddBtn = document.getElementById("cronAddBtn");
const cronHintEl = document.getElementById("cronHint");
const cronListEl = document.getElementById("cronList");
const jobsQueueStateEl = document.getElementById("jobsQueueState");
const pauseQueueBtn = document.getElementById("pauseQueueBtn");
const resumeQueueBtn = document.getElementById("resumeQueueBtn");
const refreshRegressionBtn = document.getElementById("refreshRegressionBtn");
const runAllRegressionsBtn = document.getElementById("runAllRegressionsBtn");
const regressionHintEl = document.getElementById("regressionHint");
const regressionSuiteListEl = document.getElementById("regressionSuiteList");
const regressionCommandSuiteSelectEl = document.getElementById("regressionCommandSuiteSelect");
const copyRegressionCommandBtn = document.getElementById("copyRegressionCommandBtn");
const regressionCommandHintEl = document.getElementById("regressionCommandHint");
const regressionCommandLineEl = document.getElementById("regressionCommandLine");
const regressionResultsEl = document.getElementById("regressionResults");
const historyListEl = document.getElementById("historyList");
const scopeSelect = document.getElementById("scopeSelect");
const selectedFileEl = document.getElementById("selectedFile");
const reloadFilesBtn = document.getElementById("reloadFilesBtn");
const resetSimpleStateBtn = document.getElementById("resetSimpleStateBtn");
const stateResetHintEl = document.getElementById("stateResetHint");
const fileListEl = document.getElementById("fileList");
const fileContentEl = document.getElementById("fileContent");
const forceToolUseEl = document.getElementById("forceToolUse");
const requireWorkerPreflightEl = document.getElementById("requireWorkerPreflight");
const refreshNovaBtn = document.getElementById("refreshNovaBtn");
const saveNovaBtn = document.getElementById("saveNovaBtn");
const refreshBrainsBtn = document.getElementById("refreshBrainsBtn");
const saveBrainsBtn = document.getElementById("saveBrainsBtn");
const refreshSecretsBtn = document.getElementById("refreshSecretsBtn");
const refreshToolsBtn = document.getElementById("refreshToolsBtn");
const saveToolsBtn = document.getElementById("saveToolsBtn");
const refreshPluginsBtn = document.getElementById("refreshPluginsBtn");
const addBrainEndpointBtn = document.getElementById("addBrainEndpointBtn");
const addCustomBrainBtn = document.getElementById("addCustomBrainBtn");
const novaHintEl = document.getElementById("novaHint");
const brainsHintEl = document.getElementById("brainsHint");
const toolsHintEl = document.getElementById("toolsHint");
const pluginsHintEl = document.getElementById("pluginsHint");
const secretsHintEl = document.getElementById("secretsHint");
const novaIdentitySettingsListEl = document.getElementById("novaIdentitySettingsList");
const novaTrustSettingsListEl = document.getElementById("novaTrustSettingsList");
const secretsOverviewListEl = document.getElementById("secretsOverviewList");
const secretsRetrievalListEl = document.getElementById("secretsRetrievalList");
const secretsCustomListEl = document.getElementById("secretsCustomList");
const brainEndpointsListEl = document.getElementById("brainEndpointsList");
const brainAssignmentsListEl = document.getElementById("brainAssignmentsList");
const customBrainsListEl = document.getElementById("customBrainsList");
const toolCatalogListEl = document.getElementById("toolCatalogList");
const installedSkillsListEl = document.getElementById("installedSkillsList");
const agentSkillsListEl = document.getElementById("agentSkillsList");
const capabilityRequestsListEl = document.getElementById("capabilityRequestsList");
const pluginInventoryListEl = document.getElementById("pluginInventoryList");
const profileSelectionSelectEl = document.getElementById("profileSelectionSelect");
const saveProfileSelectionBtn = document.getElementById("saveProfileSelectionBtn");
const saveProfileRestartBtn = document.getElementById("saveProfileRestartBtn");
const profileSelectionStatusEl = document.getElementById("profileSelectionStatus");
const profileSelectionDetailsEl = document.getElementById("profileSelectionDetails");
const pluginUploadInputEl = document.getElementById("pluginUploadInput");
const pluginUploadAutoRestartEl = document.getElementById("pluginUploadAutoRestart");
const installPluginUploadBtn = document.getElementById("installPluginUploadBtn");
const pluginUploadStatusEl = document.getElementById("pluginUploadStatus");
const pluginUploadResultEl = document.getElementById("pluginUploadResult");
const pluginCapabilityListEl = document.getElementById("pluginCapabilityList");
const pluginRouteListEl = document.getElementById("pluginRouteList");
const pluginDynamicPanelsListEl = document.getElementById("pluginDynamicPanelsList");
const refreshPluginPermissionsBtn = document.getElementById("refreshPluginPermissionsBtn");
const savePluginPermissionsBtn = document.getElementById("savePluginPermissionsBtn");
const pluginPermissionRulesEditorEl = document.getElementById("pluginPermissionRulesEditor");
const pluginPermissionRulesStatusEl = document.getElementById("pluginPermissionRulesStatus");
const refreshPluginTaskLifecycleBtn = document.getElementById("refreshPluginTaskLifecycleBtn");
const pluginTaskLifecycleTaskIdEl = document.getElementById("pluginTaskLifecycleTaskId");
const pluginTaskLifecycleTimeoutMsEl = document.getElementById("pluginTaskLifecycleTimeoutMs");
const pluginTaskLifecycleCreateMessageEl = document.getElementById("pluginTaskLifecycleCreateMessage");
const pluginTaskLifecycleCreateBtn = document.getElementById("pluginTaskLifecycleCreateBtn");
const pluginTaskLifecycleOutputBtn = document.getElementById("pluginTaskLifecycleOutputBtn");
const pluginTaskLifecycleWaitBtn = document.getElementById("pluginTaskLifecycleWaitBtn");
const pluginTaskLifecycleStopBtn = document.getElementById("pluginTaskLifecycleStopBtn");
const pluginTaskLifecycleForceStopEl = document.getElementById("pluginTaskLifecycleForceStop");
const pluginTaskLifecycleAnswerEl = document.getElementById("pluginTaskLifecycleAnswer");
const pluginTaskLifecycleAnswerBtn = document.getElementById("pluginTaskLifecycleAnswerBtn");
const pluginTaskLifecycleStatusEl = document.getElementById("pluginTaskLifecycleStatus");
const pluginTaskLifecycleResultEl = document.getElementById("pluginTaskLifecycleResult");
const refreshPluginSessionMemoryBtn = document.getElementById("refreshPluginSessionMemoryBtn");
const capturePluginSessionMemoryBtn = document.getElementById("capturePluginSessionMemoryBtn");
const pluginSessionTaskIdEl = document.getElementById("pluginSessionTaskId");
const pluginSessionMemoryStatusEl = document.getElementById("pluginSessionMemoryStatus");
const pluginSessionMemoryResultEl = document.getElementById("pluginSessionMemoryResult");
const refreshPluginCronBtn = document.getElementById("refreshPluginCronBtn");
const pluginCronStatusEl = document.getElementById("pluginCronStatus");
const secretsSubtabButtons = Array.from(document.querySelectorAll("[data-secrets-subtab-target]"));
const secretsSubtabPanels = Array.from(document.querySelectorAll(".secrets-subtab-panel"));
const pluginsSubtabButtons = Array.from(document.querySelectorAll("[data-plugins-subtab-target]"));
const pluginsSubtabPanels = Array.from(document.querySelectorAll(".plugins-subtab-panel"));
const capabilitiesSubtabButtons = Array.from(document.querySelectorAll("[data-capabilities-subtab-target]"));
const capabilitiesSubtabPanels = Array.from(document.querySelectorAll(".capabilities-subtab-panel"));
const systemSubtabButtons = Array.from(document.querySelectorAll("[data-system-subtab-target]"));
const systemSubtabPanels = Array.from(document.querySelectorAll(".system-subtab-panel"));
const routingEnabledToggleEl = document.getElementById("routingEnabledToggle");
const remoteParallelToggleEl = document.getElementById("remoteParallelToggle");
const escalationEnabledToggleEl = document.getElementById("escalationEnabledToggle");
const remotePlannerSelectEl = document.getElementById("remotePlannerSelect");
const routingFallbackAttemptsEl = document.getElementById("routingFallbackAttempts");
const routingMapListEl = document.getElementById("routingMapList");
const novaSubtabButtons = Array.from(document.querySelectorAll("[data-nova-subtab-target]"));
const novaSubtabPanels = Array.from(document.querySelectorAll(".nova-subtab-panel"));
const brainSubtabButtons = Array.from(document.querySelectorAll("[data-brain-subtab-target]"));
const brainSubtabPanels = Array.from(document.querySelectorAll(".brain-subtab-panel"));
const internetSummaryEl = document.getElementById("internetSummary");
const networkSummaryTextEl = document.getElementById("networkSummaryText");
const profileSummaryEl = document.getElementById("profileSummary");
const profileSummaryTextEl = document.getElementById("profileSummaryText");
const resultAuditEl = document.getElementById("resultAudit");
const tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
let activeFileKey = "";
let activeUtterance = null;
let pendingUtteranceChunks = [];
let selectedAttachments = [];
let runInFlight = false;
let latestCronEventTs = 0;
let speechCompletionHandler = null;
let updateQueue = [];
let queueDisplayActive = false;
let historyEntries = [];
let queueSequence = 0;
let latestTaskEventTs = 0;
let latestObserverEventSeq = 0;
let queueDispatchInFlight = false;
let latestTaskSnapshot = { queued: [], waiting: [], inProgress: [], done: [], failed: [], repairMonitor: { active: [], reviews: [], recent: [], summary: {} } };
let activeTaskFilePath = "";
let activeQueueSubtabId = "taskQueueQueuedPanel";
let activeSystemSubtabId = "systemGatewayPanel";
let knownVoices = [];
let speechUnlocked = false;
let speechRecognition = null;
let speechRecognitionSupported = false;
let voiceListeningEnabled = false;
let voiceWakeActive = false;
let voiceFinalBuffer = "";
let voiceInterimBuffer = "";
let voiceRestartTimer = null;
let voiceStopRequested = false;
let voicePausedForTts = false;
let wakeAudioContext = null;
let voiceLastTranscript = "";
let voiceLastError = "";
let voiceSubmissionCooldownUntil = 0;
let voiceMicStream = null;
let voiceMicAudioContext = null;
let voiceMicSourceNode = null;
let voiceMicAnalyserNode = null;
let voiceMicSampleTimer = null;
let voiceMicSetupPromise = null;
let voiceFingerprintFrames = [];
let latestVoiceFingerprint = [];
let latestVoiceSourceIdentity = null;
let trustedVoiceGraceIdentity = null;
let trustedVoiceGraceUntil = 0;
let voiceCaptureSession = null;
let voiceCommandCaptureStartedAt = 0;
let voiceTranscriptSegmentStartedAt = 0;
let pendingSubmissionPrompts = [];
const MAX_PENDING_SUBMISSION_PROMPTS = 8;
let pendingVoiceQuestionTaskId = "";
let pendingVoiceQuestionText = "";
let pendingVoiceQuestionTimer = null;
let pendingVoiceQuestionArmTimer = null;
let pendingVoiceQuestionExpiresAt = 0;
let pendingVoiceQuestionInviteTaskId = "";
let pendingVoiceQuestionInviteText = "";
let pendingVoiceQuestionInviteTimer = null;
let pendingVoiceQuestionInviteExpiresAt = 0;
let voiceQuestionCaptureActive = false;
let questionTimeActive = false;
let activeQuestionTimeTaskId = "";
let pendingImmediateVoiceQuestionTask = null;
const VOICE_QUESTION_WAKE_TIMEOUT_MS = 15000;
const VOICE_QUESTION_INVITE_TIMEOUT_MS = 30000;
const waitingQuestionAnswerDrafts = new Map();
let brainConfigDraft = null;
let lastBrainActivity = [];
let toolConfigDraft = null;
let novaConfigDraft = null;
let secretsCatalogDraft = null;
let activeNovaSubtabId = "novaIdentityPanel";
let activeSecretsSubtabId = "secretsOverviewPanel";
let activePluginsSubtabId = "pluginsInventoryPanel";
let activeCapabilitiesSubtabId = "capabilitiesToolsPanel";
const seenTaskEventKeys = new Set();
const announcedTaskHeartbeatTs = new Map();
let runtimeOptions = { app: { botName: "Agent", avatarModelPath: "/assets/characters/Nova.glb", backgroundImagePath: "", stylizationFilterPreset: "none", stylizationEffectPreset: "none", roomTextures: {}, propSlots: {}, voicePreferences: [], trust: { emailCommandMinLevel: "trusted", voiceCommandMinLevel: "trusted", records: [], emailSources: [], voiceProfiles: [], phoneSources: [] } }, language: {}, lexicon: {}, defaults: { internetEnabled: true, mountIds: [] }, mounts: [], networks: {}, brains: [] };
let uiSecuritySession = { lockEnabled: false, unlocked: true, inactivityMs: 30 * 60 * 1000, voiceProfileCount: 0 };
let uiSecurityLastActivityAt = Date.now();
let uiSecurityRelockTimer = null;
const uiSecurityClientSessionId = `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const SETTINGS_KEY = "novaObserverAccess";
const CRON_CURSOR_KEY = "novaObserverLatestCronEventTs";
const TASK_CURSOR_KEY = "novaObserverLatestTaskEventTs";
const DEFAULT_PRESET = "autonomous";
const DEFAULT_INTAKE_BRAIN_ID = "bitnet";
const PANEL_OPEN_KEY = "novaObserverPanelOpen";
const PANEL_FULLSCREEN_KEY = "novaObserverPanelFullscreen";
const VOICE_SUBMISSION_COOLDOWN_MS = 3200;
const VOICE_RESTART_AFTER_SUBMIT_MS = 1400;

function setQuestionTimeActive(value) {
  questionTimeActive = value === true;
  if (!questionTimeActive) {
    activeQuestionTimeTaskId = "";
  }
}

function setActiveQuestionTimeTaskId(taskId = "") {
  activeQuestionTimeTaskId = String(taskId || "").trim();
}

function getIntakeBrain() {
  const configuredId = String(runtimeOptions?.defaults?.intakeBrainId || DEFAULT_INTAKE_BRAIN_ID);
  return (runtimeOptions.brains || []).find((brain) => brain.id === configuredId) || runtimeOptions.brains?.[0] || null;
}

function getBotName() {
  return String(runtimeOptions?.app?.botName || "Agent").trim() || "Agent";
}

function getLanguageString(path, fallback = "") {
  const parts = String(path || "").split(".").filter(Boolean);
  let current = runtimeOptions?.language || {};
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return fallback;
    }
    current = current[part];
  }
  return current == null ? fallback : current;
}

function getLexiconValue(key, fallback = "") {
  if (!key) {
    return fallback;
  }
  const value = runtimeOptions?.lexicon?.[key];
  return value == null ? fallback : value;
}

function pickLexiconVariant(key, fallback = "") {
  const value = getLexiconValue(key, fallback);
  if (Array.isArray(value)) {
    const variants = value.map((entry) => String(entry || "")).filter(Boolean);
    if (variants.length) {
      return variants[Math.floor(Math.random() * variants.length)];
    }
  }
  return String(value || fallback || "");
}

function renderLanguageString(path, fallback, replacements = {}) {
  const template = String(path ? getLanguageString(path, fallback) : fallback);
  let rendered = template;
  for (let depth = 0; depth < 4; depth += 1) {
    const next = rendered.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(replacements, key)) {
        return String(replacements[key] ?? "");
      }
      return pickLexiconVariant(key, "");
    });
    if (next === rendered) {
      break;
    }
    rendered = next;
  }
  return rendered;
}

function getLanguageVariants(path, fallback = [], replacements = {}) {
  const raw = getLanguageString(path, fallback);
  const list = Array.isArray(raw) ? raw : fallback;
  return list.map((entry) => renderLanguageString("", String(entry || ""), replacements));
}

function pickLanguageVariant(path, fallback, replacements = {}) {
  const raw = getLanguageString(path, fallback);
  if (Array.isArray(raw)) {
    const variants = raw
      .map((entry) => renderLanguageString("", String(entry || ""), replacements))
      .filter(Boolean);
    if (variants.length) {
      return variants[Math.floor(Math.random() * variants.length)];
    }
  }
  return renderLanguageString(path, String(fallback || ""), replacements);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWakePhrase() {
  const identityName = String(runtimeOptions?.app?.identityName || "").trim();
  return (identityName || getBotName()).toLowerCase();
}

function getWakeDisplayName() {
  return String(runtimeOptions?.app?.identityName || "").trim() || getBotName();
}

function getStopPhrase() {
  return "thank you";
}

function getStopPhraseVariants() {
  return [...new Set([
    normalizeVoiceText(getStopPhrase())
  ].filter(Boolean))];
}

function getUnlockPhrase() {
  return `hello ${getWakeDisplayName()}`;
}

function getLockPhrase() {
  return `goodbye ${getWakeDisplayName()}`;
}

function setVoiceStatus(html) {
  voiceStatusEl.innerHTML = html;
}

function setVoiceMeta(text) {
  voiceMetaEl.textContent = text;
}

function normalizeVoiceText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTrustLevel(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "trusted" || normalized === "known" || normalized === "unknown") {
    return normalized;
  }
  return fallback;
}

function getTrustLevelRank(value) {
  const normalized = normalizeTrustLevel(value);
  if (normalized === "trusted") return 2;
  if (normalized === "known") return 1;
  return 0;
}

function trustLevelLabel(value) {
  const normalized = normalizeTrustLevel(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isTrustLevelAtLeast(value, minimum) {
  return getTrustLevelRank(value) >= getTrustLevelRank(minimum);
}

function loadEventCursor(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const now = Date.now();
      localStorage.setItem(key, String(now));
      return now;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : Date.now();
  } catch {
    return Date.now();
  }
}

function saveEventCursor(key, value) {
  const ts = Number(value || 0);
  if (!Number.isFinite(ts) || ts <= 0) {
    return;
  }
  try {
    localStorage.setItem(key, String(ts));
  } catch {
    // ignore storage failures
  }
}

latestCronEventTs = loadEventCursor(CRON_CURSOR_KEY);
latestTaskEventTs = loadEventCursor(TASK_CURSOR_KEY);

const CORE_VOICE_NAVIGATION_SCROLL_AMOUNT = 520;

function coreVoiceEscapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeVoiceNavigationLabel(value) {
  return normalizeVoiceText(value)
    .replace(/\b(the ui|ui|interface|observer ui|observer interface)\b/g, " ")
    .replace(/\b(sub tabs|sub tab|subtabs|subtab|tabs|tab|panel|section|page|view)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCoreVoiceNavigationCommandText(value) {
  let normalized = normalizeVoiceText(value);
  for (let depth = 0; depth < 3; depth += 1) {
    const next = normalized
      .replace(/^(?:please|hey|ok|okay|alright)\s+/, "")
      .replace(/^(?:nova|agent)\s+/, "")
      .replace(/^(?:can you|could you|would you|will you|please can you|please could you)\s+/, "")
      .replace(/^(?:i need you to|i want you to|would you please|can we|let us|let's)\s+/, "")
      .trim();
    if (next === normalized) {
      break;
    }
    normalized = next;
  }
  normalized = normalized
    .replace(/^(show|open|go|navigate|switch|change|select|activate|move)\s+me\s+(?:to\s+)?/, "$1 ")
    .replace(/^(navigate|go|move|switch|change|open|show|select|activate)\s+(?:the\s+)?(?:observer\s+)?(?:ui|interface)\s+(?:to\s+)?/, "$1 ")
    .replace(/^(take me)\s+(?:to\s+)?(?:the\s+)?(?:observer\s+)?(?:ui|interface)\s+(?:to\s+)?/, "$1 to ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function getElementVoiceLabel(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.textContent,
    element.id,
    element.dataset?.tabTarget,
    element.dataset?.novaSubtabTarget,
    element.dataset?.brainSubtabTarget,
    element.dataset?.secretsSubtabTarget,
    element.dataset?.pluginsSubtabTarget,
    element.dataset?.capabilitiesSubtabTarget,
    element.dataset?.systemSubtabTarget,
    element.dataset?.queueSubtabTarget
  ].map((entry) => String(entry || "").trim()).filter(Boolean).join(" ");
}

function scoreVoiceNavigationMatch(element, requestedLabel = "") {
  const requested = normalizeVoiceNavigationLabel(requestedLabel);
  const label = normalizeVoiceNavigationLabel(getElementVoiceLabel(element));
  if (!requested || !label) {
    return 0;
  }
  if (label === requested) {
    return 100;
  }
  if (label.includes(requested)) {
    return 80;
  }
  if (requested.includes(label)) {
    return 70;
  }
  const requestedWords = requested.split(" ").filter(Boolean);
  const labelWords = new Set(label.split(" ").filter(Boolean));
  const matched = requestedWords.filter((word) => {
    if (labelWords.has(word)) {
      return true;
    }
    if (word.endsWith("s") && labelWords.has(word.slice(0, -1))) {
      return true;
    }
    return labelWords.has(`${word}s`);
  }).length;
  return matched ? matched * 12 : 0;
}

function findBestVoiceNavigationTarget(elements = [], requestedLabel = "") {
  return elements
    .map((element) => ({ element, score: scoreVoiceNavigationMatch(element, requestedLabel) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.element || null;
}

function getActiveObserverTabPanel() {
  return document.querySelector(".tab-panel.active") || document.querySelector(".tab-panel");
}

function getActiveObserverPanel() {
  const activeTab = getActiveObserverTabPanel();
  if (!activeTab) {
    return panelDrawerEl || document.body;
  }
  const activeNested = activeTab.querySelector([
    ".nova-subtab-panel.active",
    ".brain-subtab-panel.active",
    ".secrets-subtab-panel.active",
    ".plugins-subtab-panel.active",
    ".capabilities-subtab-panel.active",
    ".system-subtab-panel.active",
    ".queue-panel.active"
  ].join(", "));
  return activeNested || activeTab;
}

function getScrollableObserverPanelElement() {
  const candidates = [
    getActiveObserverPanel(),
    panelDrawerEl?.querySelector(".drawer-content"),
    panelDrawerEl,
    document.scrollingElement,
    document.documentElement
  ].filter(Boolean);
  return candidates.find((element) => Number(element.scrollHeight || 0) > Number(element.clientHeight || 0) + 8) || document.scrollingElement || document.documentElement;
}

function getActiveObserverPanelSnapshot({ maxChars = 3600 } = {}) {
  const panel = getActiveObserverPanel();
  const tabButton = document.querySelector("[data-tab-target].active");
  const subtabButton = panelDrawerEl?.querySelector([
    "[data-nova-subtab-target].active",
    "[data-brain-subtab-target].active",
    "[data-secrets-subtab-target].active",
    "[data-plugins-subtab-target].active",
    "[data-capabilities-subtab-target].active",
    "[data-system-subtab-target].active",
    "[data-queue-subtab-target].active"
  ].join(", "));
  const heading = [tabButton, subtabButton]
    .map((element) => String(element?.textContent || element?.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" / ") || "Current panel";
  const text = String(panel?.innerText || panel?.textContent || "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return {
    heading,
    text: text.length > maxChars ? `${text.slice(0, maxChars).trim()}\n\n[panel text truncated]` : text
  };
}

function speakCoreVoiceNavigationText(text = "") {
  const message = String(text || "").trim();
  if (!message) {
    return;
  }
  if (typeof observerApp.presentPayloadSpeech === "function") {
    observerApp.presentPayloadSpeech(message);
    return;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
  }
}

function acknowledgeCoreVoiceNavigation(message = "") {
  const text = String(message || "").trim();
  if (!text) {
    return;
  }
  setVoiceStatus(coreVoiceEscapeHtml(text));
  setVoiceMeta("Core voice navigation handled the command.");
  observerApp.noteUiSecurityActivity?.();
  if (typeof observerApp.enqueueUpdate === "function") {
    observerApp.enqueueUpdate({
      source: "voice",
      title: "Voice navigation",
      displayText: text,
      spokenText: text,
      rawText: text,
      status: "ok",
      brainLabel: "Observer",
      model: "core"
    }, { priority: true });
  } else {
    speakCoreVoiceNavigationText(text);
  }
}

function activateVoiceNavigationSubtab(button) {
  if (!(button instanceof HTMLElement)) {
    return false;
  }
  if (button.dataset.novaSubtabTarget && typeof observerApp.activateNovaSubtab === "function") {
    observerApp.activateNovaSubtab(button.dataset.novaSubtabTarget);
  } else if (button.dataset.brainSubtabTarget && typeof observerApp.activateBrainSubtab === "function") {
    observerApp.activateBrainSubtab(button.dataset.brainSubtabTarget);
  } else if (button.dataset.secretsSubtabTarget && typeof observerApp.activateSecretsSubtab === "function") {
    observerApp.activateSecretsSubtab(button.dataset.secretsSubtabTarget);
  } else if (button.dataset.pluginsSubtabTarget && typeof observerApp.activatePluginsSubtab === "function") {
    observerApp.activatePluginsSubtab(button.dataset.pluginsSubtabTarget);
  } else if (button.dataset.capabilitiesSubtabTarget && typeof observerApp.activateCapabilitiesSubtab === "function") {
    observerApp.activateCapabilitiesSubtab(button.dataset.capabilitiesSubtabTarget);
  } else if (button.dataset.systemSubtabTarget && typeof observerApp.activateSystemSubtab === "function") {
    observerApp.activateSystemSubtab(button.dataset.systemSubtabTarget);
  } else if (button.dataset.queueSubtabTarget && typeof observerApp.activateQueueSubtab === "function") {
    observerApp.activateQueueSubtab(button.dataset.queueSubtabTarget);
  } else {
    button.click();
  }
  return true;
}

function getVoiceNavigationSubtabButtons(root = null) {
  return Array.from((root || getActiveObserverTabPanel() || panelDrawerEl || document).querySelectorAll([
    "[data-nova-subtab-target]",
    "[data-brain-subtab-target]",
    "[data-secrets-subtab-target]",
    "[data-plugins-subtab-target]",
    "[data-capabilities-subtab-target]",
    "[data-system-subtab-target]",
    "[data-queue-subtab-target]"
  ].join(", ")));
}

function handleCoreVoiceNavigationTabCommand(text = "") {
  const normalized = normalizeCoreVoiceNavigationCommandText(text);
  const tabMatch = normalized.match(/^(?:go to|go|open|show|switch to|switch|change to|change|change tabs? to|select|activate|navigate to|navigate|take me to|move to|move)\s+(.+?)(?:\s+tab|\s+panel|\s+section|\s+view)?$/);
  const requested = String(tabMatch ? tabMatch[1] : normalized)
    .replace(/^(?:to|me|the|a|an)\s+/, "")
    .replace(/^(?:me\s+)?(?:to\s+)?(?:the\s+)?/, "")
    .replace(/^(?:observer\s+)?(?:ui|interface)\s+(?:to\s+)?/, "")
    .trim();
  const topTabButton = findBestVoiceNavigationTarget(Array.from(document.querySelectorAll("[data-tab-target]")), requested);
  if (topTabButton?.dataset?.tabTarget) {
    observerApp.activateTab?.(topTabButton.dataset.tabTarget);
    const label = String(topTabButton.getAttribute("aria-label") || topTabButton.textContent || requested).trim();
    const subtabButton = findBestVoiceNavigationTarget(getVoiceNavigationSubtabButtons(getActiveObserverTabPanel()), requested);
    if (subtabButton && activateVoiceNavigationSubtab(subtabButton)) {
      const subtabLabel = String(subtabButton.textContent || "").replace(/\s+/g, " ").trim();
      acknowledgeCoreVoiceNavigation(`Opened ${label}${subtabLabel ? ` / ${subtabLabel}` : ""}.`);
      return { handled: true, text };
    }
    acknowledgeCoreVoiceNavigation(`Opened ${label}.`);
    return { handled: true, text };
  }
  const subtabButton = findBestVoiceNavigationTarget(getVoiceNavigationSubtabButtons(), requested);
  if (subtabButton && activateVoiceNavigationSubtab(subtabButton)) {
    const label = String(subtabButton.textContent || requested).replace(/\s+/g, " ").trim();
    acknowledgeCoreVoiceNavigation(`Opened ${label}.`);
    return { handled: true, text };
  }
  return null;
}

function handleCoreVoiceNavigationScrollCommand(text = "") {
  const normalized = normalizeCoreVoiceNavigationCommandText(text);
  let top = null;
  if (/^(?:scroll|move|page)\s+(?:down|lower)$/.test(normalized) || /^down$/.test(normalized)) {
    top = CORE_VOICE_NAVIGATION_SCROLL_AMOUNT;
  } else if (/^(?:scroll|move|page)\s+(?:up|higher)$/.test(normalized) || /^up$/.test(normalized)) {
    top = -CORE_VOICE_NAVIGATION_SCROLL_AMOUNT;
  } else if (/^(?:scroll|go|jump)\s+to\s+(?:the\s+)?top$/.test(normalized)) {
    const scroller = getScrollableObserverPanelElement();
    scroller.scrollTo({ top: 0, behavior: "smooth" });
    acknowledgeCoreVoiceNavigation("Scrolled to the top.");
    return { handled: true, text };
  } else if (/^(?:scroll|go|jump)\s+to\s+(?:the\s+)?bottom$/.test(normalized)) {
    const scroller = getScrollableObserverPanelElement();
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    acknowledgeCoreVoiceNavigation("Scrolled to the bottom.");
    return { handled: true, text };
  }
  if (top == null) {
    return null;
  }
  getScrollableObserverPanelElement().scrollBy({ top, behavior: "smooth" });
  acknowledgeCoreVoiceNavigation(top > 0 ? "Scrolled down." : "Scrolled up.");
  return { handled: true, text };
}

function handleCoreVoiceNavigationPanelCommand(text = "") {
  const normalized = normalizeCoreVoiceNavigationCommandText(text);
  if (/^(?:full screen|fullscreen|expand|expand panel|expand to full screen|expand the panel|expand the panel to full screen|make(?: it)? full screen|make(?: the)? panel full screen)$/.test(normalized)) {
    observerApp.setPanelOpen?.(true);
    observerApp.setPanelFullscreen?.(true);
    acknowledgeCoreVoiceNavigation("Panel expanded to full screen.");
    return { handled: true, text };
  }
  if (/^(?:exit full screen|leave full screen|normal size|restore panel|shrink panel)$/.test(normalized)) {
    observerApp.setPanelFullscreen?.(false);
    acknowledgeCoreVoiceNavigation("Panel restored.");
    return { handled: true, text };
  }
  if (/^(?:open|show)\s+(?:the\s+)?panel$/.test(normalized)) {
    observerApp.setPanelOpen?.(true);
    acknowledgeCoreVoiceNavigation("Panel opened.");
    return { handled: true, text };
  }
  if (/^(?:close|hide)\s+(?:the\s+)?panel$/.test(normalized)) {
    observerApp.setPanelOpen?.(false);
    acknowledgeCoreVoiceNavigation("Panel hidden.");
    return { handled: true, text };
  }
  return null;
}

function handleCoreVoiceNavigationReadCommand(text = "") {
  const normalized = normalizeCoreVoiceNavigationCommandText(text);
  if (!/^(?:read|summarize|tell me about)\s+(?:this\s+|the\s+|current\s+)?(?:panel|tab|screen|view|section|contents?)$/.test(normalized)) {
    return null;
  }
  const snapshot = getActiveObserverPanelSnapshot({ maxChars: 1200 });
  const spoken = snapshot.text
    ? `${snapshot.heading}. ${snapshot.text.slice(0, 900)}`
    : `${snapshot.heading}. There is no readable panel text right now.`;
  acknowledgeCoreVoiceNavigation(`Reading ${snapshot.heading}.`);
  speakCoreVoiceNavigationText(spoken);
  return { handled: true, text };
}

function handleCoreVoiceNavigationAssessCommand(text = "") {
  const normalized = normalizeCoreVoiceNavigationCommandText(text);
  if (!/^(?:assess|analyze|review|inspect)\s+(?:this\s+|the\s+|current\s+)?(?:panel|tab|screen|view|section|contents?)$/.test(normalized)) {
    return null;
  }
  const snapshot = getActiveObserverPanelSnapshot();
  const prompt = [
    `Assess the current Observer UI panel "${snapshot.heading}".`,
    "Call out the important state, risks, likely next actions, and anything that looks stale or broken.",
    "",
    "Visible panel contents:",
    snapshot.text || "(No readable panel text was available.)"
  ].join("\n");
  setVoiceStatus(`Assessing <strong>${coreVoiceEscapeHtml(snapshot.heading)}</strong>.`);
  setVoiceMeta("Core voice navigation attached the visible panel contents to the request.");
  return {
    handled: false,
    text: prompt,
    metadata: {
      voiceCommand: "assess_panel",
      panelHeading: snapshot.heading
    }
  };
}

function handleCoreVoiceNavigationCommand(text = "") {
  return handleCoreVoiceNavigationPanelCommand(text)
    || handleCoreVoiceNavigationScrollCommand(text)
    || handleCoreVoiceNavigationReadCommand(text)
    || handleCoreVoiceNavigationAssessCommand(text)
    || handleCoreVoiceNavigationTabCommand(text);
}

window.addEventListener("observer:voice:before-submit", (event) => {
  const detail = event?.detail || {};
  const text = String(detail.text || "").trim();
  if (!text || typeof detail.respondWith !== "function") {
    return;
  }
  const result = handleCoreVoiceNavigationCommand(text);
  if (result) {
    detail.respondWith(result);
  }
});

Object.assign(observerApp, {
  getIntakeBrain,
  getBotName,
  getLanguageString,
  getLexiconValue,
  pickLexiconVariant,
  renderLanguageString,
  getLanguageVariants,
  pickLanguageVariant,
  escapeRegExp,
  getWakePhrase,
  getStopPhrase,
  getStopPhraseVariants,
  getUnlockPhrase,
  getLockPhrase,
  setVoiceStatus,
  setVoiceMeta,
  normalizeVoiceText,
  normalizeTrustLevel,
  getTrustLevelRank,
  trustLevelLabel,
  isTrustLevelAtLeast,
  handleCoreVoiceNavigationCommand,
  getActiveObserverPanelSnapshot,
  loadEventCursor,
  saveEventCursor
});
