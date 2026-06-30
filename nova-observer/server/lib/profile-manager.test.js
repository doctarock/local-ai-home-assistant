import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  filterToolsByProfile,
  loadActiveProfile,
  profileAllowsTool,
  resolveProfilePluginState,
  saveProfileSelection
} from "./profile-manager.js";

async function createProfileRoot(files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "observer-profile-test-"));
  const profilesRoot = path.join(root, "profiles");
  await fs.mkdir(profilesRoot, { recursive: true });
  for (const [name, profile] of Object.entries(files)) {
    await fs.writeFile(path.join(profilesRoot, name), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  }
  return root;
}

function baseProfile(overrides = {}) {
  return {
    id: "default",
    name: "Default",
    description: "Default profile",
    enabledPlugins: [],
    disabledPlugins: [],
    forceEnabledPlugins: [],
    hiddenPlugins: [],
    defaultBrain: "main",
    systemPromptAddons: [],
    tools: {
      allow: [],
      deny: []
    },
    ui: {
      title: "Observer",
      hiddenTabs: [],
      defaultTab: "queue"
    },
    runtime: {
      allowGeneralAssistant: true
    },
    ...overrides
  };
}

test("default profile loads if no env var is set", async () => {
  const root = await createProfileRoot({
    "default.json": baseProfile({ ui: { title: "Default Title", hiddenTabs: [], defaultTab: "queue" } })
  });
  const profile = await loadActiveProfile({ fs, rootDir: root, env: {}, logger: { warn: () => {} } });
  assert.equal(profile.id, "default");
  assert.equal(profile.ui.title, "Default Title");
});

test("selected profile merges over default", async () => {
  const root = await createProfileRoot({
    "default.json": baseProfile({
      enabledPlugins: ["mail"],
      systemPromptAddons: ["default addon"],
      ui: { title: "Default", hiddenTabs: ["home"], defaultTab: "queue" }
    }),
    "printshop.json": baseProfile({
      id: "printshop",
      name: "Printshop",
      enabledPlugins: ["projects"],
      systemPromptAddons: ["printshop addon"],
      ui: { title: "Printshop Ops", hiddenTabs: ["voice"], defaultTab: "tools" },
      runtime: { allowGeneralAssistant: false }
    })
  });
  const profile = await loadActiveProfile({
    fs,
    rootDir: root,
    env: { OBSERVER_PROFILE: "printshop" },
    logger: { warn: () => {} }
  });
  assert.equal(profile.id, "printshop");
  assert.deepEqual(profile.enabledPlugins, ["mail", "projects"]);
  assert.deepEqual(profile.systemPromptAddons, ["default addon", "printshop addon"]);
  assert.deepEqual(profile.ui.hiddenTabs, ["home", "voice"]);
  assert.equal(profile.ui.title, "Printshop Ops");
  assert.equal(profile.runtime.allowGeneralAssistant, false);
});

test("missing selected profile falls back safely", async () => {
  const warnings = [];
  const root = await createProfileRoot({
    "default.json": baseProfile()
  });
  const profile = await loadActiveProfile({
    fs,
    rootDir: root,
    env: { OBSERVER_PROFILE: "missing" },
    logger: { warn: (message) => warnings.push(message) }
  });
  assert.equal(profile.id, "default");
  assert.equal(warnings.length, 1);
});

test("saved profile selection is used when env var is absent", async () => {
  const root = await createProfileRoot({
    "default.json": baseProfile(),
    "printshop.json": baseProfile({
      id: "printshop",
      name: "Printshop",
      ui: { title: "Printshop Ops", hiddenTabs: [], defaultTab: "queue" },
      runtime: { allowGeneralAssistant: false }
    })
  });
  const preferencePath = path.join(root, "runtime", "active-profile.json");
  await saveProfileSelection({ fs, preferencePath, profileId: "printshop" });
  const profile = await loadActiveProfile({
    fs,
    rootDir: root,
    preferencePath,
    env: {},
    logger: { warn: () => {} }
  });
  assert.equal(profile.id, "printshop");
});

test("plugin profile enable and disable rules respect manual and force states", () => {
  const profile = baseProfile({
    enabledPlugins: ["mail"],
    disabledPlugins: ["iot"],
    forceEnabledPlugins: ["security"]
  });
  assert.deepEqual(resolveProfilePluginState(profile, "mail", undefined), {
    enabled: true,
    source: "profile-enabled"
  });
  assert.deepEqual(resolveProfilePluginState(profile, "mail", false), {
    enabled: false,
    source: "manual-disabled"
  });
  assert.deepEqual(resolveProfilePluginState(profile, "security", false), {
    enabled: true,
    source: "profile-force-enabled"
  });
  assert.deepEqual(resolveProfilePluginState(profile, "iot", true), {
    enabled: false,
    source: "profile-disabled"
  });
});

test("tool allow and deny wildcard rules filter catalog entries", () => {
  const profile = baseProfile({
    tools: {
      allow: ["mail_*", "quote_create"],
      deny: ["mail_delete", "voice_*"]
    }
  });
  assert.equal(profileAllowsTool(profile, "mail_read"), true);
  assert.equal(profileAllowsTool(profile, "mail_delete"), false);
  assert.equal(profileAllowsTool(profile, "voice_start"), false);
  assert.equal(profileAllowsTool(profile, "shell_command"), false);
  assert.deepEqual(
    filterToolsByProfile([
      { name: "mail_read" },
      { name: "mail_delete" },
      { name: "quote_create" },
      { name: "shell_command" }
    ], profile).map((tool) => tool.name),
    ["mail_read", "quote_create"]
  );
});
