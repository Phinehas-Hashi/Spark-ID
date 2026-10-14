"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createDeveloperApi } = require("./developer-api");
const TOKEN = "a-long-enough-test-credential";
function setup() {
  const calls = [];
  const handler = createDeveloperApi({ workspace: {
    list: async credential => { calls.push(["list", credential]); return []; },
    register: async (credential, body) => { calls.push(["register", credential, body]); return { id: "app_test_123", status: "pending" }; },
    replaceRedirects: async (credential, id, redirects) => { calls.push(["update", credential, id, redirects]); return { id, status: "pending" }; }
  } });
  async function send(method, url, body, headers = {}) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8")]);
    req.method = method; req.url = url; req.headers = headers;
    const res = { setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(data) { this.body = JSON.parse(data); } };
    await handler(req, res);
    return res;
  }
  return { send, calls };
}
test("rejects anonymous access without calling workspace", async () => {
  const { send, calls } = setup();
  assert.equal((await send("GET", "/v1/developer/apps")).status, 401);
  assert.equal(calls.length, 0);
});
test("lists authenticated developer applications without cache", async () => {
  const { send, calls } = setup();
  const res = await send("GET", "/v1/developer/apps", undefined, { authorization: "Bearer " + TOKEN });
  assert.equal(res.status, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(calls[0], ["list", TOKEN]);
});
test("registers JSON app and routes redirect changes to workspace", async () => {
  const { send, calls } = setup();
  const headers = { authorization: "Bearer " + TOKEN, "content-type": "application/json" };
  assert.equal((await send("POST", "/v1/developer/apps", { name: "Spark Studio", type: "web", redirects: ["https://example.com/cb"] }, headers)).status, 201);
  assert.equal((await send("PUT", "/v1/developer/apps/app_test_123/redirects", { redirects: ["https://example.com/new"] }, headers)).status, 200);
  assert.equal(calls[1][0], "update");
});
test("rejects invalid routes, methods, content and unexpected fields", async () => {
  const { send, calls } = setup();
  const auth = { authorization: "Bearer " + TOKEN };
  assert.equal((await send("GET", "/v1/developer/apps?token=secret", undefined, auth)).status, 400);
  assert.equal((await send("DELETE", "/v1/developer/apps", undefined, auth)).status, 405);
  assert.equal((await send("POST", "/v1/developer/apps", {}, auth)).status, 415);
  assert.equal((await send("POST", "/v1/developer/apps", "{", { ...auth, "content-type": "application/json" })).status, 400);
  assert.equal((await send("POST", "/v1/developer/apps", { role: "admin" }, { ...auth, "content-type": "application/json" })).status, 400);
  assert.equal(calls.length, 0);
});
test("does not leak internal errors", async () => {
  const handler = createDeveloperApi({ workspace: {
    list: async () => { throw new Error("private database details"); },
    register: async () => {}, replaceRedirects: async () => {}
  } });
  const req = Readable.from([]); req.method = "GET"; req.url = "/v1/developer/apps"; req.headers = { authorization: "Bearer " + TOKEN };
  const res = { setHeader() {}, writeHead(status) { this.status = status; }, end(data) { this.body = JSON.parse(data); } };
  await handler(req, res);
  assert.equal(res.status, 503);
  assert.equal(JSON.stringify(res.body).includes("database"), false);
});
test("rejects browser-origin credentials before calling workspace", async () => {
  const { send, calls } = setup();
  const res = await send("GET", "/v1/developer/apps", undefined, {
    authorization: "Bearer " + TOKEN, origin: "https://untrusted.example"
  });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});
