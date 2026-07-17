package com.arles.viverocampo.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface DiscardLineDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveAll(lines: List<DiscardLineEntity>)

    @Query("SELECT * FROM discard_lines ORDER BY displayName, orderValue")
    suspend fun all(): List<DiscardLineEntity>

    @Query("DELETE FROM discard_lines")
    suspend fun clear()
}
