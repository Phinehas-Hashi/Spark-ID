"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createRegistration, getOwnedRegistration } = require("./registry");
test("creates a pending-review registration and persists it privately", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spark-id-registry-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const created = await createRegistration(dir, "owner_one", {name:"Demo Client",redirectUris:["https://example.com/callback"]});
  assert.match(created.clientId, /^sid_[0-9a-f]{32}$/);
  assert.equal(created.status, "pending_review");
  assert.deepEqual((await getOwnedRegistration(dir, "owner_one", created.clientId)).redirectUris, ["https://example.com/callback"]);
  assert.equal(await getOwnedRegistration(dir, "owner_two", created.clientId), null);
  const stat = await fs.stat(path.join(dir, created.clientId + ".json"));
  if (process.platform !== "win32") assert.equal(stat.mode & 0o777, 0o600);
});
test("rejects malformed ownership, registration and client IDs", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spark-id-registry-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await assert.rejects(createRegistration(dir, "../bad", {name:"Demo",redirectUris:["https://example.com/cb"]}));
  await assert.rejects(createRegistration(dir, "owner_one", {name:"Demo",redirectUris:["http://example.com/cb"]}));
  await assert.rejects(getOwnedRegistration(dir, "owner_one", "../../outside"));
});
test("generates distinct public identifiers", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spark-id-registry-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = {name:"Demo",redirectUris:["https://example.com/cb"]};
  const [a,b] = await Promise.all([createRegistration(dir,"owner_one",input),createRegistration(dir,"owner_one",input)]);
  assert.notEqual(a.clientId,b.clientId);
});
