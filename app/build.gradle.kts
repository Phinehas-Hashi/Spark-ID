plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val studioPublishableKey = providers
    .gradleProperty("sparkStudioPublishableKey")
    .orElse(providers.environmentVariable("SPARK_STUDIO_SUPABASE_PUBLISHABLE_KEY"))
    .getOrElse("")
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")

val sparkIdOidcServerUrl = providers
    .gradleProperty("sparkIdOidcServerUrl")
    .orElse(providers.environmentVariable("SPARK_ID_OIDC_SERVER_URL"))
    .getOrElse("")
    .trim()
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")

android {
    namespace = "com.sparkstack.sparkid"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.sparkstack.sparkid"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
        buildConfigField(
            "String",
            "SPARK_STUDIO_PUBLISHABLE_KEY",
            "\"$studioPublishableKey\"",
        )
        buildConfigField(
            "String",
            "SPARK_ID_OIDC_SERVER_URL",
            "\"$sparkIdOidcServerUrl\"",
        )

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            optimization {
                enable = true
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
