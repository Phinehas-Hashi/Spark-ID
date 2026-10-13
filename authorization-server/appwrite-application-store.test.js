"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppwriteApplicationStore } = require("./appwrite-application-store");
function setup() {
  const rows = new Map(), calls = [];
  const db = {
    async createRow(args) { calls.push(["create", args]); const row = { $id: args.rowId, ...args.data }; rows.set(row.$id, row); return row; },
    async getRow({ rowId }) { if (!rows.has(rowId)) throw { code: 404 }; return rows.get(rowId); },
    async listRows(args) { calls.push(["list", args]); return { rows: [...rows.values()].filter(r => r.ownerSubject === args.queries[0][1]) }; },
    async updateRow({ rowId, data }) { const row = { ...rows.get(rowId), ...data }; rows.set(rowId, row); return row; }
  };
  const store = createAppwriteApplicationStore({ endpoint: "https://fra.cloud.appwrite.io/v1", projectId: "test",
    databaseId: "spark", tableId: "applications", tablesDB: db, queryEqual: (key, value) => [key, value], queryLimit: n => ["limit", n] });
  return { store, rows, calls };
}
const record = { id: "app_test_123", ownerSubject: "developer_123", name: "Spark Studio", type: "web",
  status: "pending", redirects: ["https://example.com/cb"], createdAt: "2026-10-12T00:00:00Z" };
test("persists private pending application and reads owner-scoped rows", async () => {
  const { store, calls } = setup();
  assert.equal((await store.create(record)).status, "pending");
  assert.deepEqual(await store.get(record.id), record);
  assert.equal((await store.listByOwner(record.ownerSubject)).length, 1);
  assert.deepEqual(calls[0][1].permissions, []);
  assert.deepEqual(calls[1][1].queries[1], ["limit", 101]);
});
test("redirect updates persist and reset review status", async () => {
  const { store, rows } = setup();
  await store.create(record);
  rows.get(record.id).status = "approved";
  const next = await store.update(record.id, { redirects: ["https://example.com/new"], status: "pending" });
  assert.equal(next.status, "pending");
  assert.deepEqual(next.redirects, ["https://example.com/new"]);
});
test("missing rows return null but storage errors fail closed", async () => {
  const { store, rows } = setup();
  assert.equal(await store.get("missing_app"), null);
  rows.set(record.id, { $id: record.id, ownerSubject: record.ownerSubject, redirectsJson: "bad" });
  await assert.rejects(store.get(record.id), /Malformed/);
});
test("rejects invalid configuration and incomplete injected adapters", () => {
  assert.throws(() => createAppwriteApplicationStore({ endpoint: "http://unsafe/v1" }), /Invalid/);
  assert.throws(() => createAppwriteApplicationStore({ databaseId: "spark", tableId: "apps", tablesDB: {} }), /Complete/);
});
test("refuses malformed or excessive listings", async () => {
  const { store, rows } = setup();
  for (let i = 0; i < 101; i++) rows.set("app_" + String(i).padStart(8, "0"), {
    $id: "app_" + String(i).padStart(8, "0"), ownerSubject: record.ownerSubject, name: "App", type: "web",
    status: "pending", redirectsJson: "[]"
  });
  await assert.rejects(store.listByOwner(record.ownerSubject), /limit exceeded/);
});
