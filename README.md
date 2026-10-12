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

The Android app does **not yet send these emails**; wait until the hosted URL is verified. GitHub Pages is a public static host, not a privileged backend. This callback is a browser fallback; verified Android App Links require a controlled domain and Digital Asset Links configuration.

Windows build: `.\\gradlew.bat assembleDebug`.
