package com.arles.viverocampo.domain

sealed interface SessionRestoreResult {
    data object NoSession : SessionRestoreResult
    data class RestoredVerified(val profile: UserProfile) : SessionRestoreResult
    data class RestoredCached(val profile: UserProfile) : SessionRestoreResult
    data class VerificationPending(val userId: String) : SessionRestoreResult
    data class Revoked(val reason: SessionRevocationReason) : SessionRestoreResult
}

enum class SessionRevocationReason {
    PROFILE_NOT_FOUND,
    PROFILE_INACTIVE,
}

internal data class SessionProfileRecord(
    val exists: Boolean,
    val active: Boolean?,
    val displayName: String?,
    val role: String?,
)

internal object SessionRestorationPolicy {
    fun authoritative(userId: String, record: SessionProfileRecord): SessionRestoreResult = when {
        !record.exists -> SessionRestoreResult.Revoked(SessionRevocationReason.PROFILE_NOT_FOUND)
        record.active != true -> SessionRestoreResult.Revoked(SessionRevocationReason.PROFILE_INACTIVE)
        record.role.isNullOrBlank() -> SessionRestoreResult.VerificationPending(userId)
        else -> SessionRestoreResult.RestoredVerified(record.toProfile(userId))
    }

    fun cached(userId: String, record: SessionProfileRecord?): SessionRestoreResult = when {
        record?.exists != true || record.active != true || record.role.isNullOrBlank() ->
            SessionRestoreResult.VerificationPending(userId)
        else -> SessionRestoreResult.RestoredCached(record.toProfile(userId))
    }

    private fun SessionProfileRecord.toProfile(userId: String) = UserProfile(
        id = userId,
        name = displayName?.takeIf(String::isNotBlank) ?: "Usuario",
        role = requireNotNull(role),
    )
}
