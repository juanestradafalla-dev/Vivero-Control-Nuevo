package com.arles.viverocampo.presentation

import com.arles.viverocampo.data.sync.CountSyncScheduler
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.CountFormValidator
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.CountSyncOutcome
import com.arles.viverocampo.domain.FrozenCountPayload
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.ReserveLinePayload
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
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CampoViewModelTest {
    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private lateinit var repository: FakeCampoRepository
    private lateinit var scheduler: FakeScheduler
    private lateinit var viewModel: CampoViewModel
    private var generatedKeys = 0

    @Before
    fun setUp() {
        repository = FakeCampoRepository()
        scheduler = FakeScheduler()
        generatedKeys = 0
        viewModel = CampoViewModel(
            repository,
            DEVICE_ID,
            scheduler,
            keyFactory = { "clave-estable-${++generatedKeys}" },
            timestampFactory = { "2026-07-13T20:00:00.000Z" },
        )
    }

    @Test
    fun `inicio de sesión carga usuario jornada y líneas disponibles`() = runTest {
        login()
        assertEquals("Auxiliar ficticio", viewModel.uiState.value.user?.name)
        assertEquals("Jornada ficticia", viewModel.uiState.value.journey?.displayName)
        assertEquals("CONECTADO", viewModel.uiState.value.connectionStatus)
    }

    @Test
    fun `reserva reusa clave al perder la respuesta y abre formulario al confirmarse`() = runTest {
        var attempts = 0
        repository.reserveBehavior = {
            attempts += 1
            if (attempts == 1) throw CampoRepositoryException("NETWORK_ERROR", "Sin respuesta central")
            confirmedReservation
        }
        login()
        viewModel.selectLine(availableLine)
        viewModel.confirmReservation()
        advanceUntilIdle()
        viewModel.confirmReservation()
        advanceUntilIdle()
        assertEquals(repository.reservePayloads[0].claveIdempotencia, repository.reservePayloads[1].claveIdempotencia)
        assertEquals("reserva-prueba", viewModel.uiState.value.confirmedReservation?.reservationId)
        assertEquals(SyncState.PENDIENTE, viewModel.uiState.value.countDraft?.syncState)
    }

    @Test
    fun `valida campos calcula total y muestra advertencia no bloqueante para cero`() = runTest {
        loginWithReservation()
        viewModel.updateFemales("10")
        viewModel.updateMales("2.5")
        viewModel.updateRootstocks("")
        viewModel.requestCountConfirmation()
        assertFalse(viewModel.uiState.value.showCountSummary)
        assertTrue(viewModel.uiState.value.countErrors.males != null)
        assertTrue(viewModel.uiState.value.countErrors.rootstocks != null)

        viewModel.updateFemales("0")
        viewModel.updateMales("0")
        viewModel.updateRootstocks("0")
        advanceUntilIdle()
        viewModel.requestCountConfirmation()
        assertTrue(viewModel.uiState.value.showCountSummary)
        assertEquals(0L, viewModel.uiState.value.countTotal)
        assertTrue(viewModel.uiState.value.zeroWarning)
    }

    @Test
    fun `confirmación congela payload genera una clave y agenda un trabajo único`() = runTest {
        loginWithReservation()
        enterValidCount()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        val draft = requireNotNull(viewModel.uiState.value.countDraft)
        assertEquals(450L, draft.frozenPayload?.females)
        assertEquals(980L, draft.frozenPayload?.let { it.females + it.males + it.rootstocks })
        assertEquals(1, scheduler.uniqueScheduled.size)
        assertEquals(SyncState.PENDIENTE, draft.syncState)
        assertFalse(draft.syncState == SyncState.ENVIADA)
    }

    @Test
    fun `borrador se restaura y queda aislado de otra cuenta en el mismo dispositivo`() = runTest {
        loginWithReservation()
        enterValidCount()
        advanceUntilIdle()
        val restored = repository.observeCountDraft("reserva-prueba", "uid-auxiliar-1", DEVICE_ID)
            as MutableStateFlow<LocalCountDraft?>
        assertEquals("450", restored.value?.input?.females)
        assertNull(repository.draftFor("reserva-prueba", "uid-auxiliar-2", DEVICE_ID))
    }

    @Test
    fun `editar tras error descarta intento congelado y exige nueva clave`() = runTest {
        loginWithReservation()
        enterValidCount()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        repository.forceError("reserva-prueba", "INVALID_ARGUMENT")
        advanceUntilIdle()
        val oldKey = viewModel.uiState.value.countDraft?.frozenPayload?.idempotencyKey
        viewModel.updateFemales("451")
        advanceUntilIdle()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        val newKey = viewModel.uiState.value.countDraft?.frozenPayload?.idempotencyKey
        assertTrue(oldKey != newKey)
        assertTrue(scheduler.cancelled.any { it.second == oldKey })
    }

    @Test
    fun `payload de reserva mantiene exactamente su contrato compartido`() {
        val payload = ReserveLinePayload("jornada-linea-prueba", "dispositivo-prueba", "clave-prueba-0001")
        assertEquals(setOf("jornadaLineaId", "dispositivoId", "claveIdempotencia"), payload.toWireMap().keys)
    }

    private suspend fun kotlinx.coroutines.test.TestScope.login() {
        viewModel.updateEmail("auxiliar1@prueba.local")
        viewModel.updatePassword("SoloEmulador-Etapa3!")
        viewModel.signIn()
        advanceUntilIdle()
    }

    private suspend fun kotlinx.coroutines.test.TestScope.loginWithReservation() {
        repository.latestReservation = confirmedReservation
        login()
        advanceUntilIdle()
    }

    private suspend fun kotlinx.coroutines.test.TestScope.enterValidCount() {
        viewModel.updateFemales("450")
        viewModel.updateMales("320")
        viewModel.updateRootstocks("210")
        viewModel.updateObservations("Conteo ficticio")
        advanceUntilIdle()
        assertEquals(980L, CountFormValidator.validate(viewModel.uiState.value.countInput).total)
    }

    private class FakeScheduler : CountSyncScheduler {
        val uniqueScheduled = linkedSetOf<Pair<String, String>>()
        val cancelled = mutableListOf<Pair<String, String>>()
        override fun schedule(reservationId: String, idempotencyKey: String) {
            uniqueScheduled += reservationId to idempotencyKey
        }
        override fun cancel(reservationId: String, idempotencyKey: String) {
            cancelled += reservationId to idempotencyKey
        }
    }

    private class FakeCampoRepository : CampoRepository {
        override val emulatorEnabled = true
        private val journey = MutableStateFlow(journeySnapshot)
        private val drafts = mutableMapOf<Triple<String, String, String>, MutableStateFlow<LocalCountDraft?>>()
        val reservePayloads = mutableListOf<ReserveLinePayload>()
        var reserveBehavior: suspend () -> ConfirmedReservation = { confirmedReservation }
        var latestReservation: ConfirmedReservation? = null

        override suspend fun signIn(email: String, password: String) = UserProfile("uid-auxiliar-1", "Auxiliar ficticio", "AUXILIAR")
        override suspend fun signOut() = Unit
        override fun observeActiveJourney(): Flow<JourneySnapshot> = journey
        override suspend fun reserveLine(payload: ReserveLinePayload, userId: String): ConfirmedReservation {
            reservePayloads += payload
            return reserveBehavior().also { latestReservation = it }
        }
        override suspend fun latestConfirmedReservation(userId: String): ConfirmedReservation? = latestReservation?.takeIf { it.userId == userId }
        override fun observeCountDraft(reservationId: String, userId: String, deviceId: String): Flow<LocalCountDraft?> =
            drafts.getOrPut(Triple(reservationId, userId, deviceId)) { MutableStateFlow(null) }
        override suspend fun saveCountInput(reservationId: String, userId: String, deviceId: String, input: CountInput) {
            val flow = drafts.getOrPut(Triple(reservationId, userId, deviceId)) { MutableStateFlow(null) }
            val old = flow.value
            val changedAfterError = old?.syncState == SyncState.ERROR && old.input != input
            flow.value = (old ?: LocalCountDraft(
                reservationId, userId, deviceId, input, SyncState.PENDIENTE, null, null, null, null, null, null,
            )).copy(
                input = input,
                syncState = if (changedAfterError) SyncState.PENDIENTE else old?.syncState ?: SyncState.PENDIENTE,
                frozenPayload = if (changedAfterError) null else old?.frozenPayload,
                errorCode = if (changedAfterError) null else old?.errorCode,
                errorMessage = if (changedAfterError) null else old?.errorMessage,
            )
        }
        override suspend fun freezeCountAttempt(
            reservationId: String,
            userId: String,
            deviceId: String,
            idempotencyKey: String,
            deviceTimestamp: String,
        ): LocalCountDraft {
            val flow = drafts.getValue(Triple(reservationId, userId, deviceId))
            val current = requireNotNull(flow.value)
            current.frozenPayload?.let { return current }
            val validation = CountFormValidator.validate(current.input)
            val frozen = current.copy(
                frozenPayload = FrozenCountPayload(
                    reservationId,
                    deviceId,
                    requireNotNull(validation.females),
                    requireNotNull(validation.males),
                    requireNotNull(validation.rootstocks),
                    current.input.observations,
                    deviceTimestamp,
                    idempotencyKey,
                ),
            )
            flow.value = frozen
            return frozen
        }
        override suspend fun synchronizeCount(reservationId: String): CountSyncOutcome = CountSyncOutcome.Success
        fun draftFor(reservationId: String, userId: String, deviceId: String) = drafts[Triple(reservationId, userId, deviceId)]?.value
        fun forceError(reservationId: String, code: String) {
            val entry = drafts.entries.first { it.key.first == reservationId }.value
            entry.value = entry.value?.copy(syncState = SyncState.ERROR, errorCode = code, errorMessage = "Corrige el contenido")
        }
    }

    private companion object {
        const val DEVICE_ID = "DISPOSITIVO-PRUEBA"
        val location = VisibleLocation("VIVERO-PRUEBA", "MODULO-1", "CAMA-1", "LINEA-1", "Línea ficticia 1", 1)
        val availableLine = JourneyLine("jornada-linea-1", "DISPONIBLE", 0, location)
        val journeySnapshot = JourneySnapshot("jornada-prueba", "Jornada ficticia", listOf(availableLine))
        val confirmedReservation = ConfirmedReservation(
            "reserva-prueba", "uid-auxiliar-1", DEVICE_ID, "jornada-prueba", availableLine.id, "EN_CONTEO",
            "2026-07-13T12:00:00.000Z", 1, location,
        )
    }
}
