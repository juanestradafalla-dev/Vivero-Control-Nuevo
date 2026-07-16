package com.arles.viverocampo.core

import com.arles.viverocampo.domain.CampoEnvironment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FirebaseRuntimeConfigTest {
    @Test
    fun `emulator conserva proyecto demo y enrutamiento local`() {
        val config = config(
            environment = "EMULATOR",
            projectId = "demo-vivero-control-etapa3",
            emulatorHost = "10.0.2.2",
            namespace = "emulator",
        )

        assertNull(config.validationError())
        assertEquals(CampoEnvironment.EMULATOR, config.environment)
        assertTrue(config.usesEmulators)
    }

    @Test
    fun `staging válido usa Firebase real sin host de emulador`() {
        val config = config(
            environment = "STAGING",
            projectId = FirebaseRuntimeConfig.STAGING_PROJECT_ID,
            emulatorHost = "",
            namespace = "staging",
        )

        assertNull(config.validationError())
        assertEquals(CampoEnvironment.STAGING, config.environment)
        assertFalse(config.usesEmulators)
    }

    @Test
    fun `staging rechaza proyecto diferente`() {
        val error = config(
            environment = "STAGING",
            projectId = "otro-proyecto-real",
            emulatorHost = "",
            namespace = "staging",
        ).validationError()

        assertTrue(error.orEmpty().contains(FirebaseRuntimeConfig.STAGING_PROJECT_ID))
    }

    @Test
    fun `staging falla de forma segura sin API key o App ID`() {
        val config = FirebaseRuntimeConfig(
            environmentName = "STAGING",
            projectId = FirebaseRuntimeConfig.STAGING_PROJECT_ID,
            apiKey = "",
            applicationId = "",
            emulatorHost = "",
            localStorageNamespace = "staging",
        )

        assertTrue(config.validationError().orEmpty().contains("stagingFirebaseApiKey"))
    }

    private fun config(
        environment: String,
        projectId: String,
        emulatorHost: String,
        namespace: String,
    ) = FirebaseRuntimeConfig(
        environmentName = environment,
        projectId = projectId,
        apiKey = "api-key-ficticia",
        applicationId = "1:1234567890:android:app-ficticia",
        emulatorHost = emulatorHost,
        localStorageNamespace = namespace,
    )
}
