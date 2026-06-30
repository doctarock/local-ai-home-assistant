import assert from "node:assert/strict";
import test from "node:test";
import { createOllamaRuntimeService } from "./ollama-runtime-service.js";

function createRuntime(overrides = {}) {
  return createOllamaRuntimeService({
    agentRunTimeoutMs: 1000,
    buildJsonRepairCandidates: (value) => [String(value || "")],
    buildLocalGroundedTaskLoopRepair: () => null,
    buildLocalRepeatedToolLoopRepair: () => null,
    buildTranscriptForPrompt: () => "",
    choosePlannerRepairBrain: async () => null,
    clearOllamaEndpointTransportFailure: () => {},
    collectBalancedJsonCandidates: (values) => values,
    defaultModelTemperature: 0.2,
    findBrainByIdExact: async () => null,
    formatOllamaTransportError: (error) => String(error?.message || error || "transport failed"),
    getBrain: async () => ({ id: "fallback", model: "fallback-model", ollamaBaseUrl: "http://127.0.0.1:11434" }),
    getBrainQueueLane: () => "",
    getProjectsRuntime: () => null,
    getRoutingConfig: () => ({}),
    isCpuQueueLane: () => false,
    isRetriableOllamaTransportError: () => false,
    localOllamaBaseUrl: "http://127.0.0.1:11434",
    markOllamaEndpointTransportFailure: () => {},
    maxModelTemperature: 0.4,
    modelKeepAlive: "",
    normalizeOllamaBaseUrl: (value = "") => (String(value || "http://127.0.0.1:11434").replace(/\/+$/, "")),
    normalizeWorkerDecisionEnvelope: (value) => value,
    ollamaEmptyResponseRetryCount: 0,
    ollamaSidecarLeaseWaitMs: 0,
    ollamaTransportRetryCount: 0,
    ollamaTransportRetryDelayMs: 0,
    parseFirstJsonCandidateFromList: () => ({ ok: false }),
    stripAnsi: (value = "") => String(value || ""),
    waitMs: async () => {},
    workerDecisionJsonSchema: { type: "object" },
    ...overrides
  });
}

test("OpenAI-compatible brains use chat completions instead of Ollama generate", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TEST_PROVIDER_KEY;
  const requests = [];
  process.env.TEST_PROVIDER_KEY = "test-secret";
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: "{\"final\":true}" } }] };
      }
    };
  };

  try {
    const runtime = createRuntime({
      findBrainByIdExact: async (brainId) => ({
        id: brainId,
        provider: "openai-compatible",
        model: "gpt-test",
        baseUrl: "https://example.test/v1",
        ollamaBaseUrl: "https://example.test/v1",
        apiKeyEnv: "TEST_PROVIDER_KEY"
      })
    });
    const result = await runtime.runOllamaJsonGenerate("ignored-model", "Return JSON", {
      brainId: "openai-brain",
      format: { type: "object" }
    });

    assert.equal(result.ok, true);
    assert.equal(result.text, "{\"final\":true}");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://example.test/v1/chat/completions");
    assert.equal(requests[0].options.headers.authorization, "Bearer test-secret");
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.model, "ignored-model");
    assert.deepEqual(body.response_format, { type: "json_object" });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) {
      delete process.env.TEST_PROVIDER_KEY;
    } else {
      process.env.TEST_PROVIDER_KEY = previousKey;
    }
  }
});

