"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppwriteApprovalLookup } = require("./appwrite-approval-store");

const config = {
  databaseId: "spark_id",
  tableId: "developer_approvals"
};

function setup(rows, overrides = {}) {
  const calls = [];

  const tablesDB = {
    async listRows(args) {
      calls.push(args);

      if (overrides.error) throw overrides.error;

      return typeof rows === "function" ? rows(args) : { rows };
    }
  };

  const lookup = createAppwriteApprovalLookup({
    ...config,
    tablesDB,
    queryEqual: (attribute, value) => ({ attribute, value })
  });

  return { lookup, calls };
}

test("looks up approval by the authenticated subject", async () => {
  const { lookup, calls } = setup([
    { subject: "developer_123", status: "approved", enabled: true, extra: "ignored" }
  ]);

  assert.deepEqual(await lookup("developer_123"), {
    subject: "developer_123",
    status: "approved",
    enabled: true
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].databaseId, "spark_id");
  assert.equal(calls[0].tableId, "developer_approvals");
  assert.deepEqual(calls[0].queries, [
    { attribute: "subject", value: "developer_123" }
  ]);
});

test("returns null for missing or duplicate approval records", async () => {
  assert.equal((await setup([]).lookup("developer_123")), null);

  assert.equal(
    (await setup([
      { subject: "developer_123", status: "approved", enabled: true },
      { subject: "developer_123", status: "approved", enabled: true }
    ]).lookup("developer_123")),
    null
  );
});

test("rejects mismatched and malformed approval records", async () => {
  const invalidRows = [
    [{ subject: "someone_else", status: "approved", enabled: true }],
    [{ subject: "developer_123", status: "approved", enabled: "true" }],
    [{ subject: "developer_123", status: "approved" }],
    [{ subject: "developer_123", status: "unknown", enabled: true }],
    [null]
  ];

  for (const rows of invalidRows) {
    assert.equal(await setup(rows).lookup("developer_123"), null);
  }
});

test("pending, revoked, and disabled records cannot qualify as approved", async () => {
  for (const row of [
    { subject: "developer_123", status: "pending", enabled: true },
    { subject: "developer_123", status: "revoked", enabled: true },
    { subject: "developer_123", status: "approved", enabled: false }
  ]) {
    const approval = await setup([row]).lookup("developer_123");

    assert.notEqual(
      approval && approval.status === "approved" && approval.enabled === true,
      true
    );
  }
});

test("does not query the database for malformed subjects", async () => {
  const { lookup, calls } = setup([]);

  assert.equal(await lookup("../other-user"), null);
  assert.equal(await lookup(""), null);
  assert.equal(await lookup(null), null);
  assert.equal(calls.length, 0);
});

test("propagates storage errors so the policy can fail closed", async () => {
  const { lookup } = setup([], { error: new Error("database unavailable") });

  await assert.rejects(lookup("developer_123"), /database unavailable/);
});

test("requires valid database configuration and paired test adapters", () => {
  assert.throws(
    () => createAppwriteApprovalLookup({ databaseId: "", tableId: "developer_approvals" }),
    /database and table IDs/
  );

  assert.throws(
    () => createAppwriteApprovalLookup({
      ...config,
      tablesDB: { listRows: async () => ({ rows: [] }) }
    }),
    /Both database and query adapters/
  );

  assert.throws(
    () => createAppwriteApprovalLookup({
      ...config,
      endpoint: "http://localhost/v1",
      tablesDB: { listRows: async () => ({ rows: [] }) },
      queryEqual: () => ({})
    }),
    /Invalid Appwrite endpoint/
  );
});
