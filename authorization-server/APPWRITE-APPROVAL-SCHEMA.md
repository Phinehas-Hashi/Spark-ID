# Spark ID — Developer Approval Store

Status: Local development specification
Database provider: Appwrite TablesDB
No live connection or deployment is implied by this document.

## 1. Database

Suggested database ID: `spark_id`
Suggested table ID: `developer_approvals`

These IDs are proposals. Confirm they are available before creating resources.

## 2. Table columns

| Column key | Type | Required | Rules |
|---|---|---|---|
| subject | String | Yes | Exact Appwrite account ID; unique |
| status | Enum or String | Yes | pending, approved, revoked |
| enabled | Boolean | Yes | Must be exactly true for approval |

Create a UNIQUE index on `subject`.

Use an enum for `status` if supported by the selected Appwrite configuration,
with the allowed values `pending`, `approved`, and `revoked`.

## 3. Authorization rules

- Approval records are private.
- Never grant public or ordinary client access to this table.
- Only the trusted server-side approval lookup may read approval records.
- Keep the Appwrite API key in server-side environment configuration.
- Give the key only the read scopes required for the lookup.
- Do not use a full-project or all-permissions key for this adapter.
- Developer registration must never create or update approval records.
- Administrative approval and revocation must be a separate trusted workflow.

## 4. Approval decision

A developer qualifies only when all conditions hold:

1. Authentication independently verifies the Appwrite account.
2. Exactly one approval record matches the authenticated account ID.
3. The record's subject exactly matches that ID.
4. status is `approved`.
5. enabled is the Boolean `true`.

Missing, duplicate, malformed, pending, revoked, disabled, or unavailable
approval data must not grant access.

## 5. Server environment variables

APPWRITE_ENDPOINT=https://YOUR-REGION.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=YOUR_PROJECT_ID
APPWRITE_API_KEY=YOUR_SERVER_SIDE_READ_ONLY_KEY
APPWRITE_DATABASE_ID=spark_id
APPWRITE_APPROVALS_TABLE_ID=developer_approvals

Use the endpoint and project ID shown in the Appwrite Console.
Never commit a real API key.

## 6. Before a live connection

- Confirm the database and table IDs.
- Verify the unique index is ready.
- Verify client-facing roles cannot read or modify approval rows.
- Verify the server API key has minimum required permissions.
- Test approved, pending, revoked, disabled, duplicate, and outage cases.
- Review audit logging and the separate administrator approval process.

This is an approval-store specification, not a complete OAuth 2.0 or
OpenID Connect provider.
