# Spark ID

Spark Stack International Android app, connected to Appwrite Cloud.

- Endpoint: https://fra.cloud.appwrite.io/v1
- Project ID: 6accc223002dbb161c74
- Register Android platform package: `com.sparkstack.sparkid`

## Implemented
- Real Appwrite email/password registration and login using public Account REST endpoints
- Network requests on a background executor, busy states and errors
- Authenticated dashboard and account profile
- Current-session logout
- Session cookie in memory only: app restart requires another sign-in
- No server API key, no pretend KYC or OAuth identity provider

Build on Windows: `.\\gradlew.bat assembleDebug`.

If account creation succeeds but session creation fails, sign in with the existing account instead of registering again. This version has not yet been device-tested.
