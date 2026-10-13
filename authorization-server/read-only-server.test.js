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
