package com.arles.viverocampo.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "discard_drafts",
    indices = [Index(value = ["userId", "deviceId"]), Index(value = ["syncState"])],
)
data class DiscardDraftEntity(
    @PrimaryKey val draftId: String,
    val userId: String,
    val deviceId: String,
    val lineId: String,
    val inventoryVersion: Long,
    val nursery: String,
    val module: String,
    val bed: String,
    val line: String,
    val displayName: String,
    val orderValue: Int,
    val inventoryFemales: Long,
    val inventoryMales: Long,
    val inventoryRootstocks: Long,
    val inventoryTotal: Long,
    val femalesInput: String,
    val malesInput: String,
    val rootstocksInput: String,
    val deadInput: String,
    val nematodesInput: String,
    val gooseNeckInput: String,
    val bifurcatedRootsInput: String,
    val doubleGraftingInput: String,
    val observationsInput: String,
    val syncState: String,
    val frozenFemales: Long?,
    val frozenMales: Long?,
    val frozenRootstocks: Long?,
    val frozenDead: Long?,
    val frozenNematodes: Long?,
    val frozenGooseNeck: Long?,
    val frozenBifurcatedRoots: Long?,
    val frozenDoubleGrafting: Long?,
    val frozenObservations: String?,
    val frozenDeviceTimestamp: String?,
    val idempotencyKey: String?,
    val errorCode: String?,
    val errorMessage: String?,
    val discardId: String?,
    val centralState: String?,
    val serverReceivedAt: String?,
    val updatedAtEpochMillis: Long,
)
