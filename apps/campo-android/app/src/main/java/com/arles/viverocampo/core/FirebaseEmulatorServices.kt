package com.arles.viverocampo.core

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions

data class FirebaseServices(
    val auth: FirebaseAuth,
    val firestore: FirebaseFirestore,
    val functions: FirebaseFunctions,
)

data class FirebaseServicesInitialization(
    val config: FirebaseRuntimeConfig,
    val services: FirebaseServices?,
    val errorMessage: String?,
)

object FirebaseServicesInitializer {
    private var cachedServices: FirebaseServices? = null

    @Synchronized
    fun initialize(
        context: Context,
        config: FirebaseRuntimeConfig = FirebaseRuntimeConfig.fromBuildConfig(),
    ): FirebaseServicesInitialization {
        val configurationError = config.validationError()
        if (configurationError != null) return FirebaseServicesInitialization(config, null, configurationError)
        cachedServices?.let { return FirebaseServicesInitialization(config, it, null) }
        val appName = LocalRuntimeNames.firebaseApp(config.localStorageNamespace)
        val app = FirebaseApp.getApps(context).firstOrNull { it.name == appName }
            ?: FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setProjectId(config.projectId)
                    .setApiKey(config.apiKey)
                    .setApplicationId(config.applicationId)
                    .build(),
                appName,
            )
        val auth = FirebaseAuth.getInstance(app)
        val firestore = FirebaseFirestore.getInstance(app)
        val functions = FirebaseFunctions.getInstance(app, "us-central1")
        if (config.usesEmulators) {
            auth.useEmulator(config.emulatorHost, 9099)
            firestore.useEmulator(config.emulatorHost, 8180)
            functions.useEmulator(config.emulatorHost, 5001)
        }
        val services = FirebaseServices(auth, firestore, functions).also { cachedServices = it }
        return FirebaseServicesInitialization(config, services, null)
    }
}
