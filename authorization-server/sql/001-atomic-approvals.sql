-- Apply with a dedicated migration role, not the public API identity.
CREATE TABLE IF NOT EXISTS developer_approvals (
  subject varchar(128) PRIMARY KEY,
  status varchar(16) NOT NULL CHECK (status IN ('pending','approved','revoked')),
  enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT approved_only_enabled CHECK (enabled = (status = 'approved'))
);
CREATE TABLE IF NOT EXISTS developer_approval_audit (
  id varchar(128) PRIMARY KEY,
  actor_subject varchar(128) NOT NULL,
  target_subject varchar(128) NOT NULL REFERENCES developer_approvals(subject),
  action varchar(16) NOT NULL CHECK (action IN ('pending','approved','revoked')),
  previous_status varchar(16) NOT NULL CHECK (previous_status IN ('pending','approved','revoked')),
  status varchar(16) NOT NULL CHECK (status IN ('pending','approved','revoked')),
  enabled boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT audit_status_enabled CHECK (enabled = (status = 'approved'))
);
-- Restrict API database role to SELECT/UPDATE on developer_approvals,
-- INSERT on developer_approval_audit. Do not grant audit UPDATE/DELETE.
-- Appwrite approval records are NOT synchronized by this migration.
