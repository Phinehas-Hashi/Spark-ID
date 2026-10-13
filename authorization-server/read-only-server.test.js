"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createReadOnlyDeveloperServer } = require("./read-only-server");

test("composition is inert until caller explicitly listens", () => {
  const server = createReadOnlyDeveloperServer({
    applications: { listByOwner: async () => [] },
    auth: async () => ({ verified: true, subject: "developer_123" }),
    approvals: { get: async () => ({ subject: "developer_123", status: "approved", enabled: true }) }
  });
  assert.equal(server.listening, false);
  server.close();
});

test("rejects browser-origin requests before authentication", async () => {
  let called = 0;
  const server = createReadOnlyDeveloperServer({
    applications: { listByOwner: async () => { called++; return []; } },
    auth: async () => { called++; return { verified: true, subject: "developer_123" }; },
    approvals: { get: async () => ({ subject: "developer_123", status: "approved", enabled: true }) }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/v1/developer/apps", {
      headers: { Origin: "https://untrusted.example", Authorization: "Bearer " + "a".repeat(30) }
    });
    assert.equal(response.status, 403);
    assert.equal(called, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("health probe returns only static status and does not invoke privileged adapters", async () => {
  let calls = 0;
  const server = createReadOnlyDeveloperServer({
    applications: { listByOwner: async () => { calls++; return []; } },
    auth: async () => { calls++; return null; },
    approvals: { get: async () => { calls++; return null; } }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const response = await fetch(base + "/healthz");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(calls, 0);
    const other = await fetch(base + "/healthz?details=1");
    assert.equal(other.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
test("HTTP connection lifetime is bounded", () => {
  const server = createReadOnlyDeveloperServer({
    applications: { listByOwner: async () => [] },
    auth: async () => null,
    approvals: { get: async () => null }
  });
  assert.equal(server.requestTimeout, 10000);
  assert.equal(server.headersTimeout, 5000);
  assert.equal(server.keepAliveTimeout, 5000);
  assert.equal(server.maxRequestsPerSocket, 100);
  server.close();
});
