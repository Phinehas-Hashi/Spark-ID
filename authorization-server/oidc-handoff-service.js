"use strict";

const crypto = require("node:crypto");

const HANDOFF_TTL_MS = 3 * 60 * 1000;
const TICKET = /^[A-Za-z0-9_-]{43}$/;
const SUBJECT = /^[A-Za-z0-9_-]{3,128}$/;
const ALLOWED_SCOPES = new Set(["openid", "profile", "email"]);

function ticketHash(ticket) {
  return crypto.createHash("sha256").update(ticket, "ascii").digest("hex");
}

function validateRequest({ interactionUid, clientId, clientName, redirectUri, scopes }) {
  if (
    typeof interactionUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(interactionUid) ||
    typeof clientId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId) ||
    typeof clientName !== "string" || clientName.trim().length < 1 || clientName.trim().length > 80 ||
    typeof redirectUri !== "string" || redirectUri.length > 2048 ||
    !Array.isArray(scopes) || scopes.length < 1 || scopes.length > 3
  ) throw new Error("Invalid OIDC handoff request");

  let redirect;
  try { redirect = new URL(redirectUri); } catch { throw new Error("Invalid OIDC handoff request"); }
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.hash) {
    throw new Error("Invalid OIDC handoff request");
  }
  const uniqueScopes = [...new Set(scopes)];
  if (
    uniqueScopes.length !== scopes.length ||
    !uniqueScopes.includes("openid") ||
    uniqueScopes.some((scope) => typeof scope !== "string" || !ALLOWED_SCOPES.has(scope))
  ) throw new Error("Invalid OIDC handoff request");
  return { interactionUid, clientId, clientName: clientName.trim(), redirectUri, scopes: uniqueScopes };
}

