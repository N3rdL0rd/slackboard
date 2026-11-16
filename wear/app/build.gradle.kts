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

    // The Data Layer only links a watch app and a phone app that share the application id and the signing key, so this signs the
    // watch app the way the phone app is signed (see plugins/withReleaseSigning.js): the release keystore when SLACKBOARD_KEYSTORE is
    // set, otherwise the debug keystore of the generated phone project (android/app/debug.keystore).
    val phoneDebugKeystore = rootProject.file("../android/app/debug.keystore")
    val releaseKeystore: String? = System.getenv("SLACKBOARD_KEYSTORE")
    signingConfigs {
        create("slackboard") {
            if (releaseKeystore != null) {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("SLACKBOARD_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("SLACKBOARD_KEY_ALIAS")
                keyPassword = System.getenv("SLACKBOARD_KEY_PASSWORD")
            } else if (phoneDebugKeystore.exists()) {
                storeFile = phoneDebugKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }
    val sameKeyAsPhone = if (releaseKeystore != null || phoneDebugKeystore.exists()) "slackboard" else "debug"

    buildTypes {
        debug { signingConfig = signingConfigs.getByName(sameKeyAsPhone) }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(sameKeyAsPhone)
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.wear:wear:1.3.0")
    implementation("androidx.wear:wear-ongoing:1.0.0")
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.wear.protolayout:protolayout:1.2.1")
    implementation("androidx.wear.protolayout:protolayout-expression:1.2.1")
    implementation("androidx.wear.protolayout:protolayout-material:1.2.1")
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")
    implementation("com.google.guava:guava:33.0.0-android")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui:1.7.6")
    implementation("androidx.wear.compose:compose-foundation:1.4.1")
    implementation("androidx.wear.compose:compose-material:1.4.1")
    implementation("androidx.health:health-services-client:1.0.0")
    implementation("com.google.guava:listenablefuture:1.0")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")

    testImplementation("junit:junit:4.13.2")
}
