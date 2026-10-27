"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createOidcHandoffApi } = require("./oidc-handoff-api");

function request({ url, method = "POST", body, headers = {} }) {
  const req = Readable.from([JSON.stringify(body)]);
  req.url = url;
  req.method = method;
  req.headers = { "content-type": "application/json", ...headers };
  return req;
}

function response() {
  return {
    headers: null,
    status: null,
    body: "",
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = "") { this.body = body; },
  };
}

test("returns no-store request details for a valid opaque ticket", async () => {
  const handoffs = {
    async details(ticket) { return ticket === "a".repeat(43) ? { clientName: "Spark Studio", scopes: ["openid"] } : null; },
    async approve() { throw new Error("not used"); },
    async deny() { throw new Error("not used"); },
  };
  const res = response();
  await createOidcHandoffApi({ handoffs })(request({
    url: "/internal/oidc/handoff/details",
    body: { ticket: "a".repeat(43) },
  }), res);
  assert.equal(res.status, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(JSON.parse(res.body), { clientName: "Spark Studio", scopes: ["openid"] });
});

test("approval forwards the Appwrite JWT only to the trusted service and rejects browser origins", async () => {
  let approved = null;
  const handoffs = {
    async details() { return null; },
    async approve(input) { approved = input; },
    async deny() { return false; },
  };
  const api = createOidcHandoffApi({ handoffs });
  const res = response();
  await api(request({
    url: "/internal/oidc/handoff/approve",
    body: { ticket: "b".repeat(43) },
    headers: { "x-spark-id-jwt": "opaque-appwrite-jwt" },
  }), res);
  assert.equal(res.status, 200);
  assert.deepEqual(approved, { ticket: "b".repeat(43), appwriteJwt: "opaque-appwrite-jwt" });

  const blocked = response();
  await api(request({
    url: "/internal/oidc/handoff/approve",
    body: { ticket: "b".repeat(43) },
    headers: { origin: "https://untrusted.example", "x-spark-id-jwt": "opaque-appwrite-jwt" },
  }), blocked);
  assert.equal(blocked.status, 403);
  assert.equal(approved.ticket, "b".repeat(43));
});

test("rejects extra request fields and denies without exposing service errors", async () => {
  const handoffs = {
    async details() { return null; },
    async approve() { throw new Error("private database detail"); },
    async deny(ticket) { return ticket === "c".repeat(43); },
  };
  const api = createOidcHandoffApi({ handoffs });
  const malformed = response();
  await api(request({ url: "/internal/oidc/handoff/details", body: { ticket: "c".repeat(43), extra: true } }), malformed);
  assert.equal(malformed.status, 400);

  const denied = response();
  await api(request({ url: "/internal/oidc/handoff/deny", body: { ticket: "c".repeat(43) } }), denied);
  assert.equal(denied.status, 200);
  assert.deepEqual(JSON.parse(denied.body), { denied: true });

  const failure = response();
  await api(request({
    url: "/internal/oidc/handoff/approve",
    body: { ticket: "c".repeat(43) },
    headers: { "x-spark-id-jwt": "opaque-appwrite-jwt" },
  }), failure);
  assert.equal(failure.status, 503);
  assert.doesNotMatch(failure.body, /private database detail/);
});
