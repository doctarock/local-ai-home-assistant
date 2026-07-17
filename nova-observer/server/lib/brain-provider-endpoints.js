export function createBrainProviderEndpoints({ localOllamaBaseUrl = "http://127.0.0.1:11434" } = {}) {
  function normalizeProviderId(value = "") {
    const normalized = String(value || "ollama").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    if (["openai", "openai-compatible", "openrouter", "lmstudio", "vllm"].includes(normalized)) {
      return "openai-compatible";
    }
    return normalized || "ollama";
  }

  function getDefaultProviderBaseUrl(provider = "ollama") {
    return normalizeProviderId(provider) === "ollama"
      ? localOllamaBaseUrl
      : "https://api.openai.com/v1";
  }

  function normalizeProviderBaseUrl(value = "", provider = "ollama") {
    const raw = String(value || "").trim();
    if (!raw) {
      return getDefaultProviderBaseUrl(provider);
    }
    return (/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`).replace(/\/+$/, "");
  }

  return {
    getDefaultProviderBaseUrl,
    normalizeProviderBaseUrl,
    normalizeProviderId
  };
}
