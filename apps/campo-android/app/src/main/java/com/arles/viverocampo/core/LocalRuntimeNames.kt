package com.arles.viverocampo.core

object LocalRuntimeNames {
    private val validNamespace = Regex("[a-z0-9_-]+")

    fun validateNamespace(namespace: String): String = namespace.also {
        require(it.matches(validNamespace)) { "El namespace local no es seguro." }
    }

    fun preferences(namespace: String) = "technical_${validateNamespace(namespace)}"

    fun database(namespace: String) = "vivero-campo-${validateNamespace(namespace)}.db"

    fun firebaseApp(namespace: String) = "vivero-control-${validateNamespace(namespace)}"

    fun workTag(namespace: String) = "vivero_count_send-${validateNamespace(namespace)}"

    fun workName(namespace: String, reservationId: String, idempotencyKey: String) =
        "${validateNamespace(namespace)}-count-send-$reservationId-$idempotencyKey"

    fun keystoreAlias(namespace: String) =
        "vivero_campo_${validateNamespace(namespace)}_reservation_token_v1"
}
