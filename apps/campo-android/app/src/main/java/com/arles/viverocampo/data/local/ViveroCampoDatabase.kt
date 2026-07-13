package com.arles.viverocampo.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [ConfirmedReservationEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class ViveroCampoDatabase : RoomDatabase() {
    abstract fun confirmedReservationDao(): ConfirmedReservationDao
}
