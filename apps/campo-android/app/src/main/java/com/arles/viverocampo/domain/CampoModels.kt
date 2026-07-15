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

data class InitiateCountCorrectionPayload(
    val conteoId: String,
    val dispositivoId: String,
    val claveIdempotencia: String,
) {
    fun toWireMap(): Map<String, String> = mapOf(
        "conteoId" to conteoId,
        "dispositivoId" to dispositivoId,
        "claveIdempotencia" to claveIdempotencia,
    )
}

data class ConfirmedReservation(
    val reservationId: String,
    val userId: String,
    val deviceId: String,
    val journeyId: String,
    val journeyLineId: String,
    val state: String,
    val confirmedAt: String,
    val version: Int,
    val location: VisibleLocation,
    val reservationType: String = "INICIAL",
    val previousCountId: String? = null,
    val nextCountVersion: Int = 1,
)

data class ReturnedCount(
    val countId: String,
    val journeyLineId: String,
    val version: Int,
    val reason: String,
    val input: CountInput,
    val location: VisibleLocation,
    val originalAuthorUserId: String = "",
    val originalAuthorName: String = "Usuario de prueba",
    val correctionResponsibleUserId: String = "",
    val correctionResponsibleName: String = "Usuario de prueba",
    val reassignedByName: String? = null,
    val reassignmentReason: String? = null,
    val isReassigned: Boolean = false,
    val canCorrect: Boolean = true,
)

data class CountInput(
    val females: String = "",
    val males: String = "",
    val rootstocks: String = "",
    val observations: String = "",
)

data class CountFieldErrors(
    val females: String? = null,
    val males: String? = null,
    val rootstocks: String? = null,
    val observations: String? = null,
)

data class CountValidation(
    val errors: CountFieldErrors,
    val females: Long?,
    val males: Long?,
    val rootstocks: Long?,
    val total: Long?,
) {
    val valid: Boolean = errors == CountFieldErrors()
    val zeroWarning: Boolean = valid && total == 0L
}

object CountFormValidator {
    const val MAX_SAFE_INTEGER: Long = 9_007_199_254_740_991L
    const val OBSERVATIONS_TRANSPORT_LIMIT = 4_000

    fun validate(input: CountInput): CountValidation {
        val females = parseQuantity(input.females)
        val males = parseQuantity(input.males)
        val rootstocks = parseQuantity(input.rootstocks)
        val values = listOfNotNull(females.first, males.first, rootstocks.first)
        val total = if (values.size == 3) values.sum().takeIf { it <= MAX_SAFE_INTEGER } else null
        val overflowMessage = if (values.size == 3 && total == null) "La suma supera el rango técnico permitido." else null
        return CountValidation(
            errors = CountFieldErrors(
                females = females.second ?: overflowMessage,
                males = males.second ?: overflowMessage,
                rootstocks = rootstocks.second ?: overflowMessage,
                observations = if (input.observations.length > OBSERVATIONS_TRANSPORT_LIMIT) {
                    "Las observaciones superan la protección técnica de 4.000 caracteres."
                } else {
                    null
                },
            ),
            females = females.first,
            males = males.first,
            rootstocks = rootstocks.first,
            total = total,
        )
    }

    private fun parseQuantity(value: String): Pair<Long?, String?> {
        if (value.isBlank()) return null to "Este valor es obligatorio."
        if (!value.all(Char::isDigit)) return null to "Usa únicamente enteros mayores o iguales a cero."
        val parsed = value.toLongOrNull()
            ?: return null to "El valor supera el rango técnico permitido."
        if (parsed > MAX_SAFE_INTEGER) return null to "El valor supera el rango seguro permitido."
        return parsed to null
    }
}

data class FrozenCountPayload(
    val reservationId: String,
    val deviceId: String,
    val females: Long,
    val males: Long,
    val rootstocks: Long,
    val observations: String,
    val deviceTimestamp: String,
    val idempotencyKey: String,
) {
    fun toWireMap(token: String): Map<String, Any> = buildMap {
        put("reservaId", reservationId)
        put("tokenReserva", token)
        put("dispositivoId", deviceId)
        put("hembras", females)
        put("machos", males)
        put("patrones", rootstocks)
        if (observations.isNotEmpty()) put("observaciones", observations)
        put("timestampDispositivo", deviceTimestamp)
        put("claveIdempotencia", idempotencyKey)
    }
}

data class LocalCountDraft(
    val reservationId: String,
    val userId: String,
    val deviceId: String,
    val input: CountInput,
    val syncState: SyncState,
    val frozenPayload: FrozenCountPayload?,
    val errorCode: String?,
    val errorMessage: String?,
    val countId: String?,
    val centralState: String?,
    val serverReceivedAt: String?,
)

sealed interface CountSyncOutcome {
    data object Success : CountSyncOutcome
    data class Retryable(val code: String) : CountSyncOutcome
    data class PermanentFailure(val code: String) : CountSyncOutcome
}

class CampoRepositoryException(
    val code: String,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)
