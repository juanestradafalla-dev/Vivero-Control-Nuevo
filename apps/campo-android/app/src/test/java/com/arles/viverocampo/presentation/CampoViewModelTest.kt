package com.arles.viverocampo.presentation

import com.arles.viverocampo.data.sync.CountSyncScheduler
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoEnvironment
import com.arles.viverocampo.domain.ActiveJourney
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.CountFormValidator
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.CountSyncOutcome
import com.arles.viverocampo.domain.FrozenCountPayload
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.InitiateCountCorrectionPayload
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.ReturnedCount
import com.arles.viverocampo.domain.SyncState
import com.arles.viverocampo.domain.UserProfile
import com.arles.viverocampo.domain.VisibleLocation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
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
        assertEquals("jornada-prueba", viewModel.uiState.value.selectedJourneyId)
    }

    @Test
    fun `staging permite acceso pero bloquea seleccionar una línea`() = runTest {
        repository.environment = CampoEnvironment.STAGING
        viewModel = CampoViewModel(repository, DEVICE_ID, scheduler)

        login()
        viewModel.selectLine(journeySnapshot.lines.first())

        assertNull(viewModel.uiState.value.selectedLine)
        assertTrue(viewModel.uiState.value.message.orEmpty().contains("solo lectura"))
    }

    @Test
    fun `jornada cerrada desaparece de la seleccion sin borrar historial local`() = runTest {
        repository.closeJourneyAfterSnapshot = true
        login()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.activeJourneys.isEmpty())
        assertNull(viewModel.uiState.value.selectedJourneyId)
        assertNull(viewModel.uiState.value.journey)
        assertTrue(viewModel.uiState.value.message?.contains("historial local se conservó") == true)
    }

    @Test
    fun `si existe trabajo local inesperado conserva la seleccion y el borrador al cerrar`() = runTest {
        repository.latestReservation = confirmedReservation
        repository.closeJourneyAfterSnapshot = true
        login()
        advanceUntilIdle()

        assertEquals(activeJourney.id, viewModel.uiState.value.selectedJourneyId)
        assertEquals(confirmedReservation.reservationId, viewModel.uiState.value.confirmedReservation?.reservationId)
        assertEquals(SyncState.PENDIENTE, viewModel.uiState.value.countDraft?.syncState)
        assertTrue(viewModel.uiState.value.message?.contains("trabajo local se conservó") == true)
    }

    @Test
    fun `varias jornadas exigen selección y cambian la fuente de líneas`() = runTest {
        repository.activeJourneys = listOf(activeJourney, secondActiveJourney)
        login()
        assertNull(viewModel.uiState.value.journey)

        viewModel.selectJourney(secondActiveJourney.id)
        advanceUntilIdle()
        assertEquals(secondActiveJourney.id, viewModel.uiState.value.selectedJourneyId)
        assertEquals("Jornada ficticia 2", viewModel.uiState.value.journey?.displayName)
        assertEquals(listOf(secondActiveJourney.id), repository.observedJourneyIds)
    }

    @Test
    fun `reserva en jornada seleccionada y bloquea cambio con trabajo pendiente`() = runTest {
        repository.activeJourneys = listOf(activeJourney, secondActiveJourney)
        repository.reserveBehavior = { secondJourneyReservation }
        login()
        viewModel.selectJourney(secondActiveJourney.id)
        advanceUntilIdle()
        viewModel.selectLine(secondJourneyLine)
        viewModel.confirmReservation()
        advanceUntilIdle()

        assertEquals(secondJourneyLine.id, repository.reservePayloads.single().jornadaLineaId)
        assertEquals(secondActiveJourney.id, viewModel.uiState.value.confirmedReservation?.journeyId)
        viewModel.selectJourney(activeJourney.id)
        assertEquals(secondActiveJourney.id, viewModel.uiState.value.selectedJourneyId)
        assertTrue(viewModel.uiState.value.message?.contains("trabajo pendiente") == true)
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
    fun `finaliza conserva historial y permite contar dos líneas consecutivas`() = runTest {
        var reservationNumber = 0
        repository.reserveBehavior = {
            reservationNumber += 1
            if (reservationNumber == 1) confirmedReservation else secondConfirmedReservation
        }
        login()

        viewModel.selectLine(availableLine)
        viewModel.confirmReservation()
        advanceUntilIdle()
        enterValidCount()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        repository.forceSent(confirmedReservation.reservationId)
        advanceUntilIdle()
        viewModel.finishAndTakeAnotherLine()

        assertNull(viewModel.uiState.value.confirmedReservation)
        assertEquals(SyncState.ENVIADA, repository.draftFor(confirmedReservation.reservationId, "uid-auxiliar-1", DEVICE_ID)?.syncState)

        viewModel.selectLine(secondAvailableLine)
        viewModel.confirmReservation()
        advanceUntilIdle()
        enterValidCount()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        repository.forceSent(secondConfirmedReservation.reservationId)
        advanceUntilIdle()
        viewModel.finishAndTakeAnotherLine()

        assertEquals(listOf(availableLine.id, secondAvailableLine.id), repository.reservePayloads.map { it.jornadaLineaId })
        assertEquals(SyncState.ENVIADA, repository.draftFor(secondConfirmedReservation.reservationId, "uid-auxiliar-1", DEVICE_ID)?.syncState)
        assertNull(viewModel.uiState.value.confirmedReservation)
    }

    @Test
    fun `no restaura una reserva consumida al iniciar sesión nuevamente`() = runTest {
        loginWithReservation()
        enterValidCount()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        repository.forceSent(confirmedReservation.reservationId)
        advanceUntilIdle()
        viewModel.signOut()
        advanceUntilIdle()
        login()
        assertNull(viewModel.uiState.value.confirmedReservation)
    }

    @Test
    fun `cuenta desactivada invalida sesion y conserva borrador cifrado pendiente`() = runTest {
        loginWithReservation()
        enterValidCount()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        val draftBefore = repository.draftFor(confirmedReservation.reservationId, "uid-auxiliar-1", DEVICE_ID)

        repository.accountActive.value = false
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.user)
        assertEquals("Cuenta desactivada", viewModel.uiState.value.message)
        assertEquals(draftBefore, repository.draftFor(confirmedReservation.reservationId, "uid-auxiliar-1", DEVICE_ID))
        assertTrue(scheduler.cancelled.contains(
            confirmedReservation.reservationId to requireNotNull(draftBefore?.frozenPayload?.idempotencyKey),
        ))
        assertEquals(1, repository.signOutCalls)
    }

    @Test
    fun `payload de reserva mantiene exactamente su contrato compartido`() {
        val payload = ReserveLinePayload("jornada-linea-prueba", "dispositivo-prueba", "clave-prueba-0001")
        assertEquals(setOf("jornadaLineaId", "dispositivoId", "claveIdempotencia"), payload.toWireMap().keys)
    }

    @Test
    fun `inicia corrección restaura borrador offline y conserva referencia de versión`() = runTest {
        login()
        repository.returnedCounts.value = listOf(returnedCount)
        advanceUntilIdle()

        viewModel.correctCount(returnedCount)
        advanceUntilIdle()

        assertEquals("CORRECCION", viewModel.uiState.value.confirmedReservation?.reservationType)
        assertEquals(2, viewModel.uiState.value.confirmedReservation?.nextCountVersion)
        assertEquals(returnedCount.input, viewModel.uiState.value.countInput)
        assertEquals(returnedCount.countId, repository.correctionPayloads.single().conteoId)

        viewModel.signOut()
        advanceUntilIdle()
        login()
        assertEquals(correctionReservation.reservationId, viewModel.uiState.value.confirmedReservation?.reservationId)
        assertEquals(returnedCount.input, viewModel.uiState.value.countDraft?.input)
    }

    @Test
    fun `autor original conserva vista de solo lectura cuando la correccion fue reasignada`() = runTest {
        val readOnly = returnedCount.copy(
            correctionResponsibleUserId = "uid-auxiliar-2",
            correctionResponsibleName = "Auxiliar ficticio 2",
            reassignedByName = "Supervisor ficticio",
            reassignmentReason = "Autor ausente",
            isReassigned = true,
            canCorrect = false,
        )
        login()
        repository.returnedCounts.value = listOf(readOnly)
        advanceUntilIdle()

        viewModel.correctCount(readOnly)
        advanceUntilIdle()

        assertTrue(repository.correctionPayloads.isEmpty())
        assertNull(viewModel.uiState.value.confirmedReservation)
        assertEquals("Supervisor ficticio", viewModel.uiState.value.returnedCounts.single().reassignedByName)
    }

    @Test
    fun `reserva liberada conserva borrador cancela reintentos y nunca marca enviada`() = runTest {
        loginWithReservation()
        enterValidCount()
        viewModel.requestCountConfirmation()
        viewModel.confirmCountSubmission()
        advanceUntilIdle()
        val callsBeforeRelease = scheduler.scheduleCalls

        repository.forceReleased(confirmedReservation.reservationId)
        advanceUntilIdle()

        val draft = requireNotNull(viewModel.uiState.value.countDraft)
        assertEquals("LIBERADA", viewModel.uiState.value.confirmedReservation?.state)
        assertEquals(SyncState.ERROR, draft.syncState)
        assertEquals("RESERVATION_RELEASED", draft.errorCode)
        assertEquals(CountInput("450", "320", "210", "Conteo ficticio"), draft.input)
        assertFalse(draft.syncState == SyncState.ENVIADA)
        assertTrue(scheduler.cancelled.any { it.first == confirmedReservation.reservationId })
        assertTrue(viewModel.uiState.value.message?.contains("liberada por supervisión") == true)

        viewModel.retryCountSubmission()
        advanceUntilIdle()
        assertEquals(callsBeforeRelease, scheduler.scheduleCalls)
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
        var scheduleCalls = 0
        override fun schedule(reservationId: String, idempotencyKey: String) {
            scheduleCalls += 1
            uniqueScheduled += reservationId to idempotencyKey
        }
        override fun cancel(reservationId: String, idempotencyKey: String) {
            cancelled += reservationId to idempotencyKey
        }
    }

    private class FakeCampoRepository : CampoRepository {
        override var environment = CampoEnvironment.EMULATOR
        var activeJourneys: List<ActiveJourney> = listOf(activeJourney)
        private val journeys = mapOf(
            activeJourney.id to MutableStateFlow(journeySnapshot),
            secondActiveJourney.id to MutableStateFlow(secondJourneySnapshot),
        )
        val observedJourneyIds = mutableListOf<String>()
        var closeJourneyAfterSnapshot = false
        private var activeJourneyListCalls = 0
        val returnedCounts = MutableStateFlow<List<ReturnedCount>>(emptyList())
        val accountActive = MutableStateFlow(true)
        var signOutCalls = 0
        private val drafts = mutableMapOf<Triple<String, String, String>, MutableStateFlow<LocalCountDraft?>>()
        private val reservationStates = mutableMapOf<String, MutableStateFlow<String>>()
        val reservePayloads = mutableListOf<ReserveLinePayload>()
        val correctionPayloads = mutableListOf<InitiateCountCorrectionPayload>()
        var reserveBehavior: suspend () -> ConfirmedReservation = { confirmedReservation }
        var latestReservation: ConfirmedReservation? = null
        private val consumedReservations = mutableSetOf<String>()

        override suspend fun signIn(email: String, password: String) = UserProfile("uid-auxiliar-1", "Auxiliar ficticio", "AUXILIAR")
        override suspend fun signOut() {
            signOutCalls += 1
        }
        override fun observeAccountActive(userId: String): Flow<Boolean> = accountActive
        override suspend fun listActiveJourneys(): List<ActiveJourney> {
            activeJourneyListCalls += 1
            return if (closeJourneyAfterSnapshot && activeJourneyListCalls > 1) emptyList() else activeJourneys
        }
        override fun observeJourney(journeyId: String): Flow<JourneySnapshot> {
            observedJourneyIds += journeyId
            val journey = requireNotNull(journeys[journeyId])
            return if (closeJourneyAfterSnapshot) flow {
                emit(journey.value)
                throw CampoRepositoryException("JOURNEY_NOT_ACTIVE", "La jornada fue cerrada por supervisión.")
            } else journey
        }
        override fun observeReturnedCounts(userId: String, journeyId: String): Flow<List<ReturnedCount>> = returnedCounts
        override suspend fun reserveLine(payload: ReserveLinePayload, userId: String): ConfirmedReservation {
            reservePayloads += payload
            return reserveBehavior().also { latestReservation = it }
        }
        override suspend fun initiateCountCorrection(
            payload: InitiateCountCorrectionPayload,
            userId: String,
            initialInput: CountInput,
        ): ConfirmedReservation {
            correctionPayloads += payload
            latestReservation = correctionReservation
            saveCountInput(correctionReservation.reservationId, userId, DEVICE_ID, initialInput)
            return correctionReservation
        }
        override suspend fun latestActiveReservation(userId: String, deviceId: String): ConfirmedReservation? = latestReservation?.takeIf {
            it.userId == userId && it.deviceId == deviceId && it.reservationId !in consumedReservations
        }
        override fun observeCountDraft(reservationId: String, userId: String, deviceId: String): Flow<LocalCountDraft?> =
            drafts.getOrPut(Triple(reservationId, userId, deviceId)) { MutableStateFlow(null) }
        override fun observeReservationState(reservationId: String): Flow<String> =
            reservationStates.getOrPut(reservationId) { MutableStateFlow("ACTIVA") }
        override suspend fun markReservationReleased(reservationId: String) {
            latestReservation = latestReservation?.takeIf { it.reservationId == reservationId }?.copy(state = "LIBERADA")
            drafts.entries.firstOrNull { it.key.first == reservationId }?.value?.let { flow ->
                flow.value = flow.value?.copy(
                    syncState = SyncState.ERROR,
                    errorCode = "RESERVATION_RELEASED",
                    errorMessage = "La reserva fue liberada por supervisión.",
                )
            }
        }
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
        fun forceSent(reservationId: String) {
            val entry = drafts.entries.first { it.key.first == reservationId }.value
            entry.value = entry.value?.copy(
                syncState = SyncState.ENVIADA,
                countId = "conteo-$reservationId",
                centralState = "PENDIENTE_REVISION",
                serverReceivedAt = "2026-07-14T13:00:00.000Z",
            )
            consumedReservations += reservationId
        }
        fun forceReleased(reservationId: String) {
            reservationStates.getOrPut(reservationId) { MutableStateFlow("ACTIVA") }.value = "LIBERADA"
        }
    }

    private companion object {
        const val DEVICE_ID = "DISPOSITIVO-PRUEBA"
        val location = VisibleLocation("VIVERO-PRUEBA", "MODULO-1", "CAMA-1", "LINEA-1", "Línea ficticia 1", 1)
        val availableLine = JourneyLine("jornada-linea-1", "DISPONIBLE", 0, location)
        val secondLocation = location.copy(line = "LINEA-2", displayName = "Línea ficticia 2", order = 2)
        val secondAvailableLine = JourneyLine("jornada-linea-2", "DISPONIBLE", 0, secondLocation)
        val journeySnapshot = JourneySnapshot("jornada-prueba", "Jornada ficticia", listOf(availableLine, secondAvailableLine))
        val activeJourney = ActiveJourney("jornada-prueba", "Jornada ficticia", "ACTIVA", "AUXILIAR", true, 2)
        val secondJourneyLocation = location.copy(module = "MODULO-2", line = "LINEA-B-1", displayName = "Línea B1")
        val secondJourneyLine = JourneyLine("jornada-prueba-2__linea-b-1", "DISPONIBLE", 0, secondJourneyLocation)
        val secondJourneySnapshot = JourneySnapshot("jornada-prueba-2", "Jornada ficticia 2", listOf(secondJourneyLine))
        val secondActiveJourney = ActiveJourney("jornada-prueba-2", "Jornada ficticia 2", "ACTIVA", "AUXILIAR", true, 1)
        val confirmedReservation = ConfirmedReservation(
            "reserva-prueba", "uid-auxiliar-1", DEVICE_ID, "jornada-prueba", availableLine.id, "EN_CONTEO",
            "2026-07-13T12:00:00.000Z", 1, location,
        )
        val secondConfirmedReservation = ConfirmedReservation(
            "reserva-prueba-2", "uid-auxiliar-1", DEVICE_ID, "jornada-prueba", secondAvailableLine.id, "EN_CONTEO",
            "2026-07-13T12:10:00.000Z", 1, secondLocation,
        )
        val secondJourneyReservation = ConfirmedReservation(
            "reserva-jornada-2", "uid-auxiliar-1", DEVICE_ID, secondActiveJourney.id, secondJourneyLine.id, "EN_CONTEO",
            "2026-07-16T12:00:00.000Z", 1, secondJourneyLocation,
        )
        val returnedCount = ReturnedCount(
            countId = "conteo-version-1",
            journeyLineId = availableLine.id,
            version = 1,
            reason = "Recontar la línea completa.",
            input = CountInput("450", "320", "210", "Conteo original"),
            location = location,
        )
        val correctionReservation = ConfirmedReservation(
            "reserva-correccion", "uid-auxiliar-1", DEVICE_ID, "jornada-prueba", availableLine.id, "EN_CONTEO",
            "2026-07-15T13:00:00.000Z", 4, location, "CORRECCION", returnedCount.countId, 2,
        )
    }
}
