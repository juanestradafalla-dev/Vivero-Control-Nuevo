package com.arles.viverocampo.core

import android.content.Context
import com.arles.viverocampo.BuildConfig
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions

data class FirebaseEmulatorServices(
    val auth: FirebaseAuth,
    val firestore: FirebaseFirestore,
    val functions: FirebaseFunctions,
)

object FirebaseEmulatorInitializer {
    private const val APP_NAME = "vivero-control-demo-etapa-3"
    private var cachedServices: FirebaseEmulatorServices? = null

    @Synchronized
    fun initialize(context: Context): FirebaseEmulatorServices? {
        if (!BuildConfig.EMULATOR_ENABLED) return null
        cachedServices?.let { return it }
        require(BuildConfig.FIREBASE_PROJECT_ID.startsWith("demo-")) {
            "La compilación debug solo admite proyectos demo-."
        }
        val app = FirebaseApp.getApps(context).firstOrNull { it.name == APP_NAME }
            ?: FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                    .setApiKey(BuildConfig.FIREBASE_API_KEY)
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                    .build(),
                APP_NAME,
            )
        val auth = FirebaseAuth.getInstance(app)
        val firestore = FirebaseFirestore.getInstance(app)
        val functions = FirebaseFunctions.getInstance(app, "us-central1")
        auth.useEmulator(BuildConfig.EMULATOR_HOST, 9099)
        firestore.useEmulator(BuildConfig.EMULATOR_HOST, 8180)
        functions.useEmulator(BuildConfig.EMULATOR_HOST, 5001)
        return FirebaseEmulatorServices(auth, firestore, functions).also { cachedServices = it }
    }
}
