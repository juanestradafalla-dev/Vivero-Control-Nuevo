package com.arles.viverocampo.domain

/**
 * Estados locales del borrador en este dispositivo.
 * No representan el estado central de una línea en Firestore.
 */
enum class SyncState {
    PENDIENTE,
    SINCRONIZANDO,
    ENVIADA,
    ERROR,
}

object CountSyncStateMachine {
    fun canTransition(from: SyncState, to: SyncState): Boolean = when (from) {
        SyncState.PENDIENTE -> to == SyncState.SINCRONIZANDO
        SyncState.SINCRONIZANDO -> to == SyncState.ENVIADA || to == SyncState.ERROR
        SyncState.ERROR -> to == SyncState.PENDIENTE || to == SyncState.SINCRONIZANDO
        SyncState.ENVIADA -> false
    }
}
