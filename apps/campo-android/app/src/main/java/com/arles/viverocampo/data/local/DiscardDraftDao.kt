package com.arles.viverocampo.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DiscardDraftDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: DiscardDraftEntity)

    @Query("SELECT * FROM discard_drafts WHERE draftId = :draftId LIMIT 1")
    suspend fun byId(draftId: String): DiscardDraftEntity?

    @Query(
        "SELECT * FROM discard_drafts WHERE draftId = :draftId AND userId = :userId AND deviceId = :deviceId LIMIT 1",
    )
    fun observe(draftId: String, userId: String, deviceId: String): Flow<DiscardDraftEntity?>

    @Query(
        "SELECT * FROM discard_drafts WHERE userId = :userId AND deviceId = :deviceId " +
            "AND syncState != 'ENVIADA' ORDER BY updatedAtEpochMillis DESC LIMIT 1",
    )
    suspend fun latestPending(userId: String, deviceId: String): DiscardDraftEntity?

    @Query("DELETE FROM discard_drafts WHERE draftId = :draftId AND userId = :userId AND deviceId = :deviceId")
    suspend fun delete(draftId: String, userId: String, deviceId: String): Int
}
