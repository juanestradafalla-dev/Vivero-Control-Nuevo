package com.arles.viverocampo.data

import com.arles.viverocampo.core.FirebaseEmulatorServices
import com.arles.viverocampo.data.local.ConfirmedReservationDao
import com.arles.viverocampo.data.local.ConfirmedReservationEntity
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.UserProfile
import com.arles.viverocampo.domain.VisibleLocation
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class FirebaseCampoRepository(
    private val services: FirebaseEmulatorServices,
    private val reservationDao: ConfirmedReservationDao,
) : CampoRepository {
    override val emulatorEnabled: Boolean = true

    override suspend fun signIn(email: String, password: String): UserProfile {
        try {
            val user = services.auth.signInWithEmailAndPassword(email.trim(), password).await().user
                ?: throw CampoRepositoryException("UNAUTHENTICATED", "No fue posible iniciar sesión.")
            val profile = services.firestore.collection("usuarios").document(user.uid).get().await()
            if (!profile.exists()) {
                services.auth.signOut()
                throw CampoRepositoryException("USER_NOT_FOUND", "La cuenta no tiene un perfil operativo.")
            }
            if (profile.getBoolean("activo") != true) {
                services.auth.signOut()
                throw CampoRepositoryException("USER_INACTIVE", "La cuenta está inactiva.")
            }
            val role = (profile.get("roles") as? List<*>)?.firstOrNull() as? String
                ?: throw CampoRepositoryException("PERMISSION_DENIED", "La cuenta no tiene un rol operativo.")
            return UserProfile(
                id = user.uid,
                name = profile.getString("nombreVisible") ?: "Usuario de prueba",
                role = role,
            )
        } catch (error: CampoRepositoryException) {
            throw error
        } catch (error: Exception) {
            throw CampoRepositoryException("UNAUTHENTICATED", "Correo o contraseña de prueba incorrectos.", error)
        }
    }

    override suspend fun signOut() {
        services.auth.signOut()
    }

    override fun observeActiveJourney(): Flow<JourneySnapshot> = callbackFlow {
        var journeyName: String? = null
        var lines: List<JourneyLine>? = null

        fun publishWhenReady() {
            val currentName = journeyName ?: return
            val currentLines = lines ?: return
            trySend(JourneySnapshot(ACTIVE_JOURNEY_ID, currentName, currentLines))
        }

        val journeyRegistration = services.firestore.collection("jornadas")
            .document(ACTIVE_JOURNEY_ID)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer la jornada de prueba.", error))
                } else if (snapshot?.exists() == true) {
                    journeyName = snapshot.getString("nombreVisible") ?: ACTIVE_JOURNEY_ID
                    publishWhenReady()
                }
            }
        val linesRegistration = services.firestore.collection("jornadaLineas")
            .whereEqualTo("jornadaId", ACTIVE_JOURNEY_ID)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer las líneas de prueba.", error))
                } else if (snapshot != null) {
                    lines = snapshot.documents.mapNotNull { document ->
                        val location = parseLocation(document.get("ubicacion")) ?: return@mapNotNull null
                        JourneyLine(
                            id = document.id,
                            state = document.getString("estadoCentral") ?: return@mapNotNull null,
                            version = document.getLong("version")?.toInt() ?: 0,
                            location = location,
                        )
                    }.sortedBy { it.location.order }
                    publishWhenReady()
                }
            }

        awaitClose {
            journeyRegistration.remove()
            linesRegistration.remove()
        }
    }

    override suspend fun reserveLine(
        payload: ReserveLinePayload,
        userId: String,
    ): ConfirmedReservation {
        try {
            val response = services.functions.getHttpsCallable("reservarLinea")
                .call(payload.toWireMap())
                .await()
                .data as? Map<*, *>
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "El backend devolvió una respuesta inválida.")
            val reservation = parseReservation(response, userId)
            reservationDao.save(reservation.toEntity())
            return reservation
        } catch (error: CampoRepositoryException) {
            throw error
        } catch (error: FirebaseFunctionsException) {
            val controlledCode = (error.details as? Map<*, *>)?.get("code") as? String
                ?: "NETWORK_ERROR"
            throw CampoRepositoryException(controlledCode, error.message ?: "No fue posible reservar la línea.", error)
        } catch (error: Exception) {
            throw CampoRepositoryException(
                "NETWORK_ERROR",
                "No se recibió confirmación central. Reintenta con la misma solicitud.",
                error,
            )
        }
    }

    override suspend fun latestConfirmedReservation(userId: String): ConfirmedReservation? =
        reservationDao.latestForUser(userId)?.toDomain()

    private fun parseReservation(response: Map<*, *>, userId: String): ConfirmedReservation {
        val token = response["tokenReserva"] as? String
        if (token.isNullOrBlank()) {
            throw CampoRepositoryException("INVALID_RESPONSE", "La confirmación no contiene un token opaco válido.")
        }
        return ConfirmedReservation(
            reservationId = response["reservaId"] as? String
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "Falta reservaId."),
            userId = userId,
            journeyLineId = response["jornadaLineaId"] as? String
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "Falta jornadaLineaId."),
            state = response["estadoCentral"] as? String
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "Falta estadoCentral."),
            confirmedAt = response["reservadaEn"] as? String
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "Falta reservadaEn."),
            version = (response["version"] as? Number)?.toInt()
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "Falta version."),
            location = parseLocation(response["ubicacion"])
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "Falta ubicación."),
        )
    }

    private fun parseLocation(value: Any?): VisibleLocation? {
        val location = value as? Map<*, *> ?: return null
        return VisibleLocation(
            nursery = location["vivero"] as? String ?: return null,
            module = location["modulo"] as? String ?: return null,
            bed = location["cama"] as? String ?: return null,
            line = location["linea"] as? String ?: return null,
            displayName = location["nombreVisible"] as? String ?: return null,
            order = (location["orden"] as? Number)?.toInt() ?: return null,
        )
    }

    private fun ConfirmedReservation.toEntity() = ConfirmedReservationEntity(
        reservationId = reservationId,
        userId = userId,
        journeyLineId = journeyLineId,
        state = state,
        confirmedAt = confirmedAt,
        version = version,
        nursery = location.nursery,
        module = location.module,
        bed = location.bed,
        line = location.line,
        displayName = location.displayName,
        orderValue = location.order,
    )

    private fun ConfirmedReservationEntity.toDomain() = ConfirmedReservation(
        reservationId = reservationId,
        userId = userId,
        journeyLineId = journeyLineId,
        state = state,
        confirmedAt = confirmedAt,
        version = version,
        location = VisibleLocation(nursery, module, bed, line, displayName, orderValue),
    )

    private companion object {
        const val ACTIVE_JOURNEY_ID = "JORNADA-PRUEBA-ETAPA-3"
    }
}
