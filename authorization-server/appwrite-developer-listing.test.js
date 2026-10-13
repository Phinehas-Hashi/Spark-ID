"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppwriteDeveloperListing } = require("./appwrite-developer-listing");
const token = "long-test-credential-123456789";
const subject = "developer_123";
function setup({ principal = { verified: true, subject }, approval = { subject, status: "approved", enabled: true }, rows = [{ id: "application_123", ownerSubject: subject, name: "Demo", type: "web", redirects: ["https://example.org/cb"], status: "pending" }] } = {}) {
  let reads = 0;
  const list = createAppwriteDeveloperListing({
    auth: async () => principal, approvals: { get: async () => approval },
    applications: { listByOwner: async owner => { reads++; assert.equal(owner, subject); return rows; } }
  });
  return { list, reads: () => reads };
}
test("approved Appwrite subject lists only own projected apps", async () => {
  const f = setup();
  assert.deepEqual(await f.list(token), [{ id: "application_123", name: "Demo", type: "web", redirects: ["https://example.org/cb"], status: "pending" }]);
  assert.equal(f.reads(), 1);
});
test("missing, pending or inconsistent authority denies before app read", async () => {
  for (const approval of [null, { subject, status: "pending", enabled: false }, { subject, status: "approved", enabled: false }]) {
    const f = setup({ approval });
    await assert.rejects(f.list(token), /denied/);
    assert.equal(f.reads(), 0);
  }
});
test("unverified authentication denies before app read", async () => {
  const f = setup({ principal: { verified: false, subject } });
  await assert.rejects(f.list(token), /denied/);
  assert.equal(f.reads(), 0);
});
test("cross-owner application rows fail closed", async () => {
  const f = setup({ rows: [{ id: "application_123", ownerSubject: "another_owner" }] });
  await assert.rejects(f.list(token), /Invalid application store/);
});
test("requires application adapter", () => {
  assert.throws(() => createAppwriteDeveloperListing({ auth: async () => {}, approvals: { get: async () => {} } }), /adapters required/);
});

test("pending, revoked and disabled developer denials carry policy code", async () => {
  for (const approval of [null, { subject, status: "pending", enabled: false },
    { subject, status: "revoked", enabled: false }, { subject, status: "approved", enabled: false }]) {
    const f = setup({ approval });
    await assert.rejects(f.list(token), error => error.code === "DEVELOPER_ACCESS_DENIED");
    assert.equal(f.reads(), 0);
  }
});
test("authority outages are not disguised as policy denials", async () => {
  const list = createAppwriteDeveloperListing({
    auth: async () => ({ verified: true, subject }),
    approvals: { get: async () => { throw new Error("storage outage"); } },
    applications: { listByOwner: async () => { throw new Error("must not read"); } }
  });
  await assert.rejects(list(token), error => error.message === "storage outage" && error.code !== "DEVELOPER_ACCESS_DENIED");
});
