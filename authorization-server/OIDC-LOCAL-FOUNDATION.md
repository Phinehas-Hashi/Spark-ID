# Local OIDC foundation

This folder includes `oidc-provider`, a PostgreSQL persistence adapter, and a
local-only server composition in `oidc-server.mjs`. The server code supports a
single statically configured Spark Studio client and a browser-to-Spark-ID-app
handoff. It does not start a listener when imported. It has not been activated,
reviewed, hosted, or connected to Spark Studio. Do not deploy or connect a live
client to this foundation.

## Local database setup

Use a disposable local PostgreSQL database with a dedicated role. Apply
`sql/002-oidc-provider-state.sql` to that database only. The adapter expects a
trusted `pg` pool and persists OIDC model payloads, including session and token
state. The same migration stores verified Spark ID profile claims and
short-lived login handoff records. Configure database TLS and access controls
before any hosted use.

The Spark ID Android app has a `sparkid://oidc-login` route. It fetches the exact
client name and scopes, asks the signed-in user to approve, confirms the active
Appwrite session (which enforces any required MFA), then sends a short-lived
Appwrite JWT only to the configured Spark ID HTTPS server. The browser retains
its OIDC interaction cookie and completes its own authorization after polling
for approval. The JWT is not sent to Spark Studio or placed in the browser.

## Remaining work before a pilot

1. Replace the custom `sparkid://` scheme with a verified Android App Link on a
   Spark ID HTTPS domain before a public pilot; custom schemes can be claimed by
   another installed app.
2. Have the local OIDC interaction and PostgreSQL adapter independently
   reviewed. They are integration groundwork and have not been exercised
   against a real database or conformance suite.
3. Configure only the Spark Studio client initially, with exact redirect URIs,
   authorization code flow, PKCE S256, and an asymmetric signing key supplied
   through managed secret storage. Do not enable public/dynamic registration.
4. Add rate limiting, CSRF and replay controls, retention cleanup,
   operational logging that excludes credentials, and independent security and
   conformance review.
5. Preserve existing Studio user UUIDs and project ownership through a reviewed
   account-link migration before removing existing sign-in methods.

Supabase Auth documents automatic identity linking when an OAuth identity has
the same verified email as an existing user. This should preserve the existing
Supabase user row and its project ownership, but the actual Spark Studio
project must be checked for unique verified emails and tested with a disposable
account before email/password sign-in is removed. Duplicate or unverified
emails need a separate, explicit migration path.

The issuer, database URL, private signing keys, cookie keys, client secret and
verified Android App Link domain still need to be configured. Keep all of them
out of Git. The provider must remain disabled until those values and the
database migration have been reviewed. `trustedProxy` is an explicit server
setting: enable it only when a trusted HTTPS ingress strips and sets forwarded
headers, as the OIDC library requires for TLS-offloaded deployments.

## Staging startup

`oidc-staging.mjs` is an opt-in staging entry point. It refuses to start unless
`SPARK_ID_OIDC_ENVIRONMENT=staging` and
`SPARK_ID_OIDC_ENABLE_STAGING=true` are both set. It also requires the database
host and database name to match separate staging allowlist settings, and
requires encrypted PostgreSQL transport. For Render, the generated internal URL
may omit `sslmode`; startup adds `sslmode=require`. Render's internal PostgreSQL
TLS uses self-signed certificates, so hostname verification is not supported.
Use the internal URL from a service in the same region. The explicit staging host allowlist
prevents the app from accepting a different database host. It checks that the
migration's tables exist but never applies migrations. Copy `.env.example` to an
ignored `.env` for local configuration; do not commit that file. Hosting
dashboards should receive the same values through their secret settings. The
health route is `/healthz`.

For a Render staging service, use `authorization-server` as the service root,
`npm ci && SPARK_ID_OIDC_ALLOW_STAGING_MIGRATION=true npm run migrate:staging`
as the initial build command, and `npm run start:staging` as the start command.
The migration command checks the database allowlist, applies the additive SQL
in one transaction only when the schema is empty, and is a no-op after all
expected tables exist.
Create a dedicated staging PostgreSQL database in the same region, set its exact
host and database name in the allowlist variables, and use its internal URL;
startup requires TLS even if Render's URL omits `sslmode`. Add the migration
manually to that staging database after review. Keep the
service disabled until the issuer domain, static Studio callback, Appwrite
staging project, signing key and cookie keys have all been independently
checked. A custom domain and HTTPS certificate can then be attached in Render;
DNS stays with the domain's DNS provider. This repository has not been deployed.

The PostgreSQL migration is additive. `npm audit` should be clean for the
installed production dependency tree before the next build step.
