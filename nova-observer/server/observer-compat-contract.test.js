import assert from "node:assert/strict";
import test from "node:test";
import {
  createObserverBrowserHost,
  hasManifestPermission,
  isTrustLevelAtLeast,
  mountObserverPluginTab,
  normalizeAppTrustConfig,
  normalizeAutonomyCandidate,
  normalizeAutonomyCandidateList,
  normalizePluginManifest,
  normalizeSourceIdentityRecord,
  normalizeUiPanelDescriptor,
  normalizeUiTabDescriptor,
  trustLevelLabel
} from "../observer-compat/index.js";

test("observer compat normalizes Nova trust records and source identities", () => {
  const trust = normalizeAppTrustConfig({
    emailCommandMinLevel: "trusted",
    voiceCommandMinLevel: "trusted",
    records: [{
      id: "operator",
      label: "Derek",
      speakerLabel: "Derek Speaker",
      email: "DEREK@example.com",
      aliases: ["D", "D"],
      phoneNumber: "(0400) 123 456",
      trustLevel: "trusted",
      signature: [0.1, "0.2", "bad"],
      threshold: 0.9,
      notes: "primary"
    }]
  }, { now: 1000 });

  assert.equal(trust.records[0].id, "operator");
  assert.equal(trust.records[0].label, "Derek");
  assert.equal(trust.records[0].email, "derek@example.com");
  assert.deepEqual(trust.records[0].aliases, ["D"]);
  assert.deepEqual(trust.records[0].phoneNumbers, ["0400123456"]);
  assert.deepEqual(trust.voiceProfiles[0].signature, [0.1, 0.2]);
  assert.equal(trust.voiceProfiles[0].trustLevel, "trusted");
  assert.equal(trust.emailSources[0].email, "derek@example.com");
  assert.equal(trust.phoneSources[0].phoneNumbers[0], "0400123456");

  const voiceIdentity = normalizeSourceIdentityRecord({
    kind: "voice",
    speakerId: "operator",
    speakerLabel: "Derek",
    trustLevel: "trusted",
    similarity: 0.94,
    threshold: 0.9
  }, { preserveTrustLevel: true });
  assert.equal(voiceIdentity.kind, "voice");
  assert.equal(voiceIdentity.label, "Derek");
  assert.equal(voiceIdentity.trustLevel, "trusted");
  assert.equal(voiceIdentity.matchedProfileId, "operator");

  const emailIdentity = normalizeSourceIdentityRecord({
    kind: "email",
    email: "DEREK@example.com",
    trustLevel: "known",
    command: {
      detected: true,
      action: "queue",
      text: "Please queue this work",
      reason: "Matched command prefix"
    }
  }, { preserveTrustLevel: true });
  assert.equal(emailIdentity.email, "derek@example.com");
  assert.equal(emailIdentity.command.detected, true);
  assert.equal(trustLevelLabel("trusted"), "Trusted");
  assert.equal(isTrustLevelAtLeast("trusted", "known"), true);
});

test("observer compat normalizes manifests and UI descriptors", () => {
  const manifest = normalizePluginManifest({
    schemaVersion: 2,
    startupPriority: 1200,
    permissions: {
      routes: true,
      uiPanels: true,
      data: true,
      tools: true,
      hooks: ["runtime:*"],
      capabilities: ["mail.send"],
      runtimeContext: ["createQueuedTask"]
    },
    security: { isolation: "process" }
  });

  assert.equal(manifest.startupPriority, 1000);
  assert.equal(manifest.permissions.routes, true);
  assert.deepEqual(manifest.permissions.tools, ["*"]);
  assert.equal(hasManifestPermission(manifest.permissions.hooks, "runtime:tick:5m"), true);
  assert.equal(hasManifestPermission(manifest.permissions.capabilities, "mail.read"), false);
  assert.equal(manifest.security.isolation, "process");

  const panel = normalizeUiPanelDescriptor("Mail Plugin", {
    title: "Mail Tools",
    fields: [{ id: "to" }],
    actions: [{ id: "send", endpoint: "/api/plugins/mail/send" }]
  });
  assert.equal(panel.pluginId, "mail-plugin");
  assert.equal(panel.id, "mail-tools");
  assert.equal(panel.actions.length, 1);

  const tab = normalizeUiTabDescriptor("Mail Plugin", {
    title: "Mail",
    scriptUrl: "/plugins/mail/mail-tab.js"
  });
  assert.equal(tab.pluginId, "mail-plugin");
  assert.equal(tab.id, "mail");
  assert.equal(tab.icon, "M");
  assert.equal(normalizeUiTabDescriptor("bad", { scriptUrl: "relative.js" }), null);
});

test("observer compat normalizes autonomy candidates", () => {
  const candidate = normalizeAutonomyCandidate({
    id: "cron:daily-memory",
    source: "cron-definition",
    title: "Daily memory",
    description: "Curate durable notes",
    priority: 1200,
    mode: "queue",
    taskPayload: {
      message: "Curate memory",
      source: "cron-definition"
    }
  }, { now: 2000 });

  assert.equal(candidate.priority, 1000);
  assert.equal(candidate.status, "open");
  assert.equal(candidate.taskPayload.taskMeta.autonomyCandidateId, "cron:daily-memory");
  assert.equal(candidate.taskPayload.taskMeta.autonomyCandidateSource, "cron-definition");

  const ordered = normalizeAutonomyCandidateList([
    { id: "low", title: "Low", priority: 1 },
    { id: "closed", title: "Closed", status: "dismissed", priority: 999 },
    { id: "high", title: "High", priority: 500 },
    { id: "high", title: "Duplicate", priority: 1000 }
  ], { defaults: { now: 2000 } });
  assert.deepEqual(ordered.map((entry) => entry.id), ["high", "low"]);
});

test("observer compat browser host mounts Nova-style and Omega-style plugin tabs", async () => {
  const calls = [];
  const host = createObserverBrowserHost({
    api: async (path) => ({ ok: true, path }),
    adminFetch: async (path) => ({ ok: true, path }),
    refreshAll: async () => calls.push("refreshAll"),
    onMissingMethod: (name) => calls.push(`missing:${name}`)
  });
  assert.equal(typeof host.adminFetch, "function");
  assert.equal(host.trustLevelLabel("known"), "Known");

  const root = { innerHTML: "" };
  await mountObserverPluginTab({
    mountPluginTab({ root: target, observerApp, pluginAdminFetch }) {
      target.innerHTML = observerApp.trustLevelLabel("trusted");
      assert.equal(typeof pluginAdminFetch, "function");
    }
  }, { root, tab: { id: "nova-tab" }, host });
  assert.equal(root.innerHTML, "Trusted");

  await mountObserverPluginTab({
    mount(target, observerApp) {
      target.innerHTML = observerApp.formatEntityRef("task", "task-1");
    }
  }, { root, tab: { id: "omega-tab" }, host });
  assert.equal(root.innerHTML, "task:task-1");

  host.enqueueUpdate({ text: "hello" });
  host.enqueueUpdate({ text: "again" });
  assert.deepEqual(calls, ["missing:enqueueUpdate"]);
});
