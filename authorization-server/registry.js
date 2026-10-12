"use strict";
// Local-only storage primitive. NOT an HTTP endpoint or an authorization boundary.
// Caller must authenticate and authorize ownerId before invoking these functions.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateRegistration } = require("./validation");
function assertOwner(ownerId) {
  if (typeof ownerId !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(ownerId))
    throw new Error("Invalid owner identifier");
}
function assertClientId(clientId) {
  if (typeof clientId !== "string" || !/^sid_[0-9a-f]{32}$/.test(clientId))
    throw new Error("Invalid client identifier");
}
function safeFile(dir, clientId) { assertClientId(clientId); return path.join(dir, clientId + ".json"); }
async function createRegistration(dir, ownerId, input) {
  assertOwner(ownerId);
  const valid = validateRegistration(input);
  // Public, unpredictable client identifier; it is NOT a secret or credential.
  const clientId = "sid_" + crypto.randomBytes(16).toString("hex");
  const record = { clientId, ownerId, name: valid.name, redirectUris: [...valid.redirectUris], status: "pending_review", createdAt: new Date().toISOString() };
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = safeFile(dir, clientId);
  // wx prevents overwriting an existing registration. Never write passwords or tokens here.
  const handle = await fs.open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(record, null, 2) + "\n", "utf8"); }
  finally { await handle.close(); }
  return Object.freeze({ ...record, redirectUris: Object.freeze([...record.redirectUris]) });
}
async function getOwnedRegistration(dir, ownerId, clientId) {
  assertOwner(ownerId);
  const raw = await fs.readFile(safeFile(dir, clientId), "utf8");
  const record = JSON.parse(raw);
  // Never return a different owner's record.
  if (record.ownerId !== ownerId || record.clientId !== clientId) return null;
  return record;
}
module.exports = { createRegistration, getOwnedRegistration };
