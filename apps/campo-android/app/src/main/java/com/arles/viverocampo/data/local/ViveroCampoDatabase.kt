package com.arles.viverocampo.data.local

import androidx.room.Database
import androidx.room.migration.Migration
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        ConfirmedReservationEntity::class,
        CountDraftEntity::class,
        DiscardLineEntity::class,
        DiscardDraftEntity::class,
    ],
    version = 5,
    exportSchema = false,
)
abstract class ViveroCampoDatabase : RoomDatabase() {
    abstract fun confirmedReservationDao(): ConfirmedReservationDao
    abstract fun countDraftDao(): CountDraftDao
    abstract fun discardLineDao(): DiscardLineDao
    abstract fun discardDraftDao(): DiscardDraftDao

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

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS discard_lines (
                        lineId TEXT NOT NULL PRIMARY KEY,
                        nursery TEXT NOT NULL,
                        module TEXT NOT NULL,
                        bed TEXT NOT NULL,
                        line TEXT NOT NULL,
                        displayName TEXT NOT NULL,
                        orderValue INTEGER NOT NULL,
                        inventoryFemales INTEGER NOT NULL,
                        inventoryMales INTEGER NOT NULL,
                        inventoryRootstocks INTEGER NOT NULL,
                        inventoryTotal INTEGER NOT NULL,
                        inventoryVersion INTEGER NOT NULL,
                        cachedAtEpochMillis INTEGER NOT NULL
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS discard_drafts (
                        draftId TEXT NOT NULL PRIMARY KEY,
                        userId TEXT NOT NULL,
                        deviceId TEXT NOT NULL,
                        lineId TEXT NOT NULL,
                        inventoryVersion INTEGER NOT NULL,
                        nursery TEXT NOT NULL,
                        module TEXT NOT NULL,
                        bed TEXT NOT NULL,
                        line TEXT NOT NULL,
                        displayName TEXT NOT NULL,
                        orderValue INTEGER NOT NULL,
                        inventoryFemales INTEGER NOT NULL,
                        inventoryMales INTEGER NOT NULL,
                        inventoryRootstocks INTEGER NOT NULL,
                        inventoryTotal INTEGER NOT NULL,
                        femalesInput TEXT NOT NULL,
                        malesInput TEXT NOT NULL,
                        rootstocksInput TEXT NOT NULL,
                        deadInput TEXT NOT NULL,
                        nematodesInput TEXT NOT NULL,
                        gooseNeckInput TEXT NOT NULL,
                        bifurcatedRootsInput TEXT NOT NULL,
                        doubleGraftingInput TEXT NOT NULL,
                        observationsInput TEXT NOT NULL,
                        syncState TEXT NOT NULL,
                        frozenFemales INTEGER,
                        frozenMales INTEGER,
                        frozenRootstocks INTEGER,
                        frozenDead INTEGER,
                        frozenNematodes INTEGER,
                        frozenGooseNeck INTEGER,
                        frozenBifurcatedRoots INTEGER,
                        frozenDoubleGrafting INTEGER,
                        frozenObservations TEXT,
                        frozenDeviceTimestamp TEXT,
                        idempotencyKey TEXT,
                        errorCode TEXT,
                        errorMessage TEXT,
                        discardId TEXT,
                        centralState TEXT,
                        serverReceivedAt TEXT,
                        updatedAtEpochMillis INTEGER NOT NULL
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_discard_drafts_userId_deviceId " +
                        "ON discard_drafts (userId, deviceId)",
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_discard_drafts_syncState ON discard_drafts (syncState)",
                )
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN inventoryReportEnabled INTEGER")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN inventoryReportMonth INTEGER")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN inventoryReportYear INTEGER")
                db.execSQL("ALTER TABLE confirmed_reservations ADD COLUMN inventoryReportDeadPlantsSource TEXT")
                db.execSQL("ALTER TABLE count_drafts ADD COLUMN deadPlantsInput TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE count_drafts ADD COLUMN frozenDeadPlants INTEGER")
            }
        }
    }
}
