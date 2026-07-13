package com.arles.viverocampo.domain

data class UserProfile(
    val id: String,
    val name: String,
    val role: String,
)

data class VisibleLocation(
    val nursery: String,
    val module: String,
    val bed: String,
    val line: String,
    val displayName: String,
    val order: Int,
)

data class JourneyLine(
    val id: String,
    val state: String,
    val version: Int,
    val location: VisibleLocation,
)

data class JourneySnapshot(
    val id: String,
    val displayName: String,
    val lines: List<JourneyLine>,
)

data class ReserveLinePayload(
    val jornadaLineaId: String,
    val dispositivoId: String,
    val claveIdempotencia: String,
) {
    fun toWireMap(): Map<String, String> = mapOf(
        "jornadaLineaId" to jornadaLineaId,
        "dispositivoId" to dispositivoId,
        "claveIdempotencia" to claveIdempotencia,
    )
}

data class ConfirmedReservation(
    val reservationId: String,
    val userId: String,
    val journeyLineId: String,
    val state: String,
    val confirmedAt: String,
    val version: Int,
    val location: VisibleLocation,
)

class CampoRepositoryException(
    val code: String,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)
