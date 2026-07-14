package com.arles.viverocampo.data.local

import androidx.room.withTransaction
import com.arles.viverocampo.domain.SyncState

class CountLocalPersistence(private val database: ViveroCampoDatabase) {
    suspend fun markSentAndRemoveToken(
        reservationId: String,
        countId: String,
        centralState: String,
        serverReceivedAt: String,
    ) {
        database.withTransaction {
            val current = database.countDraftDao().byReservationId(reservationId) ?: return@withTransaction
            database.countDraftDao().save(
                current.copy(
                    syncState = SyncState.ENVIADA.name,
                    errorCode = null,
                    errorMessage = null,
                    countId = countId,
                    centralState = centralState,
                    serverReceivedAt = serverReceivedAt,
                    updatedAtEpochMillis = System.currentTimeMillis(),
                ),
            )
            database.confirmedReservationDao().clearEncryptedToken(reservationId)
        }
    }
}
