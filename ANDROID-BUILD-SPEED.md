# Android build speed

The project already enables Gradle configuration cache. This change also enables local build caching and Kotlin incremental compilation. These settings help repeat builds; they do not guarantee a faster first clean build.

On Windows PowerShell, from the repository root:

```powershell
.\gradlew.bat :app:assembleDebug --configuration-cache --build-cache
.\gradlew.bat :app:assembleDebug --configuration-cache --build-cache
```

Compare the second run with the first. For diagnostics, use `--profile` and inspect the generated local report; don't commit profiling output. Avoid `clean` between incremental builds. Keep the Gradle daemon enabled (default). Parallel execution is not enabled globally because this is currently a single-app-module project. If memory pressure or stale cache issues arise, diagnose first and revert the specific setting rather than deleting all caches routinely.

No CI or device benchmark is claimed here.
