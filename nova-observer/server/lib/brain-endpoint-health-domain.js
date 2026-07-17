export function createBrainEndpointHealthDomain({
  localOllamaBaseUrl = "http://127.0.0.1:11434",
  ollamaContainer = "nova-ollama",
  ollamaEndpointFailureCooldownMs = 2 * 60 * 1000,
  normalizeProviderId,
  normalizeProviderBaseUrl,
  runCommand = async () => ({ code: 1, stdout: "", stderr: "unavailable" })
} = {}) {
  let ollamaEndpointHealthCache = { at: 0, entries: {} };
  let ollamaEndpointFailureState = {};

  function invalidateCaches() {
    ollamaEndpointHealthCache = { at: 0, entries: {} };
    ollamaEndpointFailureState = {};
  }

  function normalizeOllamaBaseUrl(value = "") {
    const raw = String(value || "").trim();
    if (!raw) {
      return localOllamaBaseUrl;
    }
    return (/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`).replace(/\/+$/, "");
  }

  function formatOllamaTransportError(error) {
    const message = String(error?.message || "failed to reach Ollama API").trim();
    const cause = String(error?.cause?.message || error?.cause?.code || "").trim();
    return cause && !message.toLowerCase().includes(cause.toLowerCase()) ? `${message} (${cause})` : message;
  }

  function isRetriableOllamaTransportError(error) {
    if (!error || error?.name === "AbortError") {
      return false;
    }
    const text = formatOllamaTransportError(error).toLowerCase();
    return ["fetch failed", "econnreset", "socket", "other side closed", "network", "und_err", "connect", "hang up", "terminated"]
      .some((token) => text.includes(token));
  }

  function markOllamaEndpointTransportFailure(baseUrl, error) {
    const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
    ollamaEndpointFailureState[normalizedBaseUrl] = {
      failedAt: Date.now(),
      error: formatOllamaTransportError(error)
    };
    ollamaEndpointHealthCache = { at: 0, entries: { ...ollamaEndpointHealthCache.entries } };
  }

  function clearOllamaEndpointTransportFailure(baseUrl) {
    const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
    if (ollamaEndpointFailureState[normalizedBaseUrl]) {
      delete ollamaEndpointFailureState[normalizedBaseUrl];
      ollamaEndpointHealthCache = { at: 0, entries: { ...ollamaEndpointHealthCache.entries } };
    }
  }

  function getOllamaEndpointTransportCooldown(baseUrl) {
    const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
    const failure = ollamaEndpointFailureState[normalizedBaseUrl];
    if (!failure) {
      return null;
    }
    const ageMs = Date.now() - Number(failure.failedAt || 0);
    if (ageMs >= ollamaEndpointFailureCooldownMs) {
      delete ollamaEndpointFailureState[normalizedBaseUrl];
      return null;
    }
    return { ...failure, remainingMs: ollamaEndpointFailureCooldownMs - ageMs };
  }

  async function inspectOllamaEndpoint(baseUrl = localOllamaBaseUrl) {
    const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
    const cooldown = getOllamaEndpointTransportCooldown(normalizedBaseUrl);
    if (cooldown) {
      return {
        ok: false,
        baseUrl: normalizedBaseUrl,
        status: 0,
        running: false,
        modelCount: 0,
        error: `Cooling down after transport failure: ${cooldown.error}`
      };
    }
    const controller = new AbortController();
    const timeoutMs = 12000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response = null;
      let parsed = {};
      let lastError = "";
      for (const endpointPath of ["/api/tags", "/api/tag"]) {
        try {
          response = await fetch(`${normalizedBaseUrl}${endpointPath}`, { method: "GET", signal: controller.signal });
          try {
            parsed = await response.json();
          } catch {
            parsed = {};
          }
          if (response.ok) {
            break;
          }
          lastError = String(parsed?.error || `Ollama API returned ${response.status}`);
        } catch (error) {
          lastError = String(error?.message || "failed to reach Ollama API");
          if (controller.signal.aborted) {
            throw error;
          }
        }
      }
      if (!response) {
        throw new Error(lastError || "failed to reach Ollama API");
      }
      return {
        ok: response.ok,
        baseUrl: normalizedBaseUrl,
        status: response.status,
        running: response.ok,
        modelCount: Array.isArray(parsed?.models) ? parsed.models.length : 0,
        error: response.ok ? "" : String(parsed?.error || `Ollama API returned ${response.status}`)
      };
    } catch (error) {
      return {
        ok: false,
        baseUrl: normalizedBaseUrl,
        status: 0,
        running: false,
        modelCount: 0,
        error: error?.name === "AbortError" ? `Observer timeout after ${Math.round(timeoutMs / 1000)}s` : String(error?.message || "failed to reach Ollama API")
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function inspectProviderEndpoint(endpoint = {}) {
    const provider = normalizeProviderId(endpoint?.provider || "ollama");
    const baseUrl = normalizeProviderBaseUrl(endpoint?.baseUrl || endpoint?.ollamaBaseUrl || "", provider);
    if (provider === "ollama") {
      return {
        provider,
        ...(await inspectOllamaEndpoint(baseUrl))
      };
    }
    const controller = new AbortController();
    const timeoutMs = 12000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {};
      const apiKey = String(process.env[String(endpoint?.apiKeyEnv || "").trim()] || (provider === "openai-compatible" ? process.env.OPENAI_API_KEY || "" : "")).trim();
      if (apiKey) {
        headers.authorization = `Bearer ${apiKey}`;
      }
      const response = await fetch(`${baseUrl}/models`, { method: "GET", headers, signal: controller.signal });
      let parsed = {};
      try {
        parsed = await response.json();
      } catch {
        parsed = {};
      }
      return {
        ok: response.ok,
        provider,
        baseUrl,
        status: response.status,
        running: response.ok,
        modelCount: Array.isArray(parsed?.data) ? parsed.data.length : 0,
        error: response.ok ? "" : String(parsed?.error?.message || parsed?.error || `Provider API returned ${response.status}`)
      };
    } catch (error) {
      return {
        ok: false,
        provider,
        baseUrl,
        status: 0,
        running: false,
        modelCount: 0,
        error: error?.name === "AbortError" ? `Observer timeout after ${Math.round(timeoutMs / 1000)}s` : String(error?.message || "failed to reach provider API")
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getOllamaEndpointHealth(baseUrl = localOllamaBaseUrl) {
    const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
    const now = Date.now();
    if (now - Number(ollamaEndpointHealthCache.at || 0) < 5000 && ollamaEndpointHealthCache.entries[normalizedBaseUrl]) {
      return ollamaEndpointHealthCache.entries[normalizedBaseUrl];
    }
    const health = await inspectOllamaEndpoint(normalizedBaseUrl);
    ollamaEndpointHealthCache.entries[normalizedBaseUrl] = health;
    ollamaEndpointHealthCache.at = now;
    return health;
  }

  async function getProviderEndpointHealth(endpoint = {}) {
    const provider = normalizeProviderId(endpoint?.provider || "ollama");
    const baseUrl = normalizeProviderBaseUrl(endpoint?.baseUrl || endpoint?.ollamaBaseUrl || "", provider);
    if (provider === "ollama") {
      return getOllamaEndpointHealth(baseUrl);
    }
    return inspectProviderEndpoint({ ...endpoint, provider, baseUrl });
  }

  async function listOllamaModels() {
    const result = await runCommand("docker", ["exec", ollamaContainer, "ollama", "list"]);
    if (result.code !== 0) {
      throw new Error(result.stderr || "failed to list ollama models");
    }
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(1)
      .map((line) => {
        const [name, digest, size, modified] = line.split(/\s{2,}/).map((part) => part?.trim());
        return { name: name || "", digest: digest || "", size: size || "", modified: modified || "" };
      })
      .filter((entry) => entry.name);
  }

  async function runOllamaEmbed(model, input, { timeoutMs = 30000, baseUrl = localOllamaBaseUrl } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${normalizeOllamaBaseUrl(baseUrl)}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input }),
        signal: controller.signal
      });
      let parsed = {};
      try {
        parsed = await response.json();
      } catch {
        parsed = {};
      }
      if (!response.ok) {
        throw new Error(String(parsed?.error || `Ollama API returned ${response.status}`));
      }
      const embeddings = Array.isArray(parsed?.embeddings) ? parsed.embeddings : Array.isArray(parsed?.embedding) ? [parsed.embedding] : [];
      return embeddings.filter((entry) => Array.isArray(entry) && entry.length);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    clearOllamaEndpointTransportFailure,
    formatOllamaTransportError,
    getOllamaEndpointHealth,
    getOllamaEndpointTransportCooldown,
    getProviderEndpointHealth,
    invalidateCaches,
    inspectOllamaEndpoint,
    inspectProviderEndpoint,
    isRetriableOllamaTransportError,
    listOllamaModels,
    markOllamaEndpointTransportFailure,
    normalizeOllamaBaseUrl,
    runOllamaEmbed
  };
}
