"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppwriteApprovalManagementStore } = require("./appwrite-approval-management-store");
const SUBJECT = "developer_123";
function setup(rows = [{ $id: "approval_123", subject: SUBJECT, status: "pending", enabled: false }]) {
  const calls = [];
  const store = createAppwriteApprovalManagementStore({
    databaseId: "spark", tableId: "approvals", queryEqual: (key, value) => [key, value],
    tablesDB: {
      async listRows(args) { calls.push(["list", args]); return { rows }; },
      async updateRow(args) { calls.push(["update", args]); return { ...rows[0], ...args.data }; }
    }
  });
  return { store, calls };
}
test("reads a unique valid developer approval record", async () => {
  assert.deepEqual(await setup().store.get(SUBJECT), { subject: SUBJECT, status: "pending", enabled: false });
});
test("approves existing row using its trusted storage ID", async () => {
  const { store, calls } = setup();
  assert.deepEqual(await store.setStatus({ subject: SUBJECT, status: "approved", enabled: true }),
    { subject: SUBJECT, status: "approved", enabled: true });
  assert.equal(calls[1][1].rowId, "approval_123");
  assert.deepEqual(calls[1][1].data, { status: "approved", enabled: true });
});
test("missing, duplicate and mismatched rows never authorize an update", async () => {
  for (const rows of [[], [{ $id: "approval_123", subject: "other_dev", status: "pending", enabled: false }],
    [{ $id: "approval_123", subject: SUBJECT, status: "pending", enabled: false }, { $id: "approval_456", subject: SUBJECT, status: "pending", enabled: false }]]) {
    const { store, calls } = setup(rows);
    assert.equal(await store.get(SUBJECT), null);
    await assert.rejects(store.setStatus({ subject: SUBJECT, status: "approved", enabled: true }), /unique existing/);
    assert.equal(calls.some(([name]) => name === "update"), false);
  }
});
test("rejects inconsistent status and enabled flag", async () => {
  const { store, calls } = setup();
  await assert.rejects(store.setStatus({ subject: SUBJECT, status: "revoked", enabled: true }), /Invalid/);
  assert.equal(calls.length, 0);
});
test("storage outages and unconfirmed writes fail closed", async () => {
  const { store } = setup([{ $id: "approval_123", subject: SUBJECT, status: "pending", enabled: false }]);
  const bad = createAppwriteApprovalManagementStore({ databaseId: "spark", tableId: "approvals",
    queryEqual: (key, value) => [key, value],
    tablesDB: { listRows: async () => ({ rows: [{ $id: "approval_123", subject: SUBJECT, status: "pending", enabled: false }] }),
      updateRow: async () => null } });
  await assert.rejects(bad.setStatus({ subject: SUBJECT, status: "approved", enabled: true }), /not confirmed/);
  assert.deepEqual(await store.get(SUBJECT), { subject: SUBJECT, status: "pending", enabled: false });
});
