package com.arles.viverocampo.data

import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoEnvironment
import com.arles.viverocampo.domain.ActiveJourney
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.InitiateCountCorrectionPayload
import com.arles.viverocampo.domain.InventoryReportConfiguration
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.UserProfile
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.CountSyncOutcome
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.ReturnedCount
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

class DisabledCampoRepository(
    override val environment: CampoEnvironment = CampoEnvironment.DISABLED,
    override val configurationError: String =
        "Firebase no está configurado en esta compilación. No se intentará conectar a producción.",
) : CampoRepository {

    override suspend fun signIn(email: String, password: String): UserProfile = unavailable()

    override suspend fun signOut() = Unit

    override fun observeAccountActive(userId: String): Flow<Boolean> = emptyFlow()

    override suspend fun listActiveJourneys(): List<ActiveJourney> = unavailable()

    override fun observeJourney(journeyId: String): Flow<JourneySnapshot> = emptyFlow()

    override fun observeReturnedCounts(userId: String, journeyId: String): Flow<List<ReturnedCount>> = emptyFlow()

    override suspend fun reserveLine(
        payload: ReserveLinePayload,
        userId: String,
        inventoryReportConfiguration: InventoryReportConfiguration?,
    ): ConfirmedReservation = unavailable()

    override suspend fun initiateCountCorrection(
        payload: InitiateCountCorrectionPayload,
        userId: String,
        initialInput: CountInput,
        inventoryReportConfiguration: InventoryReportConfiguration?,
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
        deadPlantsRequired: Boolean,
    ): LocalCountDraft = unavailable()

    override suspend fun synchronizeCount(reservationId: String): CountSyncOutcome = unavailable()

    private fun unavailable(): Nothing = throw CampoRepositoryException(
        "FIREBASE_DISABLED",
        configurationError,
    )
}
