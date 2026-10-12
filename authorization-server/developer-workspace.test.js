"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDeveloperWorkspace, validateRedirect } = require("./developer-workspace");
const DEV = "developer_123", OTHER = "developer_456", TOKEN = "valid-test-session-credential";
function setup(options = {}) {
  const rows = new Map(), events = [];
  const service = createDeveloperWorkspace({
    authenticate: async credential => {
      if (options.offline) throw new Error("offline");
      return { subject: credential === "other-valid-session-credential" ? OTHER : DEV, verified: credential !== "unverified-session-credential" };
    },
    approvals: { get: async subject => ({ subject, status: options.revoked ? "revoked" : "approved", enabled: !options.revoked }) },
    applications: {
      create: async record => { rows.set(record.id, record); return record; },
      listByOwner: async subject => [...rows.values()].filter(row => row.ownerSubject === subject),
      get: async id => rows.get(id),
      update: async (id, changes) => { const next = { ...rows.get(id), ...changes }; rows.set(id, next); return next; }
    },
    audit: { append: async event => { if (options.auditOffline) throw new Error("audit offline"); events.push(event); } },
    ids: () => "app_test_123", clock: () => "2026-10-12T00:00:00.000Z"
  });
  return { service, rows, events };
}
const input = { name: "Spark Studio", type: "web", redirects: ["https://studio.example.com/callback"] };
test("approved verified developer registers pending app and receives only own records", async () => {
  const { service, events } = setup();
  assert.equal((await service.register(TOKEN, input)).status, "pending");
  assert.equal((await service.list(TOKEN)).length, 1);
  assert.equal((await service.list("other-valid-session-credential")).length, 0);
  assert.equal(events[0].action, "application_registered");
});
test("fails closed for revoked, unverified, malformed and unavailable sessions", async () => {
  for (const [options, token] of [[{ revoked: true }, TOKEN], [{}, "unverified-session-credential"], [{}, "short"], [{ offline: true }, TOKEN]]) {
    await assert.rejects(setup(options).service.register(token, input));
  }
});
test("rejects unsafe, ambiguous and duplicate redirects", async () => {
  for (const uri of ["http://example.com/callback", "https://user:pass@example.com/", "https://example.com/#fragment", "https://localhost/callback", "https://example.com/?code=1"]) {
    assert.throws(() => validateRedirect(uri, "web"));
  }
  await assert.rejects(setup().service.register(TOKEN, { ...input, redirects: [input.redirects[0], input.redirects[0]] }), /Duplicate/);
  assert.throws(() => validateRedirect("myapp://callback", "native"));
});
test("only owner can update redirects and changes force new review", async () => {
  const { service, rows, events } = setup();
  await service.register(TOKEN, input);
  await assert.rejects(service.replaceRedirects("other-valid-session-credential", "app_test_123", ["https://other.example.com/cb"]), /not found/);
  rows.get("app_test_123").status = "approved";
  const updated = await service.replaceRedirects(TOKEN, "app_test_123", ["https://studio.example.com/new-callback"]);
  assert.equal(updated.status, "pending");
  assert.equal(events[1].action, "redirects_changed_review_required");
});
test("audit failure never reports a successful registration", async () => {
  await assert.rejects(setup({ auditOffline: true }).service.register(TOKEN, input), /audit offline/);
});
