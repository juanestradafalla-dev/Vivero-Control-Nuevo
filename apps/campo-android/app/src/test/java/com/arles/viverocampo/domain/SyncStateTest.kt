package com.arles.viverocampo.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SyncStateTest {
    @Test
    fun `defines only local synchronization states`() {
        val names = SyncState.entries.map { it.name }

        assertEquals(
            listOf("PENDIENTE", "SINCRONIZANDO", "ENVIADA", "ERROR"),
            names,
        )
        assertFalse("PENDIENTE_REVISION" in names)
    }
}
