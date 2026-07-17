package com.arles.viverocampo.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class LocalRuntimeNamesTest {
    @Test
    fun `Room preferencias WorkManager FirebaseApp y Keystore están aislados por ambiente`() {
        val emulator = identifiers("emulator")
        val production = identifiers("production")

        emulator.zip(production).forEach { (emulatorName, productionName) ->
            assertNotEquals(emulatorName, productionName)
        }
        assertEquals("technical_production", production[0])
        assertEquals("vivero-campo-production.db", production[1])
        assertEquals("vivero_count_send-production", production[2])
        assertEquals("production-count-send-reserva-clave", production[3])
        assertEquals("vivero-control-production", production[4])
        assertEquals("vivero_campo_production_reservation_token_v1", production[5])
    }

    private fun identifiers(namespace: String) = listOf(
        LocalRuntimeNames.preferences(namespace),
        LocalRuntimeNames.database(namespace),
        LocalRuntimeNames.workTag(namespace),
        LocalRuntimeNames.workName(namespace, "reserva", "clave"),
        LocalRuntimeNames.firebaseApp(namespace),
        LocalRuntimeNames.keystoreAlias(namespace),
    )
}
