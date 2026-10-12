"use strict";
const { randomUUID } = require("node:crypto");
const ID = /^[A-Za-z0-9_-]{3,128}$/;
const TABLE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

// Server-only adapter. TablesDB uses a privileged key; never bundle in a client.
function createAppwriteApplicationStore({
  endpoint = process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1",
  projectId = process.env.APPWRITE_PROJECT_ID || "6accc223002dbb161c74",
  apiKey = process.env.APPWRITE_API_KEY,
  databaseId = process.env.APPWRITE_DATABASE_ID,
  tableId = process.env.APPWRITE_APPLICATIONS_TABLE_ID,
  tablesDB, queryEqual
} = {}) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error("Invalid Appwrite endpoint"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/v1" ||
      typeof projectId !== "string" || !projectId.trim() || !TABLE.test(databaseId || "") || !TABLE.test(tableId || ""))
    throw new Error("Invalid application store configuration");
  const injected = tablesDB !== undefined || queryEqual !== undefined;
  if (injected) {
    if (!tablesDB || !["getRow", "createRow", "listRows", "updateRow"].every(key => typeof tablesDB[key] === "function") || typeof queryEqual !== "function")
      throw new Error("Complete database and query adapters required");
  } else {
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Server-side Appwrite API key required");
    const { Client, TablesDB, Query } = require("node-appwrite");
    tablesDB = new TablesDB(new Client().setEndpoint(url.origin + "/v1").setProject(projectId).setKey(apiKey));
    queryEqual = Query.equal;
  }
  const config = { databaseId, tableId };
  function project(row) {
    if (!row || !ID.test(row.$id || "") || !ID.test(row.ownerSubject || "") ||
        typeof row.name !== "string" || !["web", "native", "confidential"].includes(row.type) ||
        !["pending", "approved", "revoked"].includes(row.status)) throw new Error("Malformed application record");
    let redirects;
    try { redirects = JSON.parse(row.redirectsJson); } catch { throw new Error("Malformed application redirects"); }
    if (!Array.isArray(redirects) || redirects.some(uri => typeof uri !== "string")) throw new Error("Malformed application redirects");
    return { id: row.$id, ownerSubject: row.ownerSubject, name: row.name, type: row.type, status: row.status,
      redirects, createdAt: row.createdAt };
  }
  return Object.freeze({
    async create(record) {
      if (!record || !ID.test(record.id || "") || !ID.test(record.ownerSubject || "") || record.status !== "pending" ||
          !Array.isArray(record.redirects)) throw new Error("Invalid application record");
      const row = await tablesDB.createRow({ ...config, rowId: record.id, data: {
        ownerSubject: record.ownerSubject, name: record.name, type: record.type, status: "pending",
        redirectsJson: JSON.stringify(record.redirects), createdAt: record.createdAt
      }, permissions: [] });
      return project(row);
    },
    async get(id) {
      if (!ID.test(id || "")) return null;
      try { return project(await tablesDB.getRow({ ...config, rowId: id })); }
      catch (error) { if (error && error.code === 404) return null; throw error; }
    },
    async listByOwner(subject) {
      if (!ID.test(subject || "")) throw new Error("Invalid owner");
      const rows = [];
      let offset = 0;
      do {
        const page = await tablesDB.listRows({ ...config, queries: [queryEqual("ownerSubject", subject), `limit(100)`, `offset(${offset})`], total: false });
        if (!page || !Array.isArray(page.rows) || page.rows.length > 100) throw new Error("Malformed application listing");
        rows.push(...page.rows.map(project));
        if (page.rows.length < 100) break;
        offset += 100;
        if (offset >= 1000) throw new Error("Application listing limit exceeded");
      } while (true);
      if (rows.some(row => row.ownerSubject !== subject)) throw new Error("Owner mismatch");
      return rows;
    },
    async update(id, changes) {
      if (!ID.test(id || "") || !changes || !Array.isArray(changes.redirects) || changes.status !== "pending")
        throw new Error("Invalid application update");
      const row = await tablesDB.updateRow({ ...config, rowId: id, data: { redirectsJson: JSON.stringify(changes.redirects), status: "pending" } });
      return project(row);
    }
  });
}
module.exports = { createAppwriteApplicationStore };