test("remote Ollama CPU and GPU lanes sharing a base URL can run in parallel", async () => {
  const previousFetch = globalThis.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    await new Promise((resolve) => setTimeout(resolve, 25));
    inFlight -= 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return { response: "{\"final\":true}" };
      }
    };
  };

  try {
    const runtime = createRuntime({
      findBrainByIdExact: async (brainId) => ({
        id: brainId,
        provider: "ollama",
        model: brainId === "remote-cpu" ? "cpu-model" : "gpu-model",
        ollamaBaseUrl: "http://192.168.0.73:11434",
        queueLane: brainId === "remote-cpu" ? "lan_73_cpu" : "lan_73_gpu"
      }),
      getBrainQueueLane: (brain) => String(brain?.queueLane || ""),
      isCpuQueueLane: (brain) => String(brain?.queueLane || "").includes("cpu")
    });

    const [cpuResult, gpuResult] = await Promise.all([
      runtime.runOllamaGenerate("cpu-model", "CPU", {
        brainId: "remote-cpu",
        baseUrl: "http://192.168.0.73:11434",
        leaseWaitMs: 250
      }),
      runtime.runOllamaGenerate("gpu-model", "GPU", {
        brainId: "remote-gpu",
        baseUrl: "http://192.168.0.73:11434",
        leaseWaitMs: 250
      })
    ]);

    assert.equal(cpuResult.ok, true);
    assert.equal(gpuResult.ok, true);
    assert.equal(requests.length, 2);
    assert.equal(maxInFlight, 2);
    const cpuRequest = requests.find((request) => request.body.model === "cpu-model");
    const gpuRequest = requests.find((request) => request.body.model === "gpu-model");
    assert.equal(cpuRequest.body.options.num_gpu, 0);
    assert.equal(gpuRequest.body.options.num_gpu, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("local Ollama CPU intake and GPU worker lanes sharing a base URL can run in parallel", async () => {
  const previousFetch = globalThis.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    await new Promise((resolve) => setTimeout(resolve, 25));
    inFlight -= 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return { response: "{\"final\":true}" };
      }
    };
  };

  try {
    const runtime = createRuntime({
      findBrainByIdExact: async (brainId) => ({
        id: brainId,
        provider: "ollama",
        kind: brainId === "intake" ? "intake" : "worker",
        model: brainId === "intake" ? "cpu-model" : "gpu-model",
        description: brainId === "intake" ? "CPU-only intake model" : "GPU worker",
        ollamaBaseUrl: "http://127.0.0.1:11434"
      }),
      getBrainQueueLane: (brain) => String(brain?.description || "").toLowerCase().includes("cpu")
        ? "endpoint:local:cpu"
        : "endpoint:local:gpu",
      isCpuQueueLane: (brain) => String(brain?.description || "").toLowerCase().includes("cpu")
    });

    const [cpuResult, gpuResult] = await Promise.all([
      runtime.runOllamaGenerate("cpu-model", "CPU", {
        brainId: "intake",
        baseUrl: "http://127.0.0.1:11434",
        leaseWaitMs: 250
      }),
      runtime.runOllamaGenerate("gpu-model", "GPU", {
        brainId: "worker",
        baseUrl: "http://127.0.0.1:11434",
        leaseWaitMs: 250
      })
    ]);

    assert.equal(cpuResult.ok, true);
    assert.equal(gpuResult.ok, true);
    assert.equal(requests.length, 2);
    assert.equal(maxInFlight, 2);
    const cpuRequest = requests.find((request) => request.body.model === "cpu-model");
    assert.equal(cpuRequest.body.options.num_gpu, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("remote Ollama calls on the same GPU lane are serialized", async () => {
  const previousFetch = globalThis.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  globalThis.fetch = async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 25));
    inFlight -= 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return { response: "{\"final\":true}" };
      }
    };
  };

  try {
    const runtime = createRuntime({
      findBrainByIdExact: async (brainId) => ({
        id: brainId,
        provider: "ollama",
        model: "gpu-model",
        ollamaBaseUrl: "http://192.168.0.73:11434",
        queueLane: "lan_73_gpu"
      }),
      getBrainQueueLane: (brain) => String(brain?.queueLane || "")
    });

    const [firstResult, secondResult] = await Promise.all([
      runtime.runOllamaGenerate("gpu-model", "GPU 1", {
        brainId: "remote-gpu-a",
        baseUrl: "http://192.168.0.73:11434",
        leaseWaitMs: 250
      }),
      runtime.runOllamaGenerate("gpu-model", "GPU 2", {
        brainId: "remote-gpu-b",
        baseUrl: "http://192.168.0.73:11434",
        leaseWaitMs: 250
      })
    ]);

    assert.equal(firstResult.ok, true);
    assert.equal(secondResult.ok, true);
    assert.equal(maxInFlight, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
