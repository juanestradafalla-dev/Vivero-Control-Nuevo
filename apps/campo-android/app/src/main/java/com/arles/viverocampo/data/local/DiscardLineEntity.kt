package com.arles.viverocampo.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "discard_lines")
data class DiscardLineEntity(
    @PrimaryKey val lineId: String,
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
    val inventoryVersion: Long,
    val cachedAtEpochMillis: Long,
)
