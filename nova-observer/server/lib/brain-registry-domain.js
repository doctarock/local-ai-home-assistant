function normalizeModelName(model = "") {
  return String(model || "").replace(/^ollama\//, "");
}

export function toBrainLabel(modelName = "") {
  return String(modelName || "")
    .split(/[:/-]/)
    .filter(Boolean)
    .map((part) => (/^\d+b$/i.test(part) ? part.toUpperCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

export function createBrainRegistryDomain({
  agentBrains = [],
  getObserverConfig = () => ({}),
  getQueueConfig = () => ({}),
  getRoutingConfig = () => ({}),
  localOllamaBaseUrl = "http://127.0.0.1:11434",
  normalizeProviderBaseUrl,
  normalizeProviderId,
  sanitizeConfigId = (value = "", fallback = "") => String(value || fallback || "").trim()
} = {}) {
  let availableBrainsCache = { at: 0, brains: [] };

  function invalidateCaches() {
    availableBrainsCache = { at: 0, brains: [] };
  }

  function getEnabledBrainIds() {
    const configured = Array.isArray(getObserverConfig()?.brains?.enabledIds)
      ? getObserverConfig().brains.enabledIds
      : [];
    return new Set((configured.length ? configured : ["bitnet", "worker"]).map((value) => String(value)));
  }

  function serializeBrainEndpointConfig(entry = {}, id = "") {
    const endpointId = sanitizeConfigId(id, "endpoint");
    const provider = normalizeProviderId(entry?.provider || "ollama");
    return {
      label: String(entry?.label || endpointId).trim() || endpointId,
      provider,
      baseUrl: normalizeProviderBaseUrl(entry?.baseUrl || "", provider),
      apiKeyEnv: String(entry?.apiKeyEnv || "").trim(),
      apiKeyHandle: String(entry?.apiKeyHandle || "").trim()
    };
  }

  function getConfiguredBrainEndpoints() {
    const configured = getObserverConfig()?.brains?.endpoints && typeof getObserverConfig().brains.endpoints === "object"
      ? getObserverConfig().brains.endpoints
      : {};
    const entries = Object.entries(configured).map(([id, entry]) => [String(id), {
      id: String(id),
      label: String(entry?.label || id),
      provider: normalizeProviderId(entry?.provider || "ollama"),
      baseUrl: normalizeProviderBaseUrl(entry?.baseUrl || "", entry?.provider || "ollama"),
      apiKeyEnv: String(entry?.apiKeyEnv || "").trim(),
      apiKeyHandle: String(entry?.apiKeyHandle || "").trim()
    }]);
    if (!entries.some(([id]) => id === "local")) {
      entries.unshift(["local", { id: "local", label: "Local Ollama", provider: "ollama", baseUrl: localOllamaBaseUrl, apiKeyEnv: "", apiKeyHandle: "" }]);
    }
    return Object.fromEntries(entries);
  }

  function getBrainEndpointForId(brainId = "") {
    const endpoints = getConfiguredBrainEndpoints();
    const assignments = getObserverConfig()?.brains?.assignments && typeof getObserverConfig().brains.assignments === "object"
      ? getObserverConfig().brains.assignments
      : {};
    const endpointId = String(assignments[String(brainId || "")] || "local");
    const endpoint = endpoints[endpointId] || endpoints.local || { id: "local", label: "Local Ollama", provider: "ollama", baseUrl: localOllamaBaseUrl };
    return { ...endpoint, id: endpoint.id || endpointId };
  }

  function normalizeNumGpu(value) {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && Number.isInteger(n) ? n : null;
  }

  function decorateBrain(brain = {}) {
    const endpoint = brain?.endpointId || brain?.ollamaBaseUrl || brain?.baseUrl
      ? {
          id: String(brain.endpointId || "custom"),
          label: String(brain.endpointLabel || brain.endpointId || "Custom endpoint"),
          provider: normalizeProviderId(brain.provider || "ollama"),
          baseUrl: normalizeProviderBaseUrl(brain.baseUrl || brain.ollamaBaseUrl || "", brain.provider || "ollama"),
          apiKeyEnv: String(brain.apiKeyEnv || "").trim(),
          apiKeyHandle: String(brain.apiKeyHandle || "").trim()
        }
      : getBrainEndpointForId(brain?.id || "");
    const provider = normalizeProviderId(endpoint.provider || "ollama");
    const baseUrl = normalizeProviderBaseUrl(endpoint.baseUrl || "", provider);
    const numGpu = normalizeNumGpu(brain?.numGpu);
    return {
      ...brain,
      provider,
      endpointId: String(endpoint.id || "local"),
      endpointLabel: String(endpoint.label || endpoint.id || "Local Ollama"),
      baseUrl,
      ollamaBaseUrl: baseUrl,
      apiKeyEnv: String(endpoint.apiKeyEnv || brain?.apiKeyEnv || "").trim(),
      apiKeyHandle: String(endpoint.apiKeyHandle || brain?.apiKeyHandle || "").trim(),
      remote: provider !== "ollama" || baseUrl !== localOllamaBaseUrl,
      queueLane: String(brain?.queueLane || "").trim(),
      numGpu
    };
  }

  function normalizeBuiltInBrainOverride(entry = {}) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const id = String(entry.id || "").trim();
    const fallbackBrain = agentBrains.find((brain) => String(brain.id || "").trim() === id);
    if (!id || !fallbackBrain) {
      return null;
    }
    const model = normalizeModelName(String(entry.model || "").trim());
    if (!model) {
      return null;
    }
    const numGpu = normalizeNumGpu(entry.numGpu);
    return {
      id,
      model,
      ...(numGpu != null ? { numGpu } : {})
    };
  }

  function serializeBuiltInBrainConfig(entry = {}) {
    const normalized = normalizeBuiltInBrainOverride(entry);
    return normalized ? { ...normalized } : null;
  }

  function getConfiguredBuiltInBrainOverrides() {
    const configured = Array.isArray(getObserverConfig()?.brains?.builtIn)
      ? getObserverConfig().brains.builtIn
      : [];
    return configured
      .map((entry) => normalizeBuiltInBrainOverride(entry))
      .filter(Boolean);
  }

  function applyBuiltInBrainOverrides(brain = {}) {
    const override = getConfiguredBuiltInBrainOverrides().find((entry) => entry.id === String(brain?.id || "").trim());
    if (!override) {
      return { ...brain };
    }
    return {
      ...brain,
      model: override.model || brain.model,
      ...(override.numGpu != null ? { numGpu: override.numGpu } : {})
    };
  }

  function normalizeCustomBrainConfig(entry = {}, index = 0) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const id = String(entry.id || `custom_${index + 1}`).trim();
    const kind = ["intake", "worker", "helper"].includes(String(entry.kind || "").trim())
      ? String(entry.kind).trim()
      : "worker";
    const model = normalizeModelName(String(entry.model || "").trim());
    if (!id || !model) {
      return null;
    }
    const endpoint = entry.baseUrl
      ? {
          id: String(entry.endpointId || id),
          label: String(entry.endpointLabel || entry.label || id),
          provider: normalizeProviderId(entry.provider || "ollama"),
          baseUrl: normalizeProviderBaseUrl(entry.baseUrl, entry.provider || "ollama"),
          apiKeyEnv: String(entry.apiKeyEnv || "").trim(),
          apiKeyHandle: String(entry.apiKeyHandle || "").trim()
        }
      : (() => {
          const configuredEndpoints = getConfiguredBrainEndpoints();
          const explicitEndpointId = String(entry.endpointId || "").trim();
          return explicitEndpointId && configuredEndpoints[explicitEndpointId]
            ? configuredEndpoints[explicitEndpointId]
            : getBrainEndpointForId(id);
        })();
    return decorateBrain({
      id,
      label: String(entry.label || toBrainLabel(id)),
      kind,
      model,
      specialty: String(entry.specialty || "").trim().toLowerCase(),
      toolCapable: entry.toolCapable == null ? kind === "worker" : entry.toolCapable === true,
      cronCapable: entry.cronCapable === true,
      description: String(entry.description || "Network Ollama brain"),
      queueLane: String(entry.queueLane || "").trim(),
      numGpu: normalizeNumGpu(entry.numGpu),
      provider: endpoint.provider,
      endpointId: endpoint.id,
      endpointLabel: endpoint.label,
      baseUrl: endpoint.baseUrl,
      ollamaBaseUrl: endpoint.baseUrl,
      apiKeyEnv: endpoint.apiKeyEnv,
      apiKeyHandle: endpoint.apiKeyHandle
    });
  }

  function serializeCustomBrainConfig(entry = {}, index = 0, knownEndpointIds = new Set(["local"])) {
    const id = sanitizeConfigId(entry?.id, `custom_${index + 1}`);
    const kind = ["intake", "worker", "helper"].includes(String(entry?.kind || "").trim())
      ? String(entry.kind).trim()
      : "worker";
    const model = normalizeModelName(String(entry?.model || "").trim());
    if (!id || !model) {
      return null;
    }
    const endpointId = knownEndpointIds.has(String(entry?.endpointId || "").trim())
      ? String(entry.endpointId).trim()
      : "local";
    const serializedNumGpu = normalizeNumGpu(entry?.numGpu);
    return {
      id,
      label: String(entry?.label || toBrainLabel(id)).trim() || toBrainLabel(id),
      kind,
      model,
      endpointId,
      queueLane: String(entry?.queueLane || "").trim(),
      specialty: String(entry?.specialty || "").trim().toLowerCase(),
      toolCapable: entry?.toolCapable === true,
      cronCapable: entry?.cronCapable === true,
      description: String(entry?.description || "").trim(),
      ...(serializedNumGpu != null ? { numGpu: serializedNumGpu } : {})
    };
  }

  function buildBrainConfigPayload() {
    const observerConfig = getObserverConfig();
    const builtInOverrides = getConfiguredBuiltInBrainOverrides();
    return {
      brains: {
        enabledIds: Array.isArray(observerConfig?.brains?.enabledIds) ? observerConfig.brains.enabledIds : [],
        builtIn: builtInOverrides,
        endpoints: getConfiguredBrainEndpoints(),
        assignments: observerConfig?.brains?.assignments && typeof observerConfig.brains.assignments === "object"
          ? observerConfig.brains.assignments
          : {},
        custom: Array.isArray(observerConfig?.brains?.custom) ? observerConfig.brains.custom : []
      },
      routing: getRoutingConfig(),
      queue: getQueueConfig(),
      builtInBrains: agentBrains.map((brain) => {
        const effectiveBrain = applyBuiltInBrainOverrides(brain);
        const numGpu = normalizeNumGpu(effectiveBrain.numGpu);
        return {
          id: brain.id,
          label: effectiveBrain.label,
          kind: effectiveBrain.kind,
          model: effectiveBrain.model,
          description: effectiveBrain.description,
          ...(numGpu != null ? { numGpu } : {})
        };
      })
    };
  }

  function isCpuQueueLane(brain = {}) {
    const explicitLane = String(brain?.queueLane || "").trim().toLowerCase();
    if (explicitLane.includes("gpu")) return false;
    if (explicitLane.includes("cpu")) return true;
    const text = `${String(brain?.model || "").toLowerCase()} ${String(brain?.description || "").toLowerCase()} ${String(brain?.specialty || "").toLowerCase()}`;
    return /\bcpu\b/.test(text);
  }

  function getBrainQueueLane(brain = {}) {
    if (!brain) {
      return "";
    }
    if (String(brain.queueLane || "").trim()) {
      return String(brain.queueLane || "").trim();
    }
    const endpointId = String(brain.endpointId || "local").trim() || "local";
    return isCpuQueueLane(brain) ? `endpoint:${endpointId}:cpu` : `endpoint:${endpointId}:gpu`;
  }

  async function listAvailableBrains() {
    if (Date.now() - Number(availableBrainsCache.at || 0) < 5000 && Array.isArray(availableBrainsCache.brains) && availableBrainsCache.brains.length) {
      return availableBrainsCache.brains;
    }
    const enabledBrainIds = getEnabledBrainIds();
    const builtInBrains = agentBrains.map((brain) => decorateBrain(applyBuiltInBrainOverrides(brain)));
    const customBrains = Array.isArray(getObserverConfig()?.brains?.custom)
      ? getObserverConfig().brains.custom.map((entry, index) => normalizeCustomBrainConfig(entry, index)).filter(Boolean)
      : [];
    availableBrainsCache = {
      at: Date.now(),
      brains: [...builtInBrains, ...customBrains].filter((brain) => enabledBrainIds.has(brain.id))
    };
    return availableBrainsCache.brains;
  }

  async function getBrain(brainId = "") {
    const brains = await listAvailableBrains();
    return brains.find((brain) => brain.id === brainId) || brains.find((brain) => brain.id === "worker") || brains[0] || null;
  }

  async function findBrainByIdExact(brainId = "") {
    const target = String(brainId || "").trim();
    if (!target) {
      return null;
    }
    const brains = await listAvailableBrains();
    return brains.find((brain) => String(brain.id || "").trim() === target) || null;
  }

  return {
    applyBuiltInBrainOverrides,
    buildBrainConfigPayload,
    decorateBrain,
    findBrainByIdExact,
    getBrain,
    getBrainEndpointForId,
    getBrainQueueLane,
    getConfiguredBrainEndpoints,
    getConfiguredBuiltInBrainOverrides,
    getEnabledBrainIds,
    invalidateCaches,
    isCpuQueueLane,
    listAvailableBrains,
    normalizeBuiltInBrainOverride,
    normalizeCustomBrainConfig,
    normalizeNumGpu,
    serializeBrainEndpointConfig,
    serializeBuiltInBrainConfig,
    serializeCustomBrainConfig
  };
}
