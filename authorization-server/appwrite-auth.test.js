"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppwriteAuthenticator } = require("./appwrite-auth");
const JWT = ["a".repeat(24),"b".repeat(24),"c".repeat(24)].join(".");
test("validates JWT against Appwrite account on every call", async () => {
  let calls=0;
  const authenticate=createAppwriteAuthenticator({fetchImpl:async (url,options)=>{
    calls++;
    assert.equal(url,"https://fra.cloud.appwrite.io/v1/account");
    assert.equal(options.headers["X-Appwrite-JWT"],JWT);
    assert.equal(options.headers["X-Appwrite-Project"],"6accc223002dbb161c74");
    assert.equal(options.redirect,"error");
    return {ok:true,json:async()=>({$id:"developer_123",status:true})};
  }});
  assert.deepEqual(await authenticate(JWT),{verified:true,subject:"developer_123"});
  assert.equal(calls,1);
});
test("rejects invalid credentials before network request", async()=>{
  const authenticate=createAppwriteAuthenticator({fetchImpl:async()=>{throw Error("must not call");}});
  assert.equal(await authenticate("owner_one"),null);
  assert.equal(await authenticate({subject:"owner_one"}),null);
});
test("fails closed on rejection, network error, inactive or malformed account",async()=>{
  for (const response of [{ok:false,status:401},{ok:true,json:async()=>({$id:"user_123",status:false})},{ok:true,json:async()=>({$id:"../bad",status:true})}]) {
    const authenticate=createAppwriteAuthenticator({fetchImpl:async()=>response});
    assert.equal(await authenticate(JWT),null);
  }
  const authenticate=createAppwriteAuthenticator({fetchImpl:async()=>{throw Error("offline");}});
  assert.equal(await authenticate(JWT),null);
});
test("rejects insecure configuration",()=>{
  assert.throws(()=>createAppwriteAuthenticator({endpoint:"http://localhost/v1"}));
  assert.throws(()=>createAppwriteAuthenticator({endpoint:"https://example.com/v1?key=abc"}));
});
