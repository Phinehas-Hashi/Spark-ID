"use strict";
// One-time, create-only staging bootstrap. Never accepts production project credentials.
// Intentionally refuses existing resources rather than altering an unknown schema.
const { Client, TablesDB, IndexType } = require("node-appwrite");
const STAGING = "6ace033b0026754b7531";
const PRODUCTION = "6accc223002dbb161c74";
const env = process.env;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function check() {
  if (env.APPWRITE_PROJECT_ID !== STAGING || env.APPWRITE_PROJECT_ID === PRODUCTION ||
      env.SPARK_ID_CONFIRM_STAGING_PROVISION !== STAGING)
    throw new Error("Explicit staging project confirmation required");
  if (env.APPWRITE_ENDPOINT !== "https://fra.cloud.appwrite.io/v1")
    throw new Error("Expected staging Frankfurt Appwrite endpoint");
  if (!env.APPWRITE_PROVISIONING_KEY || env.APPWRITE_PROVISIONING_KEY.trim().length < 20)
    throw new Error("Private staging provisioning key required");
}
async function waitFor(get, description) {
  for (let i = 0; i < 60; i++) {
    const resource = await get();
    if (resource.status === "available") return;
    if (resource.status === "failed" || resource.status === "stuck") throw new Error(description + " failed");
    await sleep(1000);
  }
  throw new Error(description + " did not become available");
}
let stage = "configuration";
async function main() {
  check();
  const client = new Client().setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(STAGING).setKey(env.APPWRITE_PROVISIONING_KEY);
  const db = new TablesDB(client);
  const databaseId = "spark_id";
  // Create-only: a 409 stops execution, preventing accidental schema modification.
  stage = "create database";
  await db.create({ databaseId, name: "Spark ID", enabled: true });
  process.stdout.write("Created staging database.\n");
  const tables = [
    { tableId: "developer_approvals", name: "Developer Approvals", columns: [
      ["subject", "string", 128], ["status", "enum", ["pending", "approved", "revoked"]],
      ["enabled", "boolean"]
    ], index: ["subject_unique", "unique", ["subject"]] },
    { tableId: "developer_apps", name: "Developer Applications", columns: [
      ["ownerSubject", "string", 128], ["name", "string", 255],
      ["type", "enum", ["web", "native", "confidential"]],
      ["status", "enum", ["pending", "approved", "revoked"]],
      ["redirectsJson", "string", 4096], ["createdAt", "string", 64]
    ], index: ["owner_subject", "key", ["ownerSubject"]] }
  ];
  for (const table of tables) {
    const tableId = table.tableId;
    stage = "create table " + tableId;
    await db.createTable({ databaseId, tableId, name: table.name, permissions: [], rowSecurity: true, enabled: true });
    for (const [key, kind, value] of table.columns) {
      stage = "create column " + tableId + "." + key;
      const args = { databaseId, tableId, key, required: true };
      if (kind === "string") await db.createStringColumn({ ...args, size: value, array: false, encrypt: false });
      if (kind === "enum") await db.createEnumColumn({ ...args, elements: value, array: false });
      if (kind === "boolean") await db.createBooleanColumn({ ...args, array: false });
      await waitFor(() => db.getColumn({ databaseId, tableId, key }), tableId + "." + key);
    }
    stage = "create index " + tableId + "." + table.index[0];
    await db.createIndex({ databaseId, tableId, key: table.index[0],
      type: table.index[1] === "unique" ? IndexType.Unique : IndexType.Key,
      columns: table.index[2], orders: ["ASC"] });
    await waitFor(() => db.getIndex({ databaseId, tableId, key: table.index[0] }), tableId + " index");
    process.stdout.write("Created private table and index: " + tableId + "\n");
  }
  process.stdout.write("Staging schema created. Revoke the provisioning key now.\n");
}
main().catch(error => {
  // Print only bounded diagnostic metadata, never raw errors, headers or credentials.
  const code = Number.isInteger(error?.code) ? error.code : "none";
  const type = typeof error?.type === "string" && /^[a-z0-9_]{1,80}$/.test(error.type)
    ? error.type : "unknown";
  process.stderr.write("Provisioning stopped at: " + stage + "\n");
  process.stderr.write("Appwrite status: " + code + "; type: " + type + "\n");
  process.stderr.write("Inspect staging before retrying; provisioning is create-only.\n");
  process.exitCode = 1;
});
