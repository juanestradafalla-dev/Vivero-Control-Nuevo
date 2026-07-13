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
