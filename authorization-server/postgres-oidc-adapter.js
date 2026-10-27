"use strict";

// Durable adapter for oidc-provider. This module deliberately does not create a
// pool or start a server; callers must supply a trusted PostgreSQL pool.
const GRANTABLE_MODELS = new Set([
  "AccessToken",
  "AuthorizationCode",
  "RefreshToken",
  "DeviceCode",
  "BackchannelAuthenticationRequest",
  "PreAuthorizedCode",
]);

function createPostgresOidcAdapter(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("PostgreSQL pool with query() is required");
  }

  return class PostgresOidcAdapter {
    constructor(model) {
      if (typeof model !== "string" || !/^[A-Z][A-Za-z]{0,63}$/.test(model)) {
        throw new Error("Invalid OIDC model name");
      }
      this.model = model;
    }

    async upsert(id, payload, expiresIn) {
      if (
        typeof id !== "string" || id.length < 1 || id.length > 512 ||
        !payload || typeof payload !== "object" || Array.isArray(payload) ||
        (expiresIn !== undefined &&
          (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn < 0))
      ) {
        throw new Error("Invalid OIDC storage record");
      }
      const result = await pool.query(
        `INSERT INTO oidc_provider_state (model, id, payload, expires_at)
         VALUES ($1, $2, $3::jsonb,
           CASE WHEN $4::double precision IS NULL THEN NULL
             ELSE clock_timestamp() + ($4::double precision * interval '1 second') END)
         ON CONFLICT (model, id) DO UPDATE SET
           payload = EXCLUDED.payload,
           expires_at = EXCLUDED.expires_at,
           updated_at = clock_timestamp()`,
        [this.model, id, JSON.stringify(payload), expiresIn ?? null],
      );
      if (result.rowCount !== 1) throw new Error("OIDC state write was not acknowledged");
    }

    async find(id) {
      if (typeof id !== "string" || id.length < 1 || id.length > 512) return undefined;
      const result = await pool.query(
        `SELECT payload FROM oidc_provider_state
         WHERE model = $1 AND id = $2
           AND (expires_at IS NULL OR expires_at > clock_timestamp())`,
        [this.model, id],
      );
      return result.rows.length === 1 ? result.rows[0].payload : undefined;
    }

    async destroy(id) {
      if (typeof id !== "string" || id.length < 1 || id.length > 512) return;
      await pool.query(
        "DELETE FROM oidc_provider_state WHERE model = $1 AND id = $2",
        [this.model, id],
      );
    }

    async consume(id) {
      if (typeof id !== "string" || id.length < 1 || id.length > 512) return;
      await pool.query(
        `UPDATE oidc_provider_state
         SET payload = jsonb_set(
           payload,
           '{consumed}',
           to_jsonb(floor(extract(epoch FROM clock_timestamp()))::bigint),
           true
         ), updated_at = clock_timestamp()
         WHERE model = $1 AND id = $2
           AND (expires_at IS NULL OR expires_at > clock_timestamp())`,
        [this.model, id],
      );
    }

    async findByUid(uid) {
      if (this.model !== "Session" || typeof uid !== "string" || uid.length > 512) {
        return undefined;
      }
      const result = await pool.query(
        `SELECT payload FROM oidc_provider_state
         WHERE model = 'Session' AND payload->>'uid' = $1
           AND (expires_at IS NULL OR expires_at > clock_timestamp())`,
        [uid],
      );
      return result.rows.length === 1 ? result.rows[0].payload : undefined;
    }

    async findByUserCode(userCode) {
      if (this.model !== "DeviceCode" || typeof userCode !== "string" || userCode.length > 128) {
        return undefined;
      }
      const result = await pool.query(
        `SELECT payload FROM oidc_provider_state
         WHERE model = 'DeviceCode' AND payload->>'userCode' = $1
           AND (expires_at IS NULL OR expires_at > clock_timestamp())`,
        [userCode],
      );
      return result.rows.length === 1 ? result.rows[0].payload : undefined;
    }

    async revokeByGrantId(grantId) {
      if (!GRANTABLE_MODELS.has(this.model) || typeof grantId !== "string") return;
      await pool.query(
        `DELETE FROM oidc_provider_state
         WHERE model = $1 AND payload->>'grantId' = $2`,
        [this.model, grantId],
      );
    }
  };
}

module.exports = { createPostgresOidcAdapter };
