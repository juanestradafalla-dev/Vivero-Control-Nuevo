package com.arles.viverocampo.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "confirmed_reservations",
    indices = [Index(value = ["userId", "confirmedAt"])],
)
data class ConfirmedReservationEntity(
    @PrimaryKey val reservationId: String,
    val userId: String,
    val journeyLineId: String,
    val state: String,
    val confirmedAt: String,
    val version: Int,
    val nursery: String,
    val module: String,
    val bed: String,
    val line: String,
    val displayName: String,
    val orderValue: Int,
)
