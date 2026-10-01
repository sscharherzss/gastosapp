import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

android {
    compileSdk = 36
    namespace = "com.lamayoristapp.appgastos"
    defaultConfig {
        applicationId = "com.lamayoristapp.appgastos"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "0.1.3"
    }
    signingConfigs {
        create("release") {
            val signingProperties = Properties()
            val propertiesFile = rootProject.file("keystore.properties")
            if (propertiesFile.exists()) propertiesFile.inputStream().use { signingProperties.load(it) }
            fun signingValue(env: String, property: String): String? =
                System.getenv(env) ?: signingProperties.getProperty(property)
            val keystorePath = signingValue("ANDROID_KEYSTORE_PATH", "storeFile")
            if (keystorePath != null) {
                storeFile = rootProject.file(keystorePath)
                storePassword = signingValue("ANDROID_KEYSTORE_PASSWORD", "storePassword")
                    ?: error("Falta ANDROID_KEYSTORE_PASSWORD o storePassword")
                keyAlias = signingValue("ANDROID_KEY_ALIAS", "keyAlias")
                    ?: error("Falta ANDROID_KEY_ALIAS o keyAlias")
                keyPassword = signingValue("ANDROID_KEY_PASSWORD", "keyPassword")
                    ?: error("Falta ANDROID_KEY_PASSWORD o keyPassword")
            }

        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("**/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("**/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("**/x86/*.so")
                jniLibs.keepDebugSymbols.add("**/x86_64/*.so")
            }
        }
        getByName("release") {
            if (signingConfigs.getByName("release").storeFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            packaging {
                jniLibs.useLegacyPackaging = false
            }
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../.."
}

dependencies {
    implementation(project(":tauri-android"))
    implementation("com.google.android.material:material:1.9.0")
    implementation("androidx.webkit:webkit:1.8.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.6.2")
    implementation("androidx.activity:activity-ktx:1.8.0")
}
