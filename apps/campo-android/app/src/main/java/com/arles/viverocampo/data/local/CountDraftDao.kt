package com.arles.viverocampo.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CountDraftDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: CountDraftEntity)

    @Query(
        """
        SELECT * FROM count_drafts
        WHERE reservationId = :reservationId AND userId = :userId AND deviceId = :deviceId
        LIMIT 1
        """,
    )
    fun observe(reservationId: String, userId: String, deviceId: String): Flow<CountDraftEntity?>

    @Query("SELECT * FROM count_drafts WHERE reservationId = :reservationId LIMIT 1")
    suspend fun byReservationId(reservationId: String): CountDraftEntity?
}
