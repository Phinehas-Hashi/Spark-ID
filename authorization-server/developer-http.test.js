"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createDeveloperHttpHandler } = require("./developer-http");
const subject = "developer_123";
async function call(handler, method, url, auth, payload, contentType = "application/json") {
  const req = Readable.from(payload === undefined ? [] : [typeof payload === "string" ? payload : JSON.stringify(payload)]);
  req.method = method; req.url = url;
  req.headers = { authorization: auth, "content-type": contentType };
  const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(data) { this.data = JSON.parse(data); } };
  await handler(req, res);
  return res;
}
test("developer HTTP requires a verified and independently approved owner", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spark-http-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let approved = true;
  const handler = createDeveloperHttpHandler({
    directory: dir,
    authenticate: async token => token === "aaa.bbb.ccc" ? { verified: true, subject } : null,
    lookupApproval: async id => approved ? { subject: id, status: "approved", enabled: true } : null
  });
  const token = "Bearer aaa.bbb.ccc";
  assert.equal((await call(handler, "POST", "/internal/developer/apps", null, {})).status, 401);
  assert.equal((await call(handler, "POST", "/internal/developer/apps", "Bearer bad", {})).status, 401);
  assert.equal((await call(handler, "POST", "/internal/developer/apps", "Bearer zzz.yyy.xxx", {})).status, 403);
  const input = { name: "Test App", redirectUris: ["https://example.com/callback"] };
  const created = await call(handler, "POST", "/internal/developer/apps", token, input);
  assert.equal(created.status, 201);
  assert.match(created.data.clientId, /^sid_[0-9a-f]{32}$/);
  assert.equal(created.data.status, "pending_review");
  const own = await call(handler, "GET", "/internal/developer/apps/" + created.data.clientId, token);
  assert.equal(own.status, 200);
  approved = false;
  assert.equal((await call(handler, "GET", "/internal/developer/apps/" + created.data.clientId, token)).status, 403);
  assert.equal((await call(handler, "POST", "/internal/developer/apps", token, input)).status, 403);
  assert.equal((await call(handler, "GET", "/internal/developer/apps?ownerId=" + subject, token)).status, 404);
});
