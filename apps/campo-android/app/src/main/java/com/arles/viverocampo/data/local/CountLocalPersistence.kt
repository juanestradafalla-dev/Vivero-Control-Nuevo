package com.arles.viverocampo.data.local

import androidx.room.withTransaction
import com.arles.viverocampo.domain.SyncState
import com.arles.viverocampo.domain.RELEASED_RESERVATION_MESSAGE

class CountLocalPersistence(private val database: ViveroCampoDatabase) {
    suspend fun markReleasedAndKeepDraft(reservationId: String) {
        database.withTransaction {
            database.confirmedReservationDao().updateState(reservationId, "LIBERADA")
            val current = database.countDraftDao().byReservationId(reservationId) ?: return@withTransaction
            database.countDraftDao().save(
                current.copy(
                    syncState = SyncState.ERROR.name,
                    errorCode = "RESERVATION_RELEASED",
                    errorMessage = RELEASED_RESERVATION_MESSAGE,
                    updatedAtEpochMillis = System.currentTimeMillis(),
                ),
            )
        }
    }

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
