"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { validateRedirectUri, validateRegistration, validatePkce, verifyPkce, validateScopes } = require("./validation");
test("accepts canonical HTTPS redirects", () => assert.equal(validateRedirectUri("https://example.com/auth/callback"), "https://example.com/auth/callback"));
for (const uri of ["http://example.com/cb", "https://example.com/cb#fragment", "https://example.com/cb?code=abc", "https://user:pass@example.com/cb", "https://example.com:443/cb", "https://example.com./cb", "https://localhost/cb", "javascript:alert(1)", "https://example.com/a b"]) {
  test("rejects unsafe or noncanonical redirect: " + uri, () => assert.throws(() => validateRedirectUri(uri)));
}
test("loopback opt-in is explicit", () => {
  assert.throws(() => validateRedirectUri("http://127.0.0.1:4567/cb"));
  assert.equal(validateRedirectUri("http://127.0.0.1:4567/cb", {allowLoopback:true}), "http://127.0.0.1:4567/cb");
});
test("validates registration and duplicate URIs", () => {
  assert.equal(validateRegistration({name:"Example App",redirectUris:["https://example.com/cb"]}).name, "Example App");
  assert.throws(() => validateRegistration({name:"Example",redirectUris:["https://example.com/cb","https://example.com/cb"]}));
});
test("PKCE S256 verifier checks", () => {
  const verifier = "a".repeat(43);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  assert.equal(validatePkce({challenge,method:"S256"}),challenge);
  assert.equal(verifyPkce(verifier,challenge),true);
  assert.equal(verifyPkce("b".repeat(43),challenge),false);
  assert.throws(() => validatePkce({challenge,method:"plain"}));
});
test("scopes are allowlisted", () => {
  assert.deepEqual(validateScopes(["openid","email"]),["openid","email"]);
  assert.throws(() => validateScopes(["admin"]));
  assert.throws(() => validateScopes(["openid","openid"]));
});
