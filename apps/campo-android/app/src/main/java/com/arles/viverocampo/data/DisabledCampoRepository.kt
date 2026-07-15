package com.arles.viverocampo.data

import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.InitiateCountCorrectionPayload
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.UserProfile
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.CountSyncOutcome
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.ReturnedCount
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

class DisabledCampoRepository : CampoRepository {
    override val emulatorEnabled: Boolean = false

    override suspend fun signIn(email: String, password: String): UserProfile = unavailable()

    override suspend fun signOut() = Unit

    override fun observeActiveJourney(): Flow<JourneySnapshot> = emptyFlow()

    override fun observeReturnedCounts(userId: String): Flow<List<ReturnedCount>> = emptyFlow()

    override suspend fun reserveLine(
        payload: ReserveLinePayload,
        userId: String,
    ): ConfirmedReservation = unavailable()

    override suspend fun initiateCountCorrection(
        payload: InitiateCountCorrectionPayload,
        userId: String,
        initialInput: CountInput,
    ): ConfirmedReservation = unavailable()

    override suspend fun latestActiveReservation(userId: String, deviceId: String): ConfirmedReservation? = null

    override fun observeCountDraft(reservationId: String, userId: String, deviceId: String): Flow<LocalCountDraft?> = emptyFlow()

    override fun observeReservationState(reservationId: String): Flow<String> = emptyFlow()

    override suspend fun markReservationReleased(reservationId: String) = unavailable()

    override suspend fun saveCountInput(reservationId: String, userId: String, deviceId: String, input: CountInput) = unavailable()

    override suspend fun freezeCountAttempt(
        reservationId: String,
        userId: String,
        deviceId: String,
        idempotencyKey: String,
        deviceTimestamp: String,
    ): LocalCountDraft = unavailable()

    override suspend fun synchronizeCount(reservationId: String): CountSyncOutcome = unavailable()

    private fun unavailable(): Nothing = throw CampoRepositoryException(
        "FIREBASE_DISABLED",
        "Firebase no está configurado en esta compilación. No se intentará conectar a producción.",
    )
}
