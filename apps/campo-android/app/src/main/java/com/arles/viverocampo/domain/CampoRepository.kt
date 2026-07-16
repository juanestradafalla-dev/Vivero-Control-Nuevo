package com.arles.viverocampo.domain

import kotlinx.coroutines.flow.Flow

interface CampoRepository {
    val emulatorEnabled: Boolean

    suspend fun signIn(email: String, password: String): UserProfile

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
}
