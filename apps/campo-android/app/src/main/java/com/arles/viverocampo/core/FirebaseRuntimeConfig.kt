package com.arles.viverocampo.core

import com.arles.viverocampo.BuildConfig
import com.arles.viverocampo.domain.CampoEnvironment

data class FirebaseRuntimeConfig(
    val environmentName: String,
    val projectId: String,
    val apiKey: String,
    val applicationId: String,
    val androidApplicationId: String,
    val emulatorHost: String,
    val localStorageNamespace: String,
) {
    val environment: CampoEnvironment
        get() = CampoEnvironment.entries.firstOrNull { it.name == environmentName } ?: CampoEnvironment.DISABLED

    val usesEmulators: Boolean
        get() = environment == CampoEnvironment.EMULATOR

    fun validationError(): String? {
        if (environmentName !in CampoEnvironment.entries.map { it.name }) {
            return "Entorno Firebase desconocido. La aplicación permanecerá desconectada."
        }
        return when (environment) {
            CampoEnvironment.EMULATOR -> when {
                !projectId.startsWith("demo-") -> "El modo EMULATOR solo admite proyectos demo-."
                androidApplicationId != "$PRODUCTION_APPLICATION_ID.emulator" ->
                    "EMULATOR debe usar el applicationId aislado $PRODUCTION_APPLICATION_ID.emulator."
                apiKey.isBlank() || applicationId.isBlank() || emulatorHost.isBlank() ->
                    "Falta la configuración local del Firebase Emulator Suite."
                localStorageNamespace != "emulator" -> "El almacenamiento local de EMULATOR no está aislado."
                else -> null
            }
            CampoEnvironment.PRODUCTION -> when {
                projectId != PRODUCTION_PROJECT_ID ->
                    "PRODUCTION solo admite el proyecto $PRODUCTION_PROJECT_ID."
                androidApplicationId != PRODUCTION_APPLICATION_ID ->
                    "PRODUCTION exige el applicationId $PRODUCTION_APPLICATION_ID."
                apiKey.isBlank() || applicationId.isBlank() ->
                    "Falta productionFirebaseApiKey o productionFirebaseAppId en la configuración local."
                emulatorHost.isNotBlank() -> "PRODUCTION no puede usar un host de emulador."
                localStorageNamespace != "production" -> "El almacenamiento local de PRODUCTION no está aislado."
                else -> null
            }
            CampoEnvironment.DISABLED ->
                "Firebase está deshabilitado en esta compilación. No se intentará conectar a un proyecto real."
        }
    }

    companion object {
        const val PRODUCTION_PROJECT_ID = "viverocontrol-3f83f"
        const val PRODUCTION_APPLICATION_ID = "com.arles.viverocampo"

        fun fromBuildConfig() = FirebaseRuntimeConfig(
            environmentName = BuildConfig.FIREBASE_ENVIRONMENT,
            projectId = BuildConfig.FIREBASE_PROJECT_ID,
            apiKey = BuildConfig.FIREBASE_API_KEY,
            applicationId = BuildConfig.FIREBASE_APP_ID,
            androidApplicationId = BuildConfig.APPLICATION_ID,
            emulatorHost = BuildConfig.EMULATOR_HOST,
            localStorageNamespace = BuildConfig.LOCAL_STORAGE_NAMESPACE,
        )
    }
}
