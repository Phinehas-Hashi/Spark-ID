"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApprovedDeveloperService } = require("./access-control");
const app = { name:"Demo Client", redirectUris:["https://example.com/callback"] };
test("only independently approved developers can register and read their own apps", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),"spark-id-access-"));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const approvals = new Map([["owner_a",{subject:"owner_a",status:"approved",enabled:true}],["owner_b",{subject:"owner_b",status:"pending",enabled:true}]]);
  const service = createApprovedDeveloperService({
    directory,
    authenticate: async credential => credential === "token-a" ? {verified:true,subject:"owner_a"} : credential === "token-b" ? {verified:true,subject:"owner_b"} : null,
    lookupApproval: async subject => approvals.get(subject)
  });
  await assert.rejects(service.register("token-b",app),/Unauthenticated/);
  await assert.rejects(service.register("bad",app),/Unauthenticated/);
  const created = await service.register("token-a",{...app,ownerId:"owner_b",status:"approved"});
  assert.equal(created.ownerId,"owner_a");
  assert.equal(created.status,"pending_review");
  assert.equal((await service.get("token-a",created.clientId)).clientId,created.clientId);
  approvals.set("owner_a",{subject:"owner_a",status:"revoked",enabled:false});
  await assert.rejects(service.get("token-a",created.clientId),/Unauthenticated/);
});
test("fails closed for mismatched, malformed, and unavailable approval records",async()=>{
  for (const lookupApproval of [
    async()=>({subject:"another_user",status:"approved",enabled:true}),
    async()=>({subject:"owner_a",status:"approved",enabled:"true"}),
    async()=>{throw Error("storage offline");}
  ]) {
    const service=createApprovedDeveloperService({directory:"unused",authenticate:async()=>({verified:true,subject:"owner_a"}),lookupApproval});
    await assert.rejects(service.register("token-a",app),/Unauthenticated/);
  }
  assert.throws(()=>createApprovedDeveloperService({directory:"unused",authenticate:async()=>null}),/approval adapters required/);
});
