-- Durable, expiring state for the local oidc-provider integration foundation.
-- Use a dedicated database and least-privilege role. Never point local setup at
-- production. This table stores OIDC sessions, codes and tokens as JSONB.
CREATE TABLE IF NOT EXISTS oidc_provider_state (
  model text NOT NULL CHECK (model ~ '^[A-Z][A-Za-z]{0,63}$'),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 512),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (model, id)
);

CREATE INDEX IF NOT EXISTS oidc_provider_state_expiry_idx
  ON oidc_provider_state (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS oidc_provider_state_session_uid_idx
  ON oidc_provider_state ((payload->>'uid'))
  WHERE model = 'Session' AND payload ? 'uid';

CREATE INDEX IF NOT EXISTS oidc_provider_state_device_user_code_idx
  ON oidc_provider_state ((payload->>'userCode'))
  WHERE model = 'DeviceCode' AND payload ? 'userCode';

CREATE INDEX IF NOT EXISTS oidc_provider_state_grant_idx
  ON oidc_provider_state (model, (payload->>'grantId'))
  WHERE payload ? 'grantId';

CREATE TABLE IF NOT EXISTS spark_oidc_accounts (
  subject text PRIMARY KEY CHECK (subject ~ '^[A-Za-z0-9_-]{3,128}$'),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  email_verified boolean NOT NULL CHECK (email_verified),
  display_name text NOT NULL CHECK (length(display_name) <= 128),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS oidc_login_handoffs (
  ticket_hash char(64) PRIMARY KEY CHECK (ticket_hash ~ '^[0-9a-f]{64}$'),
  interaction_uid text NOT NULL UNIQUE CHECK (length(interaction_uid) BETWEEN 1 AND 128),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 128),
  client_name text NOT NULL CHECK (length(client_name) BETWEEN 1 AND 80),
  redirect_uri text NOT NULL CHECK (length(redirect_uri) BETWEEN 1 AND 2048),
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  subject text REFERENCES spark_oidc_accounts(subject),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_at timestamptz,
  CHECK ((status = 'approved') = (subject IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS oidc_login_handoffs_expiry_idx
  ON oidc_login_handoffs (expires_at);
