package com.arles.viverocampo.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "count_drafts",
    indices = [
        Index(value = ["userId", "deviceId", "reservationId"], unique = true),
        Index(value = ["syncState"]),
    ],
)
data class CountDraftEntity(
    @PrimaryKey val reservationId: String,
    val userId: String,
    val deviceId: String,
    val femalesInput: String,
    val malesInput: String,
    val rootstocksInput: String,
    val observationsInput: String,
    val syncState: String,
    val frozenFemales: Long?,
    val frozenMales: Long?,
    val frozenRootstocks: Long?,
    val frozenObservations: String?,
    val frozenDeviceTimestamp: String?,
    val idempotencyKey: String?,
    val errorCode: String?,
    val errorMessage: String?,
    val countId: String?,
    val centralState: String?,
    val serverReceivedAt: String?,
    val updatedAtEpochMillis: Long,
)