function createOidcHandoffService({ pool, authenticateAppwriteJwt, now = Date.now } = {}) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new Error("PostgreSQL pool is required");
  }
  if (typeof authenticateAppwriteJwt !== "function" || typeof now !== "function") {
    throw new Error("Trusted Spark ID authentication and clock are required");
  }

  return Object.freeze({
    async create(input) {
      const request = validateRequest(input);
      const timestamp = now();
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("Invalid clock");
      const ticket = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(timestamp + HANDOFF_TTL_MS);
      const result = await pool.query(
        `INSERT INTO oidc_login_handoffs
           (ticket_hash, interaction_uid, client_id, client_name, redirect_uri, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (interaction_uid) DO UPDATE SET
           ticket_hash = EXCLUDED.ticket_hash,
           client_id = EXCLUDED.client_id,
           client_name = EXCLUDED.client_name,
           redirect_uri = EXCLUDED.redirect_uri,
           scopes = EXCLUDED.scopes,
           status = 'pending',
           subject = NULL,
           approved_at = NULL,
           expires_at = EXCLUDED.expires_at
         WHERE oidc_login_handoffs.status = 'pending'
           AND oidc_login_handoffs.expires_at > clock_timestamp()`,
        [ticketHash(ticket), request.interactionUid, request.clientId, request.clientName,
          request.redirectUri, JSON.stringify(request.scopes), expiresAt],
      );
      if (result.rowCount !== 1) throw new Error("OIDC interaction is no longer available");
      return Object.freeze({ ticket, expiresAt: expiresAt.toISOString() });
    },

    async details(ticket) {
      if (typeof ticket !== "string" || !TICKET.test(ticket)) return null;
      const result = await pool.query(
        `SELECT client_name, scopes, expires_at
         FROM oidc_login_handoffs
         WHERE ticket_hash = $1 AND status = 'pending' AND expires_at > clock_timestamp()`,
        [ticketHash(ticket)],
      );
      if (result.rows.length !== 1) return null;
      const row = result.rows[0];
      return Object.freeze({
        clientName: row.client_name,
        scopes: Object.freeze([...row.scopes]),
        expiresAt: new Date(row.expires_at).toISOString(),
      });
    },

    async approve({ ticket, appwriteJwt }) {
      if (typeof ticket !== "string" || !TICKET.test(ticket)) {
        throw new Error("Invalid or expired authorization request");
      }
      const principal = await authenticateAppwriteJwt(appwriteJwt);
      if (
        !principal || principal.verified !== true || !SUBJECT.test(principal.subject || "") ||
        principal.emailVerified !== true || typeof principal.email !== "string" ||
        principal.email.length > 320 || !/^\S+@\S+\.\S+$/.test(principal.email) ||
        typeof principal.name !== "string" || principal.name.length > 128
      ) throw new Error("A verified Spark ID account is required");

      const client = await pool.connect();
      let inTransaction = false;
      try {
        await client.query("BEGIN");
        inTransaction = true;
        const handoff = await client.query(
          `SELECT scopes FROM oidc_login_handoffs
           WHERE ticket_hash = $1 AND status = 'pending' AND expires_at > clock_timestamp()
           FOR UPDATE`,
          [ticketHash(ticket)],
        );
        if (handoff.rows.length !== 1) throw new Error("Invalid or expired authorization request");
        const scopes = handoff.rows[0].scopes;
        if (!Array.isArray(scopes) || scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
          throw new Error("Invalid or expired authorization request");
        }

        const identity = await client.query(
          `INSERT INTO spark_oidc_accounts (subject, email, email_verified, display_name)
           VALUES ($1, $2, true, $3)
           ON CONFLICT (subject) DO UPDATE SET email = EXCLUDED.email,
             email_verified = true, display_name = EXCLUDED.display_name,
             updated_at = clock_timestamp()`,
          [principal.subject, principal.email, principal.name],
        );
        if (identity.rowCount !== 1) throw new Error("Spark ID identity was not saved");

        const updated = await client.query(
          `UPDATE oidc_login_handoffs
           SET status = 'approved', subject = $2, approved_at = clock_timestamp()
           WHERE ticket_hash = $1 AND status = 'pending'
             AND expires_at > clock_timestamp()`,
          [ticketHash(ticket), principal.subject],
        );
        if (updated.rowCount !== 1) throw new Error("Authorization request expired");
        await client.query("COMMIT");
        inTransaction = false;
        return Object.freeze({ approved: true });
      } catch (error) {
        if (inTransaction) {
          try { await client.query("ROLLBACK"); }
          catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "Authorization approval outcome requires reconciliation");
          }
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async deny(ticket) {
      if (typeof ticket !== "string" || !TICKET.test(ticket)) return false;
      const result = await pool.query(
        `UPDATE oidc_login_handoffs SET status = 'denied'
         WHERE ticket_hash = $1 AND status = 'pending'
           AND expires_at > clock_timestamp()`,
        [ticketHash(ticket)],
      );
      return result.rowCount === 1;
    },

    async status(interactionUid) {
      if (typeof interactionUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(interactionUid)) return "expired";
      const result = await pool.query(
        `SELECT status FROM oidc_login_handoffs
         WHERE interaction_uid = $1 AND expires_at > clock_timestamp()`,
        [interactionUid],
      );
      return result.rows.length === 1 ? result.rows[0].status : "expired";
    },

    async approvedIdentity(interactionUid) {
      if (typeof interactionUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(interactionUid)) return null;
      const result = await pool.query(
        `SELECT h.subject, a.email, a.email_verified, a.display_name, h.scopes
         FROM oidc_login_handoffs h
         JOIN spark_oidc_accounts a ON a.subject = h.subject
         WHERE h.interaction_uid = $1 AND h.status = 'approved'
           AND h.expires_at > clock_timestamp()`,
        [interactionUid],
      );
      if (result.rows.length !== 1) return null;
      const row = result.rows[0];
      return Object.freeze({
        subject: row.subject,
        email: row.email,
        emailVerified: row.email_verified,
        name: row.display_name,
        scopes: Object.freeze([...row.scopes]),
      });
    },
  });
}

module.exports = { HANDOFF_TTL_MS, createOidcHandoffService };
