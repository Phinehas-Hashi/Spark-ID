"use strict";
// Opt-in read-only integration against an isolated Appwrite project.
// Never print credentials or account identifiers. No test data is created or changed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateListingEnvironment } = require("./listing-environment");
const { createAppwriteApplicationStore } = require("./appwrite-application-store");
const { createAppwriteDeveloperListing } = require("./appwrite-developer-listing");
const { createAppwriteAuthenticator } = require("./appwrite-auth");

const enabled = process.env.SPARK_ID_RUN_APPWRITE_INTEGRATION === "true";
test("isolated Appwrite: verified approved owner can list only their applications", { skip: !enabled && "Requires explicit isolated Appwrite opt-in" }, async () => {
  assert.equal(process.env.SPARK_ID_ISOLATED_APPWRITE_PROJECT, "true",
    "Explicit isolated-project confirmation required");
  validateListingEnvironment();
  const jwt = process.env.SPARK_ID_TEST_FIRST_PARTY_JWT;
  const subject = process.env.SPARK_ID_TEST_APPROVED_SUBJECT;
  assert.ok(typeof jwt === "string" && jwt.length >= 20, "Local test JWT required");
  assert.match(subject || "", /^[A-Za-z0-9_-]{3,128}$/, "Approved test subject required");
  const principal = await createAppwriteAuthenticator()(jwt);
  assert.equal(principal && principal.subject, subject, "JWT must belong to isolated test subject");
  const applications = createAppwriteApplicationStore();
  const list = createAppwriteDeveloperListing({ applications });
  // This read-only integration validates actual authentication, authoritative approval,
  // and ownership filtering. It intentionally does not log returned application data.
  const rows = await list(jwt);
  assert.ok(Array.isArray(rows));
  const owned = await applications.listByOwner(subject);
  assert.deepEqual(rows.map(row => row.id).sort(), owned.map(row => row.id).sort());
});

test("isolated Appwrite: malformed and invalid credentials cannot list applications", { skip: !enabled && "Requires explicit isolated Appwrite opt-in" }, async () => {
  assert.equal(process.env.SPARK_ID_ISOLATED_APPWRITE_PROJECT, "true",
    "Explicit isolated-project confirmation required");
  validateListingEnvironment();
  const applications = createAppwriteApplicationStore();
  // Invalid credentials must fail before the approval or application stores are reached.
  const list = createAppwriteDeveloperListing({ applications });
  await assert.rejects(() => list("malformed"), /Authentication required/);
  const invalidJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub2JvZHkifQ.invalidsignature";
  const principal = await createAppwriteAuthenticator()(invalidJwt);
  assert.equal(principal, null, "Invalid JWT must never produce a verified principal");
  await assert.rejects(() => list(invalidJwt), error =>
    error && error.code === "DEVELOPER_ACCESS_DENIED");
});
