plugins {
    id("com.android.application")
}

android {
    namespace = "kr.or.playguro.nolmap"
    compileSdk = 36

    defaultConfig {
        applicationId = "kr.or.playguro.nolmap"
        minSdk = 23
        targetSdk = 36
        // 플레이스토어에 새 버전을 올릴 때마다 versionCode는 1씩 올려야 해요.
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // 구글 공식 TWA(신뢰할 수 있는 웹 활동) 도우미
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
