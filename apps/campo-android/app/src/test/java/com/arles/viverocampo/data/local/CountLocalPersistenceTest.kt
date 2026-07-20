package com.arles.viverocampo.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.arles.viverocampo.domain.SyncState
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CountLocalPersistenceTest {
    private lateinit var database: ViveroCampoDatabase

    @Before
    fun createDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, ViveroCampoDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun closeDatabase() {
        database.close()
    }

    @Test
    fun `Room restaura borrador solo para la misma cuenta dispositivo y reserva`() = runTest {
        database.countDraftDao().save(draft())
        val restored = database.countDraftDao().observe("reserva-1", "usuario-1", "dispositivo-1").first()
        val otherUser = database.countDraftDao().observe("reserva-1", "usuario-2", "dispositivo-1").first()
        assertEquals("450", restored?.femalesInput)
        assertEquals("12", restored?.deadPlantsInput)
        assertEquals(12L, restored?.frozenDeadPlants)
        assertEquals("Conteo local", restored?.observationsInput)
        assertNull(otherUser)
    }

    @Test
    fun `Room conserva snapshot central del informe junto a la reserva`() = runTest {
        database.confirmedReservationDao().save(reservation())

        val restored = database.confirmedReservationDao().byId("reserva-1")

        assertEquals(true, restored?.inventoryReportEnabled)
        assertEquals(7, restored?.inventoryReportMonth)
        assertEquals(2026, restored?.inventoryReportYear)
        assertEquals("CONTEO_FISICO", restored?.inventoryReportDeadPlantsSource)
    }

    @Test
    fun `éxito central marca ENVIADA y elimina ciphertext e IV del token`() = runTest {
        database.confirmedReservationDao().save(reservation())
        database.countDraftDao().save(draft())
        assertEquals(
            "reserva-1",
            database.confirmedReservationDao().latestActiveForUserAndDevice("usuario-1", "dispositivo-1")?.reservationId,
        )
        CountLocalPersistence(database).markSentAndRemoveToken(
            "reserva-1",
            "conteo-1",
            "PENDIENTE_REVISION",
            "2026-07-13T20:01:00.000Z",
        )
        val reservation = database.confirmedReservationDao().byId("reserva-1")
        val sent = database.countDraftDao().byReservationId("reserva-1")
        assertNull(reservation?.tokenCiphertext)
        assertNull(reservation?.tokenIv)
        assertEquals(SyncState.ENVIADA.name, sent?.syncState)
        assertEquals("conteo-1", sent?.countId)
        assertNull(database.confirmedReservationDao().latestActiveForUserAndDevice("usuario-1", "dispositivo-1"))
    }

    @Test
    fun `liberacion conserva borrador y token cifrado y detiene el estado pendiente`() = runTest {
        database.confirmedReservationDao().save(reservation())
        database.countDraftDao().save(draft())

        CountLocalPersistence(database).markReleasedAndKeepDraft("reserva-1")

        val releasedReservation = database.confirmedReservationDao().byId("reserva-1")
        val preservedDraft = database.countDraftDao().byReservationId("reserva-1")
        assertEquals("LIBERADA", releasedReservation?.state)
        assertEquals("ciphertext-que-no-es-token", releasedReservation?.tokenCiphertext)
        assertEquals("iv-aleatorio", releasedReservation?.tokenIv)
        assertEquals(SyncState.ERROR.name, preservedDraft?.syncState)
        assertEquals("RESERVATION_RELEASED", preservedDraft?.errorCode)
        assertEquals("450", preservedDraft?.femalesInput)
        assertEquals("320", preservedDraft?.malesInput)
        assertEquals("210", preservedDraft?.rootstocksInput)
        assertEquals("12", preservedDraft?.deadPlantsInput)
        assertEquals(12L, preservedDraft?.frozenDeadPlants)
        assertEquals("Conteo local", preservedDraft?.observationsInput)
        assertEquals("clave-idempotencia", preservedDraft?.idempotencyKey)
    }

    private fun reservation() = ConfirmedReservationEntity(
        "reserva-1", "usuario-1", "dispositivo-1", "jornada-1", "jornada-linea-1", "EN_CONTEO",
        "2026-07-13T20:00:00.000Z", 1, "Vivero", "Módulo", "Cama", "Línea", "Línea 1", 1,
        "ciphertext-que-no-es-token", "iv-aleatorio",
        inventoryReportEnabled = true,
        inventoryReportMonth = 7,
        inventoryReportYear = 2026,
        inventoryReportDeadPlantsSource = "CONTEO_FISICO",
    )

    private fun draft() = CountDraftEntity(
        "reserva-1", "usuario-1", "dispositivo-1", "450", "320", "210", "Conteo local",
        SyncState.PENDIENTE.name, 450, 320, 210, "Conteo local", "2026-07-13T20:00:00.000Z",
        "clave-idempotencia", null, null, null, null, null, 1L,
        "12", 12,
    )
}
