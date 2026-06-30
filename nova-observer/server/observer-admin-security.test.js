import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createObserverAdminSecurity } from "./observer-admin-security.js";

function buildAdminReq(token = "test-admin-token", method = "POST", clientSessionId = "test-client-session") {
  return {
    method,
    path: "/api/agent/run",
    headers: {
      host: "localhost:3220",
      origin: "http://localhost:3220",
      "x-admin-token": token,
      "x-observer-client-session": clientSessionId
    },
    socket: { remoteAddress: "127.0.0.1" }
  };
}

test("UI session is locked when voice profiles exist until trusted voice unlocks it", () => {
  const security = createObserverAdminSecurity({
    port: 3220,
    adminUiToken: "test-admin-token",
    getVoiceProfileCount: () => 1
  });
  const req = buildAdminReq();

  assert.equal(security.getUiSessionStatus(req).lockEnabled, true);
  assert.equal(security.getUiSessionStatus(req).unlocked, false);
  assert.equal(security.validateUnlockedAdminRequest(req).status, 423);

  const unlocked = security.unlockUiSession(req, {
    by: "voice",
    sourceIdentity: { kind: "voice", trustLevel: "trusted", speakerLabel: "Derek" }
  });
  assert.equal(unlocked.unlocked, true);
  assert.equal(security.validateUnlockedAdminRequest(req).ok, true);
});

test("UI lock is disabled when no voice profiles are recorded", () => {
  const security = createObserverAdminSecurity({
    port: 3220,
    adminUiToken: "test-admin-token",
    getVoiceProfileCount: () => 0
  });
  const req = buildAdminReq();

  const status = security.getUiSessionStatus(req);
  assert.equal(status.lockEnabled, false);
  assert.equal(status.unlocked, true);
  assert.equal(security.validateUnlockedAdminRequest(req).ok, true);
});

test("unlocked UI sessions expire after inactivity", () => {
  const security = createObserverAdminSecurity({
    port: 3220,
    adminUiToken: "test-admin-token",
    getVoiceProfileCount: () => 1,
    sessionInactivityMs: 1000
  });
  const req = buildAdminReq();
  const unlocked = security.unlockUiSession(req, { by: "voice" });

  assert.equal(unlocked.unlocked, true);
  assert.equal(security.getUiSessionStatus(req, unlocked.lastActivityAt + 1001).unlocked, false);
});

test("server unlock token arms a one-use browser recovery unlock", async () => {
  const app = express();
  app.use(express.json());
  const security = createObserverAdminSecurity({
    port: 3220,
    adminUiToken: "test-admin-token",
    serverUnlockToken: "server-recovery-token",
    getVoiceProfileCount: () => 1
  });
  security.registerAdminSecurityMiddleware(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/security/server-unlock`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-observer-server-unlock": "server-recovery-token"
      },
      body: "{}"
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.recoveryUnlock.available, true);
    assert.equal(security.validateUnlockedAdminRequest(buildAdminReq()).status, 423);

    const claimResponse = await fetch(`http://127.0.0.1:${port}/api/security/claim-server-unlock`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3220",
        "x-admin-token": "test-admin-token",
        "x-observer-client-session": "claiming-browser-session"
      },
      body: "{}"
    });
    const claimPayload = await claimResponse.json();

    assert.equal(claimResponse.status, 200);
    assert.equal(claimPayload.ok, true);
    assert.equal(security.validateUnlockedAdminRequest(buildAdminReq("test-admin-token", "POST", "claiming-browser-session")).ok, true);
    assert.equal(security.validateUnlockedAdminRequest(buildAdminReq("test-admin-token", "POST", "fresh-browser-session")).status, 423);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
