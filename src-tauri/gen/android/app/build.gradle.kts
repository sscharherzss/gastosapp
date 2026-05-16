plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

android {
    compileSdk = 34
    namespace = "com.misfinanzas.app"
    defaultConfig {
        applicationId = "com.misfinanzas.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauri.properties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauri.properties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH") ?: "/home/charherz/gastos-key.jks"
            val keystoreFile = file(keystorePath)
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "android"
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "gastos"
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: "android"
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
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            packaging {
                jniLibs.useLegacyPackaging = true
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
