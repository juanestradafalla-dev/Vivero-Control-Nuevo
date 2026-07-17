package com.arles.viverocampo.presentation

import com.arles.viverocampo.data.sync.CountSyncScheduler
import com.arles.viverocampo.data.sync.DiscardSyncScheduler
import com.arles.viverocampo.domain.ActiveJourney
import com.arles.viverocampo.domain.CampoEnvironment
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.CountSyncOutcome
import com.arles.viverocampo.domain.DiscardInput
import com.arles.viverocampo.domain.DiscardLine
import com.arles.viverocampo.domain.DiscardSyncOutcome
import com.arles.viverocampo.domain.FrozenCountPayload
import com.arles.viverocampo.domain.FrozenDiscardPayload
import com.arles.viverocampo.domain.InitiateCountCorrectionPayload
import com.arles.viverocampo.domain.InventoryValues
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.LocalDiscardDraft
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.ReturnedCount
import com.arles.viverocampo.domain.SessionRestoreResult
import com.arles.viverocampo.domain.SessionRevocationReason
import com.arles.viverocampo.domain.SyncState
import com.arles.viverocampo.domain.UserProfile
import com.arles.viverocampo.domain.VisibleLocation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRestorationViewModelTest {
    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    @Test
    fun `currentUser ausente muestra acceso solo al terminar la restauracion`() = runTest {
        val fixture = fixture(SessionRestoreResult.NoSession)

        assertEquals(SessionStatus.RESTORING, fixture.viewModel.uiState.value.sessionStatus)
        fixture.viewModel.updateEmail("persona@prueba.local")
        fixture.viewModel.updatePassword("NoPersistida")
        fixture.viewModel.signIn()
        assertEquals(0, fixture.repository.signInCalls)
        assertTrue(fixture.viewModel.uiState.value.email.isEmpty())
        advanceUntilIdle()

        assertEquals(SessionStatus.NO_SESSION, fixture.viewModel.uiState.value.sessionStatus)
        assertNull(fixture.viewModel.uiState.value.user)
        assertEquals(0, fixture.repository.signOutCalls)
    }

    @Test
    fun `perfil verificado restaura reserva borradores observadores y trabajos una sola vez`() = runTest {
        val fixture = fixture(SessionRestoreResult.RestoredVerified(USER_ONE), withLocalWork = true)
        advanceUntilIdle()

        val state = fixture.viewModel.uiState.value
        assertEquals(SessionStatus.RESTORED_VERIFIED, state.sessionStatus)
        assertEquals(RESERVATION.reservationId, state.confirmedReservation?.reservationId)
        assertEquals(COUNT_DRAFT.input, state.countDraft?.input)
        assertEquals(DISCARD_DRAFT.input, state.discardDraft?.input)
        assertEquals(setOf(RESERVATION.reservationId to COUNT_KEY), fixture.countScheduler.scheduled)
        assertEquals(setOf(DISCARD_DRAFT.draftId to DISCARD_KEY), fixture.discardScheduler.scheduled)
        assertEquals(1, fixture.countScheduler.scheduleCalls)
        assertEquals(1, fixture.discardScheduler.scheduleCalls)
    }

    @Test
    fun `arranque sin red usa perfil activo en cache y conserva trabajo local`() = runTest {
        val fixture = fixture(SessionRestoreResult.RestoredCached(USER_ONE), withLocalWork = true)
        advanceUntilIdle()

        val state = fixture.viewModel.uiState.value
        assertEquals(SessionStatus.RESTORED_CACHED, state.sessionStatus)
        assertEquals(USER_ONE, state.user)
        assertEquals(COUNT_DRAFT, state.countDraft)
        assertEquals(DISCARD_DRAFT, state.discardDraft)
        assertTrue(state.message?.contains("cach\u00e9") == true)
    }

    @Test
    fun `arranque sin red ni cache queda pendiente conserva Auth y bloquea login manual`() = runTest {
        val fixture = fixture(SessionRestoreResult.VerificationPending(USER_ONE.id))
        advanceUntilIdle()

        fixture.viewModel.updateEmail("persona@prueba.local")
        fixture.viewModel.updatePassword("NoPersistida")
        fixture.viewModel.signIn()
        advanceUntilIdle()

        assertEquals(SessionStatus.VERIFICATION_PENDING, fixture.viewModel.uiState.value.sessionStatus)
        assertNull(fixture.viewModel.uiState.value.user)
        assertEquals(0, fixture.repository.signOutCalls)
        assertEquals(0, fixture.repository.signInCalls)
        assertTrue(fixture.viewModel.uiState.value.message?.contains("conecta el dispositivo") == true)
    }

    @Test
    fun `reintento posterior verifica sin reiniciar y es idempotente mientras esta activo`() = runTest {
        val fixture = fixture(SessionRestoreResult.VerificationPending(USER_ONE.id))
        advanceUntilIdle()
        fixture.repository.restoreResult = SessionRestoreResult.RestoredVerified(USER_ONE)

        fixture.viewModel.retrySessionVerification()
        fixture.viewModel.retrySessionVerification()
        advanceUntilIdle()

        assertEquals(2, fixture.repository.restoreCalls)
        assertEquals(SessionStatus.RESTORED_VERIFIED, fixture.viewModel.uiState.value.sessionStatus)
        assertEquals(USER_ONE, fixture.viewModel.uiState.value.user)
    }

    @Test
    fun `perfil inexistente confirmado revoca y cierra Auth`() = runTest {
        val fixture = fixture(SessionRestoreResult.Revoked(SessionRevocationReason.PROFILE_NOT_FOUND))
        advanceUntilIdle()

        assertEquals(SessionStatus.REVOKED, fixture.viewModel.uiState.value.sessionStatus)
        assertNull(fixture.viewModel.uiState.value.user)
        assertEquals(1, fixture.repository.signOutCalls)
    }

    @Test
    fun `perfil inactivo confirmado revoca y cierra Auth`() = runTest {
        val fixture = fixture(SessionRestoreResult.Revoked(SessionRevocationReason.PROFILE_INACTIVE))
        advanceUntilIdle()

        assertEquals(SessionStatus.REVOKED, fixture.viewModel.uiState.value.sessionStatus)
        assertEquals("Cuenta desactivada", fixture.viewModel.uiState.value.message)
        assertEquals(1, fixture.repository.signOutCalls)
    }

    @Test
    fun `inactivacion posterior detiene trabajos y conserva borradores locales`() = runTest {
        val fixture = fixture(SessionRestoreResult.RestoredCached(USER_ONE), withLocalWork = true)
        advanceUntilIdle()

        fixture.repository.accountActive.value = false
        advanceUntilIdle()

        assertEquals(SessionStatus.REVOKED, fixture.viewModel.uiState.value.sessionStatus)
        assertEquals(1, fixture.repository.signOutCalls)
        assertEquals(setOf(RESERVATION.reservationId to COUNT_KEY), fixture.countScheduler.cancelled)
        assertEquals(setOf(DISCARD_DRAFT.draftId to DISCARD_KEY), fixture.discardScheduler.cancelled)
        assertEquals(COUNT_DRAFT, fixture.repository.countDrafts.getValue(RESERVATION.reservationId).value)
        assertEquals(DISCARD_DRAFT, fixture.repository.discardDrafts.getValue(USER_ONE.id).value)
    }

    @Test
    fun `reintentos de verificacion no duplican observadores ni sincronizaciones`() = runTest {
        val fixture = fixture(SessionRestoreResult.RestoredCached(USER_ONE), withLocalWork = true)
        advanceUntilIdle()

        repeat(3) {
            fixture.viewModel.retrySessionVerification()
            advanceUntilIdle()
        }

        assertEquals(1, fixture.countScheduler.scheduleCalls)
        assertEquals(1, fixture.discardScheduler.scheduleCalls)
        assertEquals(1, fixture.repository.maxActiveJourneyObservers)
        assertEquals(1, fixture.repository.maxActiveCountObservers)
        assertEquals(1, fixture.repository.maxActiveDiscardObservers)
    }

    @Test
    fun `trabajo local queda aislado entre dos cuentas del mismo dispositivo`() = runTest {
        val repository = SessionRepository().apply {
            reservations += RESERVATION
            reservations += RESERVATION.copy(reservationId = "reserva-dos", userId = USER_TWO.id)
            countDrafts[RESERVATION.reservationId] = MutableStateFlow(COUNT_DRAFT)
            countDrafts["reserva-dos"] = MutableStateFlow(
                COUNT_DRAFT.copy(reservationId = "reserva-dos", userId = USER_TWO.id),
            )
            discardDrafts[USER_ONE.id] = MutableStateFlow(DISCARD_DRAFT)
            discardDrafts[USER_TWO.id] = MutableStateFlow(
                DISCARD_DRAFT.copy(draftId = "descarte-dos", userId = USER_TWO.id),
            )
            restoreResult = SessionRestoreResult.RestoredVerified(USER_ONE)
        }
        val first = CampoViewModel(repository, DEVICE_ID, RecordingCountScheduler(), RecordingDiscardScheduler())
        advanceUntilIdle()
        assertEquals(USER_ONE.id, first.uiState.value.countDraft?.userId)
        assertEquals(USER_ONE.id, first.uiState.value.discardDraft?.userId)

        repository.restoreResult = SessionRestoreResult.RestoredVerified(USER_TWO)
        val second = CampoViewModel(repository, DEVICE_ID, RecordingCountScheduler(), RecordingDiscardScheduler())
        advanceUntilIdle()
        assertEquals(USER_TWO.id, second.uiState.value.countDraft?.userId)
        assertEquals(USER_TWO.id, second.uiState.value.discardDraft?.userId)
    }

    @Test
    fun `salir oculta sesion y conserva borradores locales`() = runTest {
        val fixture = fixture(SessionRestoreResult.RestoredVerified(USER_ONE), withLocalWork = true)
        advanceUntilIdle()

        fixture.viewModel.signOut()
        advanceUntilIdle()

        assertEquals(SessionStatus.NO_SESSION, fixture.viewModel.uiState.value.sessionStatus)
        assertNull(fixture.viewModel.uiState.value.user)
        assertEquals(COUNT_DRAFT, fixture.repository.countDrafts.getValue(RESERVATION.reservationId).value)
        assertEquals(DISCARD_DRAFT, fixture.repository.discardDrafts.getValue(USER_ONE.id).value)
    }

    @Test
    fun `emulator y production conservan capacidades y entorno no autorizado queda bloqueado`() = runTest {
        val emulator = fixture(SessionRestoreResult.NoSession, environment = CampoEnvironment.EMULATOR)
        val production = fixture(SessionRestoreResult.NoSession, environment = CampoEnvironment.PRODUCTION)
        val disabled = fixture(SessionRestoreResult.NoSession, environment = CampoEnvironment.DISABLED)
        advanceUntilIdle()

        assertTrue(emulator.viewModel.uiState.value.mutableOperationsEnabled)
        assertTrue(production.viewModel.uiState.value.mutableOperationsEnabled)
        assertFalse(disabled.viewModel.uiState.value.accessEnabled)
        assertFalse(disabled.viewModel.uiState.value.mutableOperationsEnabled)
    }

    private fun fixture(
        result: SessionRestoreResult,
        withLocalWork: Boolean = false,
        environment: CampoEnvironment = CampoEnvironment.EMULATOR,
    ): Fixture {
        val repository = SessionRepository(environment).apply {
            restoreResult = result
            if (withLocalWork) {
                reservations += RESERVATION
                countDrafts[RESERVATION.reservationId] = MutableStateFlow(COUNT_DRAFT)
                discardDrafts[USER_ONE.id] = MutableStateFlow(DISCARD_DRAFT)
            }
        }
        val countScheduler = RecordingCountScheduler()
        val discardScheduler = RecordingDiscardScheduler()
        return Fixture(
            repository,
            countScheduler,
            discardScheduler,
            CampoViewModel(repository, DEVICE_ID, countScheduler, discardScheduler),
        )
    }

    private data class Fixture(
        val repository: SessionRepository,
        val countScheduler: RecordingCountScheduler,
        val discardScheduler: RecordingDiscardScheduler,
        val viewModel: CampoViewModel,
    )

    private class RecordingCountScheduler : CountSyncScheduler {
        val scheduled = linkedSetOf<Pair<String, String>>()
        val cancelled = linkedSetOf<Pair<String, String>>()
        var scheduleCalls = 0
        override fun schedule(reservationId: String, idempotencyKey: String) {
            scheduleCalls++
            scheduled += reservationId to idempotencyKey
        }
        override fun cancel(reservationId: String, idempotencyKey: String) {
            cancelled += reservationId to idempotencyKey
        }
    }

    private class RecordingDiscardScheduler : DiscardSyncScheduler {
        val scheduled = linkedSetOf<Pair<String, String>>()
        val cancelled = linkedSetOf<Pair<String, String>>()
        var scheduleCalls = 0
        override fun schedule(draftId: String, idempotencyKey: String) {
            scheduleCalls++
            scheduled += draftId to idempotencyKey
        }
        override fun cancel(draftId: String, idempotencyKey: String) {
            cancelled += draftId to idempotencyKey
        }
    }

    private class SessionRepository(
        override val environment: CampoEnvironment = CampoEnvironment.EMULATOR,
    ) : CampoRepository {
        var restoreResult: SessionRestoreResult = SessionRestoreResult.NoSession
        var restoreCalls = 0
        var signInCalls = 0
        var signOutCalls = 0
        val reservations = mutableListOf<ConfirmedReservation>()
        val countDrafts = mutableMapOf<String, MutableStateFlow<LocalCountDraft?>>()
        val discardDrafts = mutableMapOf<String, MutableStateFlow<LocalDiscardDraft?>>()
        val accountActive = MutableStateFlow(true)
        private val journey = MutableStateFlow(JOURNEY)
        var activeJourneyObservers = 0
        var activeCountObservers = 0
        var activeDiscardObservers = 0
        var maxActiveJourneyObservers = 0
        var maxActiveCountObservers = 0
        var maxActiveDiscardObservers = 0

        override suspend fun restoreSession(): SessionRestoreResult {
            restoreCalls++
            if (restoreResult is SessionRestoreResult.Revoked) signOutCalls++
            return restoreResult
        }

        override suspend fun signIn(email: String, password: String): UserProfile {
            signInCalls++
            return USER_ONE
        }

        override suspend fun signOut() {
            signOutCalls++
        }

        override fun observeAccountActive(userId: String): Flow<Boolean> = accountActive
        override suspend fun listActiveJourneys(): List<ActiveJourney> = listOf(ACTIVE_JOURNEY)

        override fun observeJourney(journeyId: String): Flow<JourneySnapshot> = trackedFlow(
            source = journey,
            onStart = {
                activeJourneyObservers++
                maxActiveJourneyObservers = maxOf(maxActiveJourneyObservers, activeJourneyObservers)
            },
            onStop = { activeJourneyObservers-- },
        )

        override fun observeReturnedCounts(userId: String, journeyId: String): Flow<List<ReturnedCount>> =
            MutableStateFlow(emptyList())

        override suspend fun latestActiveReservation(userId: String, deviceId: String): ConfirmedReservation? =
            reservations.firstOrNull { it.userId == userId && it.deviceId == deviceId }

        override fun observeCountDraft(
            reservationId: String,
            userId: String,
            deviceId: String,
        ): Flow<LocalCountDraft?> {
            val source = countDrafts[reservationId]?.takeIf {
                it.value?.userId == userId && it.value?.deviceId == deviceId
            } ?: MutableStateFlow(null)
            return trackedFlow(
                source,
                onStart = {
                    activeCountObservers++
                    maxActiveCountObservers = maxOf(maxActiveCountObservers, activeCountObservers)
                },
                onStop = { activeCountObservers-- },
            )
        }

        override fun observeReservationState(reservationId: String): Flow<String> = MutableStateFlow("ACTIVA")
        override suspend fun listDiscardLines(): List<DiscardLine> = discardDrafts.values.mapNotNull { it.value?.line }
        override suspend fun latestPendingDiscard(userId: String, deviceId: String): LocalDiscardDraft? =
            discardDrafts[userId]?.value?.takeIf { it.deviceId == deviceId }

        override fun observeDiscardDraft(
            draftId: String,
            userId: String,
            deviceId: String,
        ): Flow<LocalDiscardDraft?> {
            val source = discardDrafts[userId]?.takeIf {
                it.value?.draftId == draftId && it.value?.deviceId == deviceId
            } ?: MutableStateFlow(null)
            return trackedFlow(
                source,
                onStart = {
                    activeDiscardObservers++
                    maxActiveDiscardObservers = maxOf(maxActiveDiscardObservers, activeDiscardObservers)
                },
                onStop = { activeDiscardObservers-- },
            )
        }

        override suspend fun reserveLine(payload: ReserveLinePayload, userId: String): ConfirmedReservation = RESERVATION
        override suspend fun initiateCountCorrection(
            payload: InitiateCountCorrectionPayload,
            userId: String,
            initialInput: CountInput,
        ): ConfirmedReservation = RESERVATION
        override suspend fun markReservationReleased(reservationId: String) = Unit
        override suspend fun saveCountInput(
            reservationId: String,
            userId: String,
            deviceId: String,
            input: CountInput,
        ) = Unit
        override suspend fun freezeCountAttempt(
            reservationId: String,
            userId: String,
            deviceId: String,
            idempotencyKey: String,
            deviceTimestamp: String,
        ): LocalCountDraft = requireNotNull(countDrafts[reservationId]?.value)
        override suspend fun synchronizeCount(reservationId: String): CountSyncOutcome = CountSyncOutcome.Success
        override suspend fun synchronizeDiscard(draftId: String): DiscardSyncOutcome = DiscardSyncOutcome.Success

        private fun <T> trackedFlow(
            source: MutableStateFlow<T>,
            onStart: () -> Unit,
            onStop: () -> Unit,
        ): Flow<T> = kotlinx.coroutines.flow.flow {
            onStart()
            try {
                source.collect { emit(it) }
            } finally {
                onStop()
            }
        }
    }

    private companion object {
        const val DEVICE_ID = "DISPOSITIVO-SESION"
        const val COUNT_KEY = "clave-conteo-restaurado"
        const val DISCARD_KEY = "clave-descarte-restaurado"
        val USER_ONE = UserProfile("usuario-uno", "Auxiliar uno", "AUXILIAR")
        val USER_TWO = UserProfile("usuario-dos", "Auxiliar dos", "AUXILIAR")
        val LOCATION = VisibleLocation("VIVERO-PRUEBA", "MODULO-1", "CAMA-1", "LINEA-1", "L\u00ednea 1", 1)
        val LINE = JourneyLine("jornada-linea-1", "EN_CONTEO", 2, LOCATION)
        val JOURNEY = JourneySnapshot("jornada-prueba", "Jornada ficticia", listOf(LINE))
        val ACTIVE_JOURNEY = ActiveJourney(JOURNEY.id, JOURNEY.displayName, "ACTIVA", "AUXILIAR", true, 1)
        val RESERVATION = ConfirmedReservation(
            "reserva-restaurada", USER_ONE.id, DEVICE_ID, JOURNEY.id, LINE.id, "EN_CONTEO",
            "2026-07-17T12:00:00.000Z", 2, LOCATION,
        )
        val COUNT_DRAFT = LocalCountDraft(
            RESERVATION.reservationId,
            USER_ONE.id,
            DEVICE_ID,
            CountInput("10", "5", "2", "Borrador local"),
            SyncState.PENDIENTE,
            FrozenCountPayload(RESERVATION.reservationId, DEVICE_ID, 10, 5, 2, "Borrador local", "2026-07-17", COUNT_KEY),
            null,
            null,
            null,
            null,
            null,
        )
        val DISCARD_LINE = DiscardLine("linea-catalogo-1", LOCATION, InventoryValues(20, 10, 5, 35), 1)
        val DISCARD_DRAFT = LocalDiscardDraft(
            "descarte-restaurado",
            USER_ONE.id,
            DEVICE_ID,
            DISCARD_LINE,
            DiscardInput("1", "0", "0", "1", "0", "0", "0", "0", "Borrador descarte"),
            SyncState.PENDIENTE,
            FrozenDiscardPayload(
                "descarte-restaurado",
                DISCARD_LINE.lineId,
                1,
                DEVICE_ID,
                listOf(1, 0, 0, 1, 0, 0, 0, 0),
                "Borrador descarte",
                "2026-07-17",
                DISCARD_KEY,
            ),
            null,
            null,
            null,
            null,
            null,
        )
    }
}
