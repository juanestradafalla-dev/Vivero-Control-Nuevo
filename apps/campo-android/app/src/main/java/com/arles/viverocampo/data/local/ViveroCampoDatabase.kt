package com.arles.viverocampo.data.local

import androidx.room.Database
import androidx.room.migration.Migration
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [ConfirmedReservationEntity::class, CountDraftEntity::class],
    version = 3,
    exportSchema = false,
)
abstract class ViveroCampoDatabase : RoomDatabase() {
    abstract fun confirmedReservationDao(): ConfirmedReservationDao
    abstract fun countDraftDao(): CountDraftDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN deviceId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN journeyId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN tokenCiphertext TEXT")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN tokenIv TEXT")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS count_drafts (
                        reservationId TEXT NOT NULL PRIMARY KEY,
                        userId TEXT NOT NULL,
                        deviceId TEXT NOT NULL,
                        femalesInput TEXT NOT NULL,
                        malesInput TEXT NOT NULL,
                        rootstocksInput TEXT NOT NULL,
                        observationsInput TEXT NOT NULL,
                        syncState TEXT NOT NULL,
                        frozenFemales INTEGER,
                        frozenMales INTEGER,
                        frozenRootstocks INTEGER,
                        frozenObservations TEXT,
                        frozenDeviceTimestamp TEXT,
                        idempotencyKey TEXT,
                        errorCode TEXT,
                        errorMessage TEXT,
                        countId TEXT,
                        centralState TEXT,
                        serverReceivedAt TEXT,
                        updatedAtEpochMillis INTEGER NOT NULL
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_count_drafts_userId_deviceId_reservationId " +
                        "ON count_drafts (userId, deviceId, reservationId)",
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_count_drafts_syncState ON count_drafts (syncState)",
                )
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN reservationType TEXT NOT NULL DEFAULT 'INICIAL'")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN previousCountId TEXT")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN nextCountVersion INTEGER NOT NULL DEFAULT 1")
            }
        }
    }
}
