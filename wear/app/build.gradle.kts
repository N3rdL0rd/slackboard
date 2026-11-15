plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.slackboard.client.wear"
    compileSdk = 34

    defaultConfig {
        // Same id as the phone app: the Data Layer only links apps that share it (and the signing key).
        applicationId = "app.slackboard.client"
        minSdk = 30
        targetSdk = 34
        versionCode = (findProperty("wearVersionCode") as String?)?.toInt() ?: 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Debug key until the release key is wired in; it matches the phone's debug builds.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui:1.7.6")
    implementation("androidx.wear.compose:compose-foundation:1.4.1")
    implementation("androidx.wear.compose:compose-material:1.4.1")
    implementation("androidx.health:health-services-client:1.0.0")
    implementation("com.google.guava:listenablefuture:1.0")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
}
