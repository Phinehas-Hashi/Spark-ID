# Spark ID

Native Android identity app for Spark Stack International.

Appwrite project ID: `6accc223002dbb161c74`. Endpoint: `https://fra.cloud.appwrite.io/v1`. Android package: `com.sparkstack.sparkid`.

## Implemented
- Real registration, login and logout
- Encrypted session persistence with Android Keystore; server validation at launch
- Protected dashboard and profile; account email-verification status from Appwrite
- Account Security screen: refresh account status and change password using Appwrite's authenticated Account API
- No privileged API keys embedded in Android

## Next: email links
Verification and forgot-password emails require an owned, registered HTTPS callback URL with an actual hosted handler (and optionally Android App Links). These actions remain disabled until that infrastructure exists; do not invent a callback domain or claim verification based on sign-in. Account profile is not government identity/KYC.

Build on Windows: `.\\gradlew.bat assembleDebug`. Test changing password, signing out, and signing in with the new password. Do not send passwords or tokens in bug reports.
