"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createStagingBootstrapPreflight } = require("./staging-bootstrap-preflight");
const input = { credential: "x".repeat(30), endpoint: "https://fra.cloud.appwrite.io/v1",
  projectId: "6ace02c3002acdb7604d", confirmedProjectId: "6ace02c3002acdb7604d", developerSubject: "developer_123" };
const admin = "administrator_123";
const make = (authenticate = async () => ({ verified: true, subject: admin }), listApprovalRows = async () => []) =>
  createStagingBootstrapPreflight({ authenticate, listApprovalRows, administratorSubject: admin });
test("verified separate administrator receives read-only pending plan", async () => {
  let calls = 0;
  const result = await make(undefined, async (subject, limit) => { calls++; assert.equal(subject, input.developerSubject); assert.equal(limit, 2); return []; }).inspect(input);
  assert.equal(calls, 1); assert.equal(result.status, "pending"); assert.equal(result.enabled, false);
  assert.equal(result.writePerformed, false); assert.equal(result.eligibleForSeparateReview, true);
});
test("rejects unauthenticated, wrong and self-targeting administrators before lookup", async () => {
  let calls = 0; const lookup = async () => { calls++; return []; };
  await assert.rejects(make(async () => null, lookup).inspect(input));
  await assert.rejects(make(async () => ({ verified: true, subject: "other_admin" }), lookup).inspect(input));
  await assert.rejects(make(undefined, lookup).inspect({ ...input, developerSubject: admin }));
  assert.equal(calls, 0);
});
test("rejects existing and ambiguous rows and storage failure", async () => {
  for (const rows of [[{ status: "pending" }], [{}, {}], null])
    await assert.rejects(make(undefined, async () => rows).inspect(input));
  await assert.rejects(make(undefined, async () => { throw Error("offline"); }).inspect(input));
});
test("rejects production and forged approved bootstrap", async () => {
  await assert.rejects(make().inspect({ ...input, projectId: "6accc223002dbb161c74" }));
  assert.throws(() => createStagingBootstrapPreflight({ administratorSubject: admin }));
});
