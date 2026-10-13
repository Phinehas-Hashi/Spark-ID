"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuthoritativeAppwriteApprovals } = require("./authoritative-appwrite-approvals");
const SUBJECT = "developer_123";
function setup(rows) {
  return createAuthoritativeAppwriteApprovals({
    databaseId: "spark_id", tableId: "approvals", projectId: "project",
    tablesDB: { async listRows() { return { rows }; } },
    queryEqual: (field, value) => [field, value]
  });
}
test("Appwrite is the authoritative approved read source", async () => {
  const approvals = setup([{ subject: SUBJECT, status: "approved", enabled: true }]);
  assert.deepEqual(await approvals.get(SUBJECT), { subject: SUBJECT, status: "approved", enabled: true });
  assert.equal(typeof approvals.setStatus, "undefined");
});
test("pending and revoked approvals remain disabled", async () => {
  for (const status of ["pending", "revoked"]) {
    assert.deepEqual(await setup([{ subject: SUBJECT, status, enabled: false }]).get(SUBJECT),
      { subject: SUBJECT, status, enabled: false });
  }
});
test("inconsistent enabled flag fails closed", async () => {
  assert.equal(await setup([{ subject: SUBJECT, status: "pending", enabled: true }]).get(SUBJECT), null);
  assert.equal(await setup([{ subject: SUBJECT, status: "approved", enabled: false }]).get(SUBJECT), null);
});
test("ambiguous or missing approval fails closed", async () => {
  assert.equal(await setup([]).get(SUBJECT), null);
  const row = { subject: SUBJECT, status: "approved", enabled: true };
  assert.equal(await setup([row, row]).get(SUBJECT), null);
});
