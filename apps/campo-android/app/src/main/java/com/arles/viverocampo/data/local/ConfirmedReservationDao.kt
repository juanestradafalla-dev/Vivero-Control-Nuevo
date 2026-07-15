package com.arles.viverocampo.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface ConfirmedReservationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: ConfirmedReservationEntity)

    @Query(
        """
        SELECT * FROM confirmed_reservations
        WHERE userId = :userId
          AND deviceId = :deviceId
          AND tokenCiphertext IS NOT NULL
          AND tokenIv IS NOT NULL
        ORDER BY confirmedAt DESC
        LIMIT 1
        """,
    )
    suspend fun latestActiveForUserAndDevice(userId: String, deviceId: String): ConfirmedReservationEntity?

    @Query("SELECT * FROM confirmed_reservations WHERE reservationId = :reservationId LIMIT 1")
    suspend fun byId(reservationId: String): ConfirmedReservationEntity?

    @Query("UPDATE confirmed_reservations SET tokenCiphertext = NULL, tokenIv = NULL WHERE reservationId = :reservationId")
    suspend fun clearEncryptedToken(reservationId: String)

    @Query("UPDATE confirmed_reservations SET state = :state WHERE reservationId = :reservationId")
    suspend fun updateState(reservationId: String, state: String)
}
