"use strict";
const { randomUUID } = require("node:crypto");

// Trusted-server append adapter; no client-facing reads or mutations.
function createAppwriteAuditStore({ databaseId, tableId, tablesDB, ids = randomUUID } = {}) {
  if (!databaseId || !tableId || !tablesDB || typeof tablesDB.createRow !== "function" || typeof ids !== "function")
    throw new Error("Persistent audit configuration required");
  return Object.freeze({
    async append(event) {
      if (!event || typeof event.actorSubject !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(event.actorSubject) ||
          typeof event.action !== "string" || !/^[a-z][a-z0-9_]{2,79}$/.test(event.action) ||
          typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt)))
        throw new Error("Invalid audit event");
      const allowed = ["actorSubject", "targetSubject", "appId", "action", "previousStatus", "status", "enabled", "occurredAt"];
      if (Object.keys(event).some(key => !allowed.includes(key))) throw new Error("Unexpected audit fields");
      const rowId = ids();
      if (typeof rowId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(rowId)) throw new Error("Invalid audit ID");
      const row = await tablesDB.createRow({ databaseId, tableId, rowId, data: { ...event }, permissions: [] });
      if (!row || row.$id !== rowId || row.actorSubject !== event.actorSubject || row.action !== event.action)
        throw new Error("Audit write not confirmed");
      return { id: rowId, ...event };
    }
  });
}
module.exports = { createAppwriteAuditStore };
