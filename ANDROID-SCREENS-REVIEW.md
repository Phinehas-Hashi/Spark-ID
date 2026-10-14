# Android screens — review build

This branch builds on the existing Compose welcome, login, registration, MFA, dashboard, identity, security, recovery, connected-apps, notifications, Developer Hub, and founder status screens.

## Added
- Developer Hub application registration form (name, type, HTTPS redirect).
- First-party Appwrite JWT is requested only after the user submits and only if a trusted Developer API origin is configured.
- Background registration request, pending-review confirmation, loading and error states.
- Backend must independently authenticate and approve the developer. The client never grants approval.
- No OAuth/OIDC credentials, payment privileges, or administrator write actions are enabled.

## Deliberate environment gate
The DeveloperApi constructor still defaults to **no endpoint**. Do not point the production Appwrite-authenticated app at staging: JWTs are project-specific. Before enabling connectivity, configure a separate staging Android build variant and a trusted HTTPS backend with staging Appwrite authentication. Do not embed privileged API keys.

## Android Studio validation
Checkout this branch and run `./gradlew :app:assembleDebug` (Windows: `.\\gradlew.bat :app:assembleDebug`). Exercise navigation, auth, Developer Hub unconfigured state, and form validation. The code was reviewed but has not been compiled on the user's Android Studio or exercised against a live backend here. Keep backend write controls disabled until audit consistency is resolved.
