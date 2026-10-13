"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppwriteAuditStore } = require("./appwrite-audit-store");
const event = { actorSubject: "developer_123", appId: "app_test_123", action: "application_registered", occurredAt: "2026-10-12T00:00:00.000Z" };
function setup(result) {
  const calls = [];
  const store = createAppwriteAuditStore({ databaseId: "spark", tableId: "audit", ids: () => "audit_event_123",
    tablesDB: { async createRow(args) { calls.push(args); return result === undefined ? { $id: args.rowId, ...args.data } : result; } } });
  return { store, calls };
}
test("writes private audit row and verifies acknowledgement", async () => {
  const { store, calls } = setup();
  assert.deepEqual(await store.append(event), { id: "audit_event_123", ...event });
  assert.deepEqual(calls[0].permissions, []);
  assert.equal(calls[0].data.actorSubject, "developer_123");
});
test("rejects malformed and unexpected audit event fields", async () => {
  const { store, calls } = setup();
  await assert.rejects(store.append({ ...event, actorSubject: "" }), /Invalid/);
  await assert.rejects(store.append({ ...event, secret: "do-not-store" }), /Unexpected/);
  assert.equal(calls.length, 0);
});
test("rejects missing or mismatched storage acknowledgements", async () => {
  await assert.rejects(setup(null).store.append(event), /not confirmed/);
  await assert.rejects(setup({ $id: "wrong_id", ...event }).store.append(event), /not confirmed/);
});
test("propagates storage outages rather than claiming success", async () => {
  const store = createAppwriteAuditStore({ databaseId: "spark", tableId: "audit", ids: () => "audit_event_123",
    tablesDB: { async createRow() { throw new Error("offline"); } } });
  await assert.rejects(store.append(event), /offline/);
});
test("requires persistent adapter configuration", () => {
  assert.throws(() => createAppwriteAuditStore(), /Persistent/);
});
