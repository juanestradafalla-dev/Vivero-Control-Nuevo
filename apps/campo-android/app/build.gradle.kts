import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

val emulatorHost = providers.gradleProperty("emulatorHost").orElse("10.0.2.2")
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}

fun localOrProjectProperty(name: String, defaultValue: String = ""): String =
    providers.gradleProperty(name).orNull ?: localProperties.getProperty(name, defaultValue)

fun localProjectOrEnvironment(propertyName: String, environmentName: String): String =
    localOrProjectProperty(propertyName).ifBlank {
        providers.environmentVariable(environmentName).orNull.orEmpty()
    }

fun buildConfigString(value: String): String =
    "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val productionProjectId = localOrProjectProperty("productionFirebaseProjectId", "viverocontrol-3f83f")
val productionApiKey = localOrProjectProperty("productionFirebaseApiKey")
val productionAppId = localOrProjectProperty("productionFirebaseAppId")
val productionKeystorePath = localProjectOrEnvironment("productionKeystorePath", "VIVERO_CAMPO_KEYSTORE_PATH")
val productionKeystorePassword = localProjectOrEnvironment(
    "productionKeystorePassword",
    "VIVERO_CAMPO_KEYSTORE_PASSWORD",
)
val productionKeyAlias = localProjectOrEnvironment("productionKeyAlias", "VIVERO_CAMPO_KEY_ALIAS")
val productionKeyPassword = localProjectOrEnvironment("productionKeyPassword", "VIVERO_CAMPO_KEY_PASSWORD")
val productionSigningValues = listOf(
    productionKeystorePath,
    productionKeystorePassword,
    productionKeyAlias,
    productionKeyPassword,
)
val hasProductionSigning = productionSigningValues.all(String::isNotBlank)
if (productionSigningValues.any(String::isNotBlank) && !hasProductionSigning) {
    throw GradleException("La firma de producción está incompleta; proporciona las cuatro propiedades locales o variables de entorno.")
}

android {
    namespace = "com.arles.viverocampo"

    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.arles.viverocampo"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "FIREBASE_ENVIRONMENT", "\"DISABLED\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"\"")
        buildConfigField("String", "FIREBASE_APP_ID", "\"\"")
        buildConfigField("String", "EMULATOR_HOST", "\"\"")
        buildConfigField("String", "LOCAL_STORAGE_NAMESPACE", "\"disabled\"")
    }

    signingConfigs {
        if (hasProductionSigning) {
            create("production") {
                storeFile = file(productionKeystorePath)
                storePassword = productionKeystorePassword
                keyAlias = productionKeyAlias
                keyPassword = productionKeyPassword
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".emulator"
            buildConfigField("String", "FIREBASE_ENVIRONMENT", "\"EMULATOR\"")
            buildConfigField("String", "FIREBASE_PROJECT_ID", "\"demo-vivero-control-etapa3\"")
            buildConfigField("String", "FIREBASE_API_KEY", "\"demo-api-key\"")
            buildConfigField("String", "FIREBASE_APP_ID", "\"1:1234567890:android:demo-etapa3\"")
            buildConfigField("String", "EMULATOR_HOST", "\"${emulatorHost.get()}\"")
            buildConfigField("String", "LOCAL_STORAGE_NAMESPACE", "\"emulator\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "FIREBASE_ENVIRONMENT", "\"PRODUCTION\"")
            buildConfigField("String", "FIREBASE_PROJECT_ID", buildConfigString(productionProjectId))
            buildConfigField("String", "FIREBASE_API_KEY", buildConfigString(productionApiKey))
            buildConfigField("String", "FIREBASE_APP_ID", buildConfigString(productionAppId))
            buildConfigField("String", "EMULATOR_HOST", "\"\"")
            buildConfigField("String", "LOCAL_STORAGE_NAMESPACE", "\"production\"")
            if (hasProductionSigning) signingConfig = signingConfigs.getByName("production")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        warningsAsErrors = true
        // Versiones fijadas como conjunto compatible de la ETAPA 2. Las
        // actualizaciones se revisan deliberadamente, no durante lint.
        disable += setOf(
            "AndroidGradlePluginVersion",
            "GradleDependency",
            "OldTargetApi",
        )
    }
}

dependencyLocking {
    lockAllConfigurations()
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")

    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    implementation(platform("com.google.firebase:firebase-bom:34.15.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-functions")

    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.room:room-ktx:2.8.4")
    ksp("androidx.room:room-compiler:2.8.4")
    implementation("androidx.work:work-runtime-ktx:2.11.2")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("androidx.test:core:1.7.0")
    testImplementation("androidx.room:room-testing:2.8.4")
    testImplementation("org.robolectric:robolectric:4.16.1")
}
