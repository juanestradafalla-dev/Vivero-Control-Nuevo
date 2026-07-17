package com.arles.viverocampo.core

import com.arles.viverocampo.domain.CampoEnvironment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FirebaseRuntimeConfigTest {
    @Test
    fun `emulator conserva proyecto demo applicationId aislado y enrutamiento local`() {
        val config = config(
            environment = "EMULATOR",
            projectId = "demo-vivero-control-etapa3",
            androidApplicationId = "${FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID}.emulator",
            emulatorHost = "10.0.2.2",
            namespace = "emulator",
        )

        assertNull(config.validationError())
        assertEquals(CampoEnvironment.EMULATOR, config.environment)
        assertTrue(config.usesEmulators)
    }

    @Test
    fun `production válida usa el proyecto y applicationId exactos sin emuladores`() {
        val config = config(
            environment = "PRODUCTION",
            projectId = FirebaseRuntimeConfig.PRODUCTION_PROJECT_ID,
            androidApplicationId = FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID,
            emulatorHost = "",
            namespace = "production",
        )

        assertNull(config.validationError())
        assertEquals(CampoEnvironment.PRODUCTION, config.environment)
        assertFalse(config.usesEmulators)
    }

    @Test
    fun `production rechaza proyecto diferente`() {
        val error = config(
            environment = "PRODUCTION",
            projectId = "otro-proyecto-real",
            androidApplicationId = FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID,
            emulatorHost = "",
            namespace = "production",
        ).validationError()

        assertTrue(error.orEmpty().contains(FirebaseRuntimeConfig.PRODUCTION_PROJECT_ID))
    }

    @Test
    fun `production rechaza applicationId o configuración incompletos`() {
        val wrongApplicationId = config(
            environment = "PRODUCTION",
            projectId = FirebaseRuntimeConfig.PRODUCTION_PROJECT_ID,
            androidApplicationId = "${FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID}.otro",
            emulatorHost = "",
            namespace = "production",
        )
        val missingFirebaseIdentifiers = FirebaseRuntimeConfig(
            environmentName = "PRODUCTION",
            projectId = FirebaseRuntimeConfig.PRODUCTION_PROJECT_ID,
            apiKey = "",
            applicationId = "",
            androidApplicationId = FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID,
            emulatorHost = "",
            localStorageNamespace = "production",
        )

        assertTrue(wrongApplicationId.validationError().orEmpty().contains("applicationId"))
        assertTrue(missingFirebaseIdentifiers.validationError().orEmpty().contains("productionFirebaseApiKey"))
    }

    @Test
    fun `production rechaza host de emulador o namespace incorrecto`() {
        val emulatorHostError = config(
            environment = "PRODUCTION",
            projectId = FirebaseRuntimeConfig.PRODUCTION_PROJECT_ID,
            androidApplicationId = FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID,
            emulatorHost = "10.0.2.2",
            namespace = "production",
        ).validationError()
        val namespaceError = config(
            environment = "PRODUCTION",
            projectId = FirebaseRuntimeConfig.PRODUCTION_PROJECT_ID,
            androidApplicationId = FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID,
            emulatorHost = "",
            namespace = "otro",
        ).validationError()

        assertTrue(emulatorHostError.orEmpty().contains("no puede usar"))
        assertTrue(namespaceError.orEmpty().contains("no está aislado"))
    }

    @Test
    fun `no existe un ambiente funcional adicional`() {
        val config = config(
            environment = "LEGACY",
            projectId = FirebaseRuntimeConfig.PRODUCTION_PROJECT_ID,
            androidApplicationId = FirebaseRuntimeConfig.PRODUCTION_APPLICATION_ID,
            emulatorHost = "",
            namespace = "production",
        )

        assertEquals(CampoEnvironment.DISABLED, config.environment)
        assertTrue(config.validationError().orEmpty().contains("desconectada"))
    }

    private fun config(
        environment: String,
        projectId: String,
        androidApplicationId: String,
        emulatorHost: String,
        namespace: String,
    ) = FirebaseRuntimeConfig(
        environmentName = environment,
        projectId = projectId,
        apiKey = "api-key-ficticia",
        applicationId = "1:1234567890:android:app-ficticia",
        androidApplicationId = androidApplicationId,
        emulatorHost = emulatorHost,
        localStorageNamespace = namespace,
    )
}
