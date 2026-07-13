package com.arles.viverocampo.data.local

/**
 * Puerto para el almacenamiento local de borradores.
 * Una implementación futura usará Room después de aprobar el modelo persistente.
 */
interface LocalDraftStore {
    suspend fun contains(draftId: String): Boolean
}
