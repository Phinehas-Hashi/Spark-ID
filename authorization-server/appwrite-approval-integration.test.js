"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createApprovedDeveloperService } = require("./access-control");
const { createAppwriteApprovalLookup } = require("./appwrite-approval-store");

const application = {
  name: "Spark ID Test Client",
  redirectUris: ["https://example.com/callback"]
};

test("approved Appwrite database record permits registration", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spark-id-integration-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const tablesDB = {
    async listRows() {
      return {
        rows: [{ subject: "owner_123", status: "approved", enabled: true }]
      };
    }
  };

  const lookupApproval = createAppwriteApprovalLookup({
    databaseId: "spark_id",
    tableId: "developer_approvals",
    tablesDB,
    queryEqual: (attribute, value) => ({ attribute, value })
  });

  const service = createApprovedDeveloperService({
    directory,
    authenticate: async credential =>
      credential === "valid-test-credential"
        ? { verified: true, subject: "owner_123" }
        : null,
    lookupApproval
  });

  const created = await service.register("valid-test-credential", application);

  assert.equal(created.ownerId, "owner_123");
  assert.equal(created.status, "pending_review");
});

test("pending database approval blocks registration", async () => {
  const lookupApproval = createAppwriteApprovalLookup({
    databaseId: "spark_id",
    tableId: "developer_approvals",
    tablesDB: {
      async listRows() {
        return {
          rows: [{ subject: "owner_123", status: "pending", enabled: true }]
        };
      }
    },
    queryEqual: (attribute, value) => ({ attribute, value })
  });

  const service = createApprovedDeveloperService({
    directory: "unused",
    authenticate: async () => ({ verified: true, subject: "owner_123" }),
    lookupApproval
  });

  await assert.rejects(
    service.register("valid-test-credential", application),
    /Unauthenticated/
  );
});

test("database outage blocks registration", async () => {
  const lookupApproval = createAppwriteApprovalLookup({
    databaseId: "spark_id",
    tableId: "developer_approvals",
    tablesDB: {
      async listRows() {
        throw new Error("simulated database outage");
      }
    },
    queryEqual: (attribute, value) => ({ attribute, value })
  });

  const service = createApprovedDeveloperService({
    directory: "unused",
    authenticate: async () => ({ verified: true, subject: "owner_123" }),
    lookupApproval
  });

  await assert.rejects(
    service.register("valid-test-credential", application),
    /Unauthenticated/
  );
});
