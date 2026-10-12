"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminAuthorizer } = require("./admin-access");

const ADMIN_ID = "6accc331003881f2cb4a";
const OTHER_ID = "developer_123";
const CREDENTIAL = "test-credential-that-is-long-enough";

test("recognizes only the independently verified bootstrap administrator", async () => {
  const isAdmin = createAdminAuthorizer({
    adminUserId: ADMIN_ID,
    authenticate: async () => ({
      verified: true,
      subject: ADMIN_ID
    })
  });

  assert.equal(await isAdmin(CREDENTIAL), true);
});

test("rejects a different verified user", async () => {
  const isAdmin = createAdminAuthorizer({
    adminUserId: ADMIN_ID,
    authenticate: async () => ({
      verified: true,
      subject: OTHER_ID
    })
  });

  assert.equal(await isAdmin(CREDENTIAL), false);
});

test("rejects unverified and malformed identities", async () => {
  for (const principal of [
    { verified: false, subject: ADMIN_ID },
    { verified: true, subject: "../admin" },
    { verified: true, subject: ADMIN_ID + "extra" },
    null
  ]) {
    const isAdmin = createAdminAuthorizer({
      adminUserId: ADMIN_ID,
      authenticate: async () => principal
    });

    assert.equal(await isAdmin(CREDENTIAL), false);
  }
});

test("fails closed when authentication throws", async () => {
  const isAdmin = createAdminAuthorizer({
    adminUserId: ADMIN_ID,
    authenticate: async () => {
      throw new Error("authentication unavailable");
    }
  });

  assert.equal(await isAdmin(CREDENTIAL), false);
});

test("rejects malformed credentials without authenticating", async () => {
  let calls = 0;

  const isAdmin = createAdminAuthorizer({
    adminUserId: ADMIN_ID,
    authenticate: async () => {
      calls++;
      return { verified: true, subject: ADMIN_ID };
    }
  });

  assert.equal(await isAdmin("short"), false);
  assert.equal(await isAdmin({ subject: ADMIN_ID }), false);
  assert.equal(calls, 0);
});

test("requires a valid administrator ID and authentication adapter", () => {
  assert.throws(() => createAdminAuthorizer({ adminUserId: ADMIN_ID }));
  assert.throws(() => createAdminAuthorizer({
    authenticate: async () => null,
    adminUserId: "../admin"
  }));
});
test("uses the configured bootstrap administrator ID by default", async () => {
  const previous = process.env.SPARK_ID_BOOTSTRAP_ADMIN_USER_ID;
  process.env.SPARK_ID_BOOTSTRAP_ADMIN_USER_ID = ADMIN_ID;

  try {
    const isAdmin = createAdminAuthorizer({
      authenticate: async () => ({
        verified: true,
        subject: ADMIN_ID
      })
    });

    assert.equal(await isAdmin(CREDENTIAL), true);
  } finally {
    if (previous === undefined) {
      delete process.env.SPARK_ID_BOOTSTRAP_ADMIN_USER_ID;
    } else {
      process.env.SPARK_ID_BOOTSTRAP_ADMIN_USER_ID = previous;
    }
  }
});
