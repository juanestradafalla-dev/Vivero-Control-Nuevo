package com.arles.viverocampo.presentation

import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.UserProfile
import com.arles.viverocampo.domain.VisibleLocation
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.TestScope
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
    private lateinit var viewModel: CampoViewModel

    @Before
    fun setUp() {
        repository = FakeCampoRepository()
        viewModel = CampoViewModel(repository, "DISPOSITIVO-PRUEBA", keyFactory = { "clave-estable-prueba" })
    }

    @Test
    fun `estado inicial muestra login de emulador sin éxito inventado`() {
        assertTrue(viewModel.uiState.value.emulatorEnabled)
        assertNull(viewModel.uiState.value.user)
        assertNull(viewModel.uiState.value.confirmedReservation)
        assertFalse(viewModel.uiState.value.reserving)
    }

    @Test
    fun `inicio de sesión carga usuario jornada y líneas disponibles`() = runTest {
        login()

        assertEquals("Auxiliar ficticio", viewModel.uiState.value.user?.name)
        assertEquals("Jornada ficticia", viewModel.uiState.value.journey?.displayName)
        assertEquals(listOf("DISPONIBLE", "EN_CONTEO"), viewModel.uiState.value.journey?.lines?.map { it.state })
        assertEquals("CONECTADO", viewModel.uiState.value.connectionStatus)
    }

    @Test
    fun `reserva mantiene procesamiento hasta confirmación central y luego muestra éxito`() = runTest {
        val serverResponse = CompletableDeferred<ConfirmedReservation>()
        repository.reserveBehavior = { serverResponse.await() }
        login()
        viewModel.selectLine(availableLine)
        viewModel.confirmReservation()
        runCurrent()

        assertTrue(viewModel.uiState.value.reserving)
        assertNull(viewModel.uiState.value.confirmedReservation)

        serverResponse.complete(confirmedReservation)
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.reserving)
        assertEquals("reserva-prueba", viewModel.uiState.value.confirmedReservation?.reservationId)
        assertEquals("Reserva confirmada por el servidor.", viewModel.uiState.value.message)
    }

    @Test
    fun `conflicto informa que otro usuario tomó la línea`() = runTest {
        repository.reserveBehavior = {
            throw CampoRepositoryException("LINE_NOT_AVAILABLE", "No disponible")
        }
        login()
        viewModel.selectLine(availableLine)
        viewModel.confirmReservation()
        advanceUntilIdle()

        assertEquals("Esta línea acaba de ser tomada por otro usuario", viewModel.uiState.value.message)
        assertNull(viewModel.uiState.value.selectedLine)
        assertNull(viewModel.uiState.value.confirmedReservation)
    }

    @Test
    fun `error de red conserva la misma clave para el reintento`() = runTest {
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

        assertEquals(2, repository.payloads.size)
        assertEquals(
            repository.payloads[0].claveIdempotencia,
            repository.payloads[1].claveIdempotencia,
        )
        assertEquals("reserva-prueba", viewModel.uiState.value.confirmedReservation?.reservationId)
    }

    @Test
    fun `payload Campo contiene exactamente los tres campos compartidos`() {
        val payload = ReserveLinePayload("jornada-linea-prueba", "dispositivo-prueba", "clave-prueba-0001")
        assertEquals(
            setOf("jornadaLineaId", "dispositivoId", "claveIdempotencia"),
            payload.toWireMap().keys,
        )
    }

    private suspend fun TestScope.login() {
        viewModel.updateEmail("auxiliar1@prueba.local")
        viewModel.updatePassword("SoloEmulador-Etapa3!")
        viewModel.signIn()
        advanceUntilIdle()
    }

    private class FakeCampoRepository : CampoRepository {
        override val emulatorEnabled: Boolean = true
        private val journey = MutableStateFlow(journeySnapshot)
        val payloads = mutableListOf<ReserveLinePayload>()
        var reserveBehavior: suspend () -> ConfirmedReservation = { confirmedReservation }

        override suspend fun signIn(email: String, password: String) =
            UserProfile("uid-auxiliar-1", "Auxiliar ficticio", "AUXILIAR")

        override suspend fun signOut() = Unit

        override fun observeActiveJourney(): Flow<JourneySnapshot> = journey

        override suspend fun reserveLine(
            payload: ReserveLinePayload,
            userId: String,
        ): ConfirmedReservation {
            payloads += payload
            return reserveBehavior()
        }

        override suspend fun latestConfirmedReservation(userId: String): ConfirmedReservation? = null
    }

    private companion object {
        val location = VisibleLocation(
            nursery = "VIVERO-PRUEBA",
            module = "MODULO-PRUEBA-1",
            bed = "CAMA-PRUEBA-1",
            line = "LINEA-PRUEBA-1",
            displayName = "Línea ficticia 1",
            order = 1,
        )
        val availableLine = JourneyLine("jornada-linea-1", "DISPONIBLE", 0, location)
        val journeySnapshot = JourneySnapshot(
            "jornada-prueba",
            "Jornada ficticia",
            listOf(availableLine, JourneyLine("jornada-linea-2", "EN_CONTEO", 1, location.copy(line = "LINEA-PRUEBA-2", order = 2))),
        )
        val confirmedReservation = ConfirmedReservation(
            reservationId = "reserva-prueba",
            userId = "uid-auxiliar-1",
            journeyLineId = availableLine.id,
            state = "EN_CONTEO",
            confirmedAt = "2026-07-13T12:00:00.000Z",
            version = 1,
            location = location,
        )
    }
}
