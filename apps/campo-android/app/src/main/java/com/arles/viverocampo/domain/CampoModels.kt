package com.arles.viverocampo.domain

const val RELEASED_RESERVATION_MESSAGE =
    "La reserva fue liberada por supervisión. El borrador se conservó; consulta con el supervisor."

data class UserProfile(
    val id: String,
    val name: String,
    val role: String,
)

data class ActiveJourney(
    val id: String,
    val displayName: String,
    val state: String,
    val effectiveRole: String,
    val canCount: Boolean,
    val lineCount: Int,
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
    val originalAuthorName: String = "Usuario",
    val correctionResponsibleUserId: String = "",
    val correctionResponsibleName: String = "Usuario",
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

data class InventoryValues(
    val females: Long,
    val males: Long,
    val rootstocks: Long,
    val total: Long,
)

data class DiscardLine(
    val lineId: String,
    val location: VisibleLocation,
    val inventory: InventoryValues,
    val inventoryVersion: Long,
)

data class DiscardInput(
    val females: String = "",
    val males: String = "",
    val rootstocks: String = "",
    val dead: String = "",
    val nematodes: String = "",
    val gooseNeck: String = "",
    val bifurcatedRoots: String = "",
    val doubleGrafting: String = "",
    val observations: String = "",
)

data class DiscardFieldErrors(
    val females: String? = null,
    val males: String? = null,
    val rootstocks: String? = null,
    val dead: String? = null,
    val nematodes: String? = null,
    val gooseNeck: String? = null,
    val bifurcatedRoots: String? = null,
    val doubleGrafting: String? = null,
    val observations: String? = null,
    val general: String? = null,
)

data class DiscardValidation(
    val errors: DiscardFieldErrors,
    val values: List<Long?>,
    val uniqueTotal: Long?,
    val causesTotal: Long?,
) {
    val valid: Boolean = errors == DiscardFieldErrors()
}

object DiscardFormValidator {
    fun validate(input: DiscardInput): DiscardValidation {
        val parsed = listOf(
            input.females, input.males, input.rootstocks, input.dead, input.nematodes,
            input.gooseNeck, input.bifurcatedRoots, input.doubleGrafting,
        ).map(::parseQuantity)
        val uniqueTotal = safeSum(parsed.take(3).map { it.first })
        val causesTotal = safeSum(parsed.drop(3).map { it.first })
        val uniqueOverflow = parsed.take(3).all { it.first != null } && uniqueTotal == null
        val totalRequired = uniqueTotal == 0L
        val causeRequired = causesTotal == 0L
        val causeOverTotal = uniqueTotal != null && parsed.drop(3).any { (it.first ?: 0L) > uniqueTotal }
        val general = when {
            uniqueOverflow -> "La suma de plantas supera el rango técnico permitido."
            totalRequired -> "Registra al menos una planta descartada."
            causeRequired -> "Registra al menos una causa."
            causeOverTotal -> "Una causa no puede superar el total único de plantas."
            else -> null
        }
        val messages = parsed.map { it.second }
        return DiscardValidation(
            errors = DiscardFieldErrors(
                females = messages[0], males = messages[1], rootstocks = messages[2],
                dead = messages[3], nematodes = messages[4], gooseNeck = messages[5],
                bifurcatedRoots = messages[6], doubleGrafting = messages[7],
                observations = if (input.observations.length > CountFormValidator.OBSERVATIONS_TRANSPORT_LIMIT) {
                    "Las observaciones superan 4.000 caracteres."
                } else {
                    null
                },
                general = general,
            ),
            values = parsed.map { it.first },
            uniqueTotal = uniqueTotal,
            causesTotal = causesTotal,
        )
    }

    private fun parseQuantity(value: String): Pair<Long?, String?> {
        if (value.isBlank()) return null to "Este valor es obligatorio."
        if (!value.all(Char::isDigit)) return null to "Usa enteros mayores o iguales a cero."
        val parsed = value.toLongOrNull() ?: return null to "El valor supera el rango permitido."
        if (parsed > CountFormValidator.MAX_SAFE_INTEGER) return null to "El valor supera el rango seguro."
        return parsed to null
    }

    private fun safeSum(values: List<Long?>): Long? {
        if (values.any { it == null }) return null
        var total = 0L
        for (value in values.filterNotNull()) {
            if (value > CountFormValidator.MAX_SAFE_INTEGER - total) return null
            total += value
        }
        return total
    }
}

data class FrozenDiscardPayload(
    val draftId: String,
    val lineId: String,
    val inventoryVersion: Long,
    val deviceId: String,
    val values: List<Long>,
    val observations: String,
    val deviceTimestamp: String,
    val idempotencyKey: String,
) {
    fun toWireMap(): Map<String, Any> = buildMap {
        put("lineaId", lineId)
        put("versionInventarioObservada", inventoryVersion)
        put("dispositivoId", deviceId)
        put("hembras", this@FrozenDiscardPayload.values[0])
        put("machos", this@FrozenDiscardPayload.values[1])
        put("patrones", this@FrozenDiscardPayload.values[2])
        put("causas", mapOf(
            "muertos" to this@FrozenDiscardPayload.values[3],
            "nematodos" to this@FrozenDiscardPayload.values[4],
            "cuelloGanso" to this@FrozenDiscardPayload.values[5],
            "raicesBifurcadas" to this@FrozenDiscardPayload.values[6],
            "dobleInjertacion" to this@FrozenDiscardPayload.values[7],
        ))
        if (observations.isNotEmpty()) put("observaciones", observations)
        put("timestampDispositivo", deviceTimestamp)
        put("claveIdempotencia", idempotencyKey)
    }
}

data class LocalDiscardDraft(
    val draftId: String,
    val userId: String,
    val deviceId: String,
    val line: DiscardLine,
    val input: DiscardInput,
    val syncState: SyncState,
    val frozenPayload: FrozenDiscardPayload?,
    val errorCode: String?,
    val errorMessage: String?,
    val discardId: String?,
    val centralState: String?,
    val serverReceivedAt: String?,
)

sealed interface DiscardSyncOutcome {
    data object Success : DiscardSyncOutcome
    data class Retryable(val code: String) : DiscardSyncOutcome
    data class PermanentFailure(val code: String) : DiscardSyncOutcome
}

class CampoRepositoryException(
    val code: String,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)
