package com.arles.viverocampo.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncStateTest {
    @Test
    fun `ENVIADA existe solo en estados locales`() {
        assertEquals(listOf("PENDIENTE", "SINCRONIZANDO", "ENVIADA", "ERROR"), SyncState.entries.map { it.name })
        assertFalse("PENDIENTE_REVISION" in SyncState.entries.map { it.name })
    }

    @Test
    fun `máquina de estados no permite ENVIADA antes de confirmación central`() {
        assertTrue(CountSyncStateMachine.canTransition(SyncState.PENDIENTE, SyncState.SINCRONIZANDO))
        assertFalse(CountSyncStateMachine.canTransition(SyncState.PENDIENTE, SyncState.ENVIADA))
        assertTrue(CountSyncStateMachine.canTransition(SyncState.SINCRONIZANDO, SyncState.ENVIADA))
        assertTrue(CountSyncStateMachine.canTransition(SyncState.SINCRONIZANDO, SyncState.ERROR))
        assertFalse(CountSyncStateMachine.canTransition(SyncState.ENVIADA, SyncState.PENDIENTE))
    }
}
