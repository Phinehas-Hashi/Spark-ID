"use strict";

// Server-side, read-only lookup for trusted developer approval records.
// This module does not approve developers or expose a public endpoint.

const DEFAULT_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const DEFAULT_PROJECT = "6accc223002dbb161c74";

const ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const TABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

function createAppwriteApprovalLookup({
  endpoint = process.env.APPWRITE_ENDPOINT || DEFAULT_ENDPOINT,
  projectId = process.env.APPWRITE_PROJECT_ID || DEFAULT_PROJECT,
  apiKey = process.env.APPWRITE_API_KEY,
  databaseId = process.env.APPWRITE_DATABASE_ID,
  tableId = process.env.APPWRITE_APPROVALS_TABLE_ID,
  tablesDB,
  queryEqual
} = {}) {
  let url;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Invalid Appwrite endpoint");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/v1"
  ) {
    throw new Error("Invalid Appwrite endpoint");
  }

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("Appwrite project ID is required");
  }

  if (
    typeof databaseId !== "string" ||
    !TABLE_ID_PATTERN.test(databaseId) ||
    typeof tableId !== "string" ||
    !TABLE_ID_PATTERN.test(tableId)
  ) {
    throw new Error("Valid Appwrite database and table IDs are required");
  }

  const injected = tablesDB !== undefined || queryEqual !== undefined;

  if (injected) {
    if (
      !tablesDB ||
      typeof tablesDB.listRows !== "function" ||
      typeof queryEqual !== "function"
    ) {
      throw new Error("Both database and query adapters are required");
    }
  } else {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error("Server-side Appwrite API key is required");
    }

    const { Client, TablesDB, Query } = require("node-appwrite");

    const client = new Client()
      .setEndpoint(url.origin + "/v1")
      .setProject(projectId)
      .setKey(apiKey);

    tablesDB = new TablesDB(client);
    queryEqual = Query.equal;
  }

  return async function lookupApproval(subject) {
    // Never query for malformed identities.
    if (typeof subject !== "string" || !ID_PATTERN.test(subject)) {
      return null;
    }

    // Let storage errors propagate. The access-control layer catches them
    // and denies the operation rather than granting access.
    const result = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [queryEqual("subject", subject)],
      total: false
    });

    // Missing, malformed, or ambiguous results must not grant approval.
    if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
      return null;
    }

    const row = result.rows[0];

    if (
      !row ||
      row.subject !== subject ||
      typeof row.status !== "string" ||
      !["pending", "approved", "revoked"].includes(row.status) ||
      typeof row.enabled !== "boolean"
    ) {
      return null;
    }

    // Return only fields used by the access-control policy.
    return {
      subject: row.subject,
      status: row.status,
      enabled: row.enabled
    };
  };
}

module.exports = { createAppwriteApprovalLookup };

