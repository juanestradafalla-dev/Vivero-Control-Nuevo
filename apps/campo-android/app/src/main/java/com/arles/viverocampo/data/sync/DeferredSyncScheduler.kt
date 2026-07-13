package com.arles.viverocampo.data.sync

/**
 * Puerto para programar reintentos idempotentes.
 * Una implementación futura usará WorkManager; esta etapa no agenda trabajos reales.
 */
interface DeferredSyncScheduler {
    fun schedule(syncOperationId: String)
}
