package com.arles.viverocampo.data.local

import android.content.Context
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ViveroCampoDatabaseMigrationTest {
    @Test
    fun `migracion 4 a 5 agrega columnas sin convertir intentos antiguos a cero`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(null)
                .callback(object : SupportSQLiteOpenHelper.Callback(1) {
                    override fun onCreate(db: SupportSQLiteDatabase) = Unit
                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
                })
                .build(),
        )
        try {
            val database = helper.writableDatabase
            database.execSQL(
                """
                CREATE TABLE confirmed_reservations (
                    reservationId TEXT NOT NULL PRIMARY KEY
                )
                """.trimIndent(),
            )
            database.execSQL(
                "INSERT INTO confirmed_reservations (reservationId) VALUES ('reserva-antigua')",
            )
            database.execSQL(
                """
                CREATE TABLE count_drafts (
                    reservationId TEXT NOT NULL PRIMARY KEY,
                    idempotencyKey TEXT,
                    frozenFemales INTEGER,
                    frozenMales INTEGER,
                    frozenRootstocks INTEGER,
                    frozenObservations TEXT,
                    frozenDeviceTimestamp TEXT
                )
                """.trimIndent(),
            )
            database.execSQL(
                """
                INSERT INTO count_drafts (
                    reservationId, idempotencyKey, frozenFemales, frozenMales,
                    frozenRootstocks, frozenObservations, frozenDeviceTimestamp
                ) VALUES ('reserva-antigua', 'clave-antigua', 10, 5, 2, '', '2026-07-17T12:00:00.000Z')
                """.trimIndent(),
            )

            ViveroCampoDatabase.MIGRATION_4_5.migrate(database)

            database.query(
                "SELECT deadPlantsInput, frozenDeadPlants FROM count_drafts WHERE reservationId = 'reserva-antigua'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("", cursor.getString(0))
                assertTrue(cursor.isNull(1))
            }
            database.query(
                """
                SELECT inventoryReportEnabled, inventoryReportMonth, inventoryReportYear,
                    inventoryReportDeadPlantsSource
                FROM confirmed_reservations WHERE reservationId = 'reserva-antigua'
                """.trimIndent(),
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue((0..3).all(cursor::isNull))
            }
        } finally {
            helper.close()
        }
    }
}
