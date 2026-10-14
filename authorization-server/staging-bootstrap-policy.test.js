"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateStagingBootstrap } = require("./staging-bootstrap-policy");

const valid = Object.freeze({
  endpoint: "https://fra.cloud.appwrite.io/v1",
  projectId: "6ace02c3002acdb7604d",
  confirmedProjectId: "6ace02c3002acdb7604d",
  administratorSubject: "separate_admin_123",
  developerSubject: "developer_test_123",
  initialStatus: "pending",
  enabled: false
});

test("permits only an isolated pending disabled staging fixture", () => {
  const result = validateStagingBootstrap(valid);
  assert.equal(result.status, "pending");
  assert.equal(result.enabled, false);
  assert.equal(result.developerSubject, valid.developerSubject);
  assert.equal(Object.isFrozen(result), true);
});

test("rejects production and missing staging confirmation", () => {
  assert.throws(() => validateStagingBootstrap({
    ...valid,
    projectId: "6accc223002dbb161c74"
  }));
  assert.throws(() => validateStagingBootstrap({
    ...valid,
    confirmedProjectId: undefined
  }));
});

test("rejects self-approval and invalid identities", () => {
  assert.throws(() => validateStagingBootstrap({
    ...valid,
    administratorSubject: valid.developerSubject
  }));
  assert.throws(() => validateStagingBootstrap({
    ...valid,
    developerSubject: "invalid subject!"
  }));
});

test("rejects pre-approved or enabled bootstrap records", () => {
  assert.throws(() => validateStagingBootstrap({
    ...valid,
    initialStatus: "approved"
  }));
  assert.throws(() => validateStagingBootstrap({
    ...valid,
    enabled: true
  }));
});

test("rejects unexpected endpoints", () => {
  assert.throws(() => validateStagingBootstrap({
    ...valid,
    endpoint: "https://example.com/v1"
  }));
});
