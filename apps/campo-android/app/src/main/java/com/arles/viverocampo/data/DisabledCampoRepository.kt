package com.arles.viverocampo.data

import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

class DisabledCampoRepository : CampoRepository {
    override val emulatorEnabled: Boolean = false

    override suspend fun signIn(email: String, password: String): UserProfile = unavailable()

    override suspend fun signOut() = Unit

    override fun observeActiveJourney(): Flow<JourneySnapshot> = emptyFlow()

    override suspend fun reserveLine(
        payload: ReserveLinePayload,
        userId: String,
    ): ConfirmedReservation = unavailable()

    override suspend fun latestConfirmedReservation(userId: String): ConfirmedReservation? = null

    private fun unavailable(): Nothing = throw CampoRepositoryException(
        "FIREBASE_DISABLED",
        "Firebase no está configurado en esta compilación. No se intentará conectar a producción.",
    )
}
