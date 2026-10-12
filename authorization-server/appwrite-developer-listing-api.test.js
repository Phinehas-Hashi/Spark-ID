"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppwriteDeveloperListingApi } = require("./appwrite-developer-listing-api");
const TOKEN = "valid-test-credential-long-enough";
async function send(method, url, authorization, list = async () => []) {
  let calls = 0;
  const handler = createAppwriteDeveloperListingApi({ list: async credential => { calls++; return list(credential); } });
  const req = { method, url, headers: authorization ? { authorization } : {} };
  const res = { setHeader(name, value) { this[name] = value; }, writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.body = JSON.parse(value); } };
  await handler(req, res);
  return { res, calls };
}
test("read-only listing returns no-store and forwards bearer credential", async () => {
  const { res, calls } = await send("GET", "/v1/developer/apps", "Bearer " + TOKEN, async token => {
    assert.equal(token, TOKEN); return [{ id: "app_12345678" }];
  });
  assert.equal(res.status, 200); assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(res.body.applications, [{ id: "app_12345678" }]); assert.equal(calls, 1);
});
test("anonymous and malformed bearer requests do not reach listing", async () => {
  for (const authorization of [undefined, "Bearer short", "Basic " + TOKEN]) {
    const { res, calls } = await send("GET", "/v1/developer/apps", authorization);
    assert.equal(res.status, 401); assert.equal(calls, 0);
  }
});
test("write methods are unavailable on read-only route", async () => {
  for (const method of ["POST", "PUT", "DELETE"]) {
    const { res, calls } = await send(method, "/v1/developer/apps", "Bearer " + TOKEN);
    assert.equal(res.status, 405); assert.equal(res.Allow, "GET"); assert.equal(calls, 0);
  }
});
test("query strings and unrelated routes are not accepted", async () => {
  for (const url of ["/v1/developer/apps?token=secret", "/v1/developer/other"]) {
    const { res, calls } = await send("GET", url, "Bearer " + TOKEN);
    assert.equal(res.status, 404); assert.equal(calls, 0);
  }
});
test("listing failure does not leak internal details", async () => {
  const { res } = await send("GET", "/v1/developer/apps", "Bearer " + TOKEN, async () => { throw new Error("private database secret"); });
  assert.equal(res.status, 503); assert.equal(JSON.stringify(res.body).includes("secret"), false);
});
