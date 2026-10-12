# Spark ID

Native Android identity app for Spark Stack International. Appwrite endpoint `https://fra.cloud.appwrite.io/v1`, project `6accc223002dbb161c74`, Android package `com.sparkstack.sparkid`.

## Current app
Real registration/login/logout, Android Keystore-encrypted persistent session with startup validation, protected dashboard, Appwrite account email verification status, authenticated password change and editable account display name.

## Hosted account callback — deployment required
`docs/index.html` is a static HTTPS callback page for Appwrite verification and password recovery. It strips tokens from the browser address bar immediately, submits them to the Appwrite public Account API, and does not store them. The page **is not live until GitHub Pages is enabled**.

1. In GitHub repository Settings → Pages, choose Deploy from branch, `main`, folder `/docs`. Verify the actual resulting HTTPS URL before using it.
2. In Appwrite Console add a **Web platform** for the exact Pages host `phinehas-hashi.github.io` so browser requests can reach Appwrite. Retain the Android platform `com.sparkstack.sparkid`.
3. Expected callback base URL, subject to actual deployment: `https://phinehas-hashi.github.io/Spark-ID/`. Appwrite recovery/verification requests should use `?mode=recover` or `?mode=verify` respectively, and Appwrite will append `userId` and `secret`.
4. Test with a disposable account. Do not share reset/verification URLs, tokens, or passwords.

The Android app sends verification and recovery emails; both callback flows have been tested successfully. GitHub Pages is a public static host, not a privileged backend. This callback is a browser fallback; verified Android App Links require a controlled domain and Digital Asset Links configuration. GitHub Pages is a public static host, not a privileged backend. This callback is a browser fallback; verified Android App Links require a controlled domain and Digital Asset Links configuration.

Windows build: `.\\gradlew.bat assembleDebug`.


## Developer platform preview
`docs/developers.html` publishes the planned third-party integration contract and is linked from the Android Developer Hub. **No public OAuth/OIDC provider, developer registration or token issuance is live yet.** The existing Appwrite Account API and first-party session cookie are not a third-party SSO protocol. See the guide for required authorization server, PKCE, redirect validation, scopes, consent, token verification and revocation milestones.

## Authorization server foundation (not live)
The dependency-free, local-only validation module and tests are under `authorization-server/`. Run `cd authorization-server && npm test` using Node 20+. Read `authorization-server/ARCHITECTURE.md` before building any live endpoints. No developer credentials or public SSO endpoints are available yet.

### Local developer registry prototype
`authorization-server/registry.js` provides local pending-review app records with random public client IDs and owner-filtered reads; it is **not an authenticated endpoint**. See `authorization-server/REGISTRY.md`. Run `npm.cmd test` in that directory to execute both validation and registry tests.

### Authentication boundary scaffold
`authorization-server/developer-service.js` requires an injected trusted authentication adapter before accessing registrations, and derives ownership exclusively from the verified adapter result. It has no real credential verifier or public HTTP route; see `authorization-server/AUTH-BOUNDARY.md`.

### Appwrite first-party JWT adapter (not deployed)
`authorization-server/appwrite-auth.js` checks a first-party JWT against Appwrite's `/account` endpoint on the server and fails closed. Tests use a mocked network response; no live credentials or public endpoints are configured. See `authorization-server/APPWRITE-AUTH.md`.

### Developer access-control policy (internal-only)
`authorization-server/access-control.js` adds a trusted server-side approval check on every developer registry operation. A verified account must also have a matching, enabled, approved developer record. No production approval store or public self-approval route exists; see `authorization-server/ACCESS-CONTROL.md`.
