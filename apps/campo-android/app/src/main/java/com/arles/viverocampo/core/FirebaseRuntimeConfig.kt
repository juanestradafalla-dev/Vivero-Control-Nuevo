package com.arles.viverocampo.core

import com.arles.viverocampo.BuildConfig
import com.arles.viverocampo.domain.CampoEnvironment

data class FirebaseRuntimeConfig(
    val environmentName: String,
    val projectId: String,
    val apiKey: String,
    val applicationId: String,
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
                apiKey.isBlank() || applicationId.isBlank() || emulatorHost.isBlank() ->
                    "Falta la configuración local del Firebase Emulator Suite."
                localStorageNamespace != "emulator" -> "El almacenamiento local de EMULATOR no está aislado."
                else -> null
            }
            CampoEnvironment.STAGING -> when {
                projectId != STAGING_PROJECT_ID ->
                    "STAGING solo admite el proyecto $STAGING_PROJECT_ID."
                apiKey.isBlank() || applicationId.isBlank() ->
                    "Falta stagingFirebaseApiKey o stagingFirebaseAppId en la configuración local."
                emulatorHost.isNotBlank() -> "STAGING no puede usar un host de emulador."
                localStorageNamespace != "staging" -> "El almacenamiento local de STAGING no está aislado."
                else -> null
            }
            CampoEnvironment.DISABLED ->
                "Firebase está deshabilitado en esta compilación. No se intentará conectar a un proyecto real."
        }
    }

    companion object {
        const val STAGING_PROJECT_ID = "viverocontrol-3f83f"

        fun fromBuildConfig() = FirebaseRuntimeConfig(
            environmentName = BuildConfig.FIREBASE_ENVIRONMENT,
            projectId = BuildConfig.FIREBASE_PROJECT_ID,
            apiKey = BuildConfig.FIREBASE_API_KEY,
            applicationId = BuildConfig.FIREBASE_APP_ID,
            emulatorHost = BuildConfig.EMULATOR_HOST,
            localStorageNamespace = BuildConfig.LOCAL_STORAGE_NAMESPACE,
        )
    }
}
