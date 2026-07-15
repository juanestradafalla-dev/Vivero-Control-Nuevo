package com.arles.viverocampo.domain

import kotlinx.coroutines.flow.Flow

interface CampoRepository {
    val emulatorEnabled: Boolean

    suspend fun signIn(email: String, password: String): UserProfile

    suspend fun signOut()

    fun observeActiveJourney(): Flow<JourneySnapshot>

    suspend fun reserveLine(
        payload: ReserveLinePayload,
        userId: String,
    ): ConfirmedReservation

    suspend fun latestActiveReservation(userId: String, deviceId: String): ConfirmedReservation?

    fun observeCountDraft(reservationId: String, userId: String, deviceId: String): Flow<LocalCountDraft?>

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
