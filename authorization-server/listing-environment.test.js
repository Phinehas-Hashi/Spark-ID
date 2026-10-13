"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateListingEnvironment } = require("./listing-environment");
const valid = {
  APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
  APPWRITE_PROJECT_ID: "project_123",
  APPWRITE_API_KEY: "private-test-key",
  APPWRITE_DATABASE_ID: "spark_id",
  APPWRITE_APPROVALS_TABLE_ID: "developer_approvals",
  APPWRITE_APPLICATIONS_TABLE_ID: "developer_apps"
};
test("valid private listing configuration is accepted", () => {
  assert.equal(validateListingEnvironment(valid), true);
});
test("missing and placeholder secrets fail without disclosing secret values", () => {
  for (const key of Object.keys(valid)) {
    const missing = { ...valid }; delete missing[key];
    assert.throws(() => validateListingEnvironment(missing), /configuration/);
  }
  assert.throws(() => validateListingEnvironment({ ...valid, APPWRITE_API_KEY: "REPLACE_WITH_SERVER_SIDE_KEY" }), /APPWRITE_API_KEY/);
});
test("rejects insecure or ambiguous Appwrite endpoint", () => {
  for (const endpoint of ["http://fra.cloud.appwrite.io/v1", "https://user:pass@fra.cloud.appwrite.io/v1",
    "https://fra.cloud.appwrite.io/v1?key=x", "https://fra.cloud.appwrite.io/other"]) {
    assert.throws(() => validateListingEnvironment({ ...valid, APPWRITE_ENDPOINT: endpoint }), /APPWRITE_ENDPOINT/);
  }
});
test("rejects malformed table IDs and local-listing flag", () => {
  assert.throws(() => validateListingEnvironment({ ...valid, APPWRITE_APPLICATIONS_TABLE_ID: "bad/table" }), /APPWRITE_APPLICATIONS_TABLE_ID/);
  assert.throws(() => validateListingEnvironment({ ...valid, SPARK_ID_ENABLE_LOCAL_LISTING: "yes" }), /SPARK_ID_ENABLE_LOCAL_LISTING/);
});
