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

    suspend fun latestConfirmedReservation(userId: String): ConfirmedReservation?
}
