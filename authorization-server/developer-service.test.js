"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createDeveloperService } = require("./developer-service");
test("requires an independent verified authentication adapter", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spark-id-service-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = createDeveloperService({ directory, authenticate: async token =>
    token === "test-owner-a" ? { verified:true, subject:"owner_a" } :
    token === "test-owner-b" ? { verified:true, subject:"owner_b" } : null
  });
  const application = {name:"Pilot App",redirectUris:["https://example.com/cb"]};
  await assert.rejects(service.register("invalid",application), /Unauthenticated/);
  await assert.rejects(service.register({subject:"owner_a",verified:true},application), /Invalid credential/);
  const created = await service.register("test-owner-a", { ...application, ownerId:"owner_b" });
  assert.equal(created.ownerId,"owner_a");
  assert.equal((await service.get("test-owner-a",created.clientId)).clientId,created.clientId);
  assert.equal(await service.get("test-owner-b",created.clientId),null);
  await assert.rejects(service.get("invalid",created.clientId), /Unauthenticated/);
});
test("rejects adapters that return unverified or invalid identities", async () => {
  const application = {name:"Pilot App",redirectUris:["https://example.com/cb"]};
  for (const principal of [{subject:"owner_a"}, {verified:false,subject:"owner_a"}, {verified:true,subject:"../bad"}]) {
    const service = createDeveloperService({directory:"unused",authenticate:async()=>principal});
    await assert.rejects(service.register("credential",application),/Unauthenticated/);
  }
  assert.throws(()=>createDeveloperService({directory:"unused"}),/adapter required/);
});
