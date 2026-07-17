package com.arles.viverocampo.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionRestorationPolicyTest {
    @Test
    fun `respuesta autoritativa distingue perfil verificado inexistente e inactivo`() {
        val verified = SessionRestorationPolicy.authoritative(USER_ID, activeRecord())
        val missing = SessionRestorationPolicy.authoritative(USER_ID, activeRecord().copy(exists = false))
        val inactive = SessionRestorationPolicy.authoritative(USER_ID, activeRecord().copy(active = false))

        assertEquals(PROFILE, (verified as SessionRestoreResult.RestoredVerified).profile)
        assertEquals(
            SessionRevocationReason.PROFILE_NOT_FOUND,
            (missing as SessionRestoreResult.Revoked).reason,
        )
        assertEquals(
            SessionRevocationReason.PROFILE_INACTIVE,
            (inactive as SessionRestoreResult.Revoked).reason,
        )
    }

    @Test
    fun `cache activo restaura y cache ausente o no operativo conserva verificacion pendiente`() {
        val restored = SessionRestorationPolicy.cached(USER_ID, activeRecord())
        val missing = SessionRestorationPolicy.cached(USER_ID, null)
        val inactive = SessionRestorationPolicy.cached(USER_ID, activeRecord().copy(active = false))
        val roleMissing = SessionRestorationPolicy.cached(USER_ID, activeRecord().copy(role = null))

        assertEquals(PROFILE, (restored as SessionRestoreResult.RestoredCached).profile)
        assertTrue(missing is SessionRestoreResult.VerificationPending)
        assertTrue(inactive is SessionRestoreResult.VerificationPending)
        assertTrue(roleMissing is SessionRestoreResult.VerificationPending)
    }

    private fun activeRecord() = SessionProfileRecord(
        exists = true,
        active = true,
        displayName = PROFILE.name,
        role = PROFILE.role,
    )

    private companion object {
        const val USER_ID = "usuario-sesion-prueba"
        val PROFILE = UserProfile(USER_ID, "Auxiliar ficticio", "AUXILIAR")
    }
}
