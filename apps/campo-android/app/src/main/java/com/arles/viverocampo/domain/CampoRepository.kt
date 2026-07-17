package com.arles.viverocampo.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

enum class CampoEnvironment {
    EMULATOR,
    PRODUCTION,
    DISABLED,
}

interface CampoRepository {
    val environment: CampoEnvironment
    val configurationError: String?
        get() = null
    val accessEnabled: Boolean
        get() = environment != CampoEnvironment.DISABLED && configurationError == null
    val mutableOperationsEnabled: Boolean
        get() = environment in setOf(CampoEnvironment.EMULATOR, CampoEnvironment.PRODUCTION) && configurationError == null

    suspend fun signIn(email: String, password: String): UserProfile

    suspend fun restoreSession(): SessionRestoreResult = SessionRestoreResult.NoSession

    suspend fun signOut()

    fun observeAccountActive(userId: String): Flow<Boolean>

    suspend fun listActiveJourneys(): List<ActiveJourney>

    fun observeJourney(journeyId: String): Flow<JourneySnapshot>

    fun observeReturnedCounts(userId: String, journeyId: String): Flow<List<ReturnedCount>>

    suspend fun reserveLine(
        payload: ReserveLinePayload,
        userId: String,
    ): ConfirmedReservation

    suspend fun initiateCountCorrection(
        payload: InitiateCountCorrectionPayload,
        userId: String,
        initialInput: CountInput,
    ): ConfirmedReservation

    suspend fun latestActiveReservation(userId: String, deviceId: String): ConfirmedReservation?

    fun observeCountDraft(reservationId: String, userId: String, deviceId: String): Flow<LocalCountDraft?>

    fun observeReservationState(reservationId: String): Flow<String>

    suspend fun markReservationReleased(reservationId: String)

    suspend fun saveCountInput(reservationId: String, userId: String, deviceId: String, input: CountInput)

    suspend fun freezeCountAttempt(
        reservationId: String,
        userId: String,
        deviceId: String,
        idempotencyKey: String,
        deviceTimestamp: String,
    ): LocalCountDraft

    suspend fun synchronizeCount(reservationId: String): CountSyncOutcome

    suspend fun listDiscardLines(): List<DiscardLine> = emptyList()

    suspend fun latestPendingDiscard(userId: String, deviceId: String): LocalDiscardDraft? = null

    suspend fun startDiscardDraft(
        draftId: String,
        line: DiscardLine,
        userId: String,
        deviceId: String,
    ): LocalDiscardDraft = throw CampoRepositoryException("NOT_IMPLEMENTED", "Descartes no disponibles.")

    fun observeDiscardDraft(draftId: String, userId: String, deviceId: String): Flow<LocalDiscardDraft?> = emptyFlow()

    suspend fun saveDiscardInput(
        draftId: String,
        userId: String,
        deviceId: String,
        input: DiscardInput,
    ) = Unit

    suspend fun freezeDiscardAttempt(
        draftId: String,
        userId: String,
        deviceId: String,
        idempotencyKey: String,
        deviceTimestamp: String,
    ): LocalDiscardDraft = throw CampoRepositoryException("NOT_IMPLEMENTED", "Descartes no disponibles.")

    suspend fun synchronizeDiscard(draftId: String): DiscardSyncOutcome =
        DiscardSyncOutcome.PermanentFailure("NOT_IMPLEMENTED")

    suspend fun abandonDiscardDraft(draftId: String, userId: String, deviceId: String) = Unit
}
