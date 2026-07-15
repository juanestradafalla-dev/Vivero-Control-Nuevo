package com.arles.viverocampo.core

import android.content.Context
import androidx.room.Room
import androidx.core.content.edit
import com.arles.viverocampo.data.DisabledCampoRepository
import com.arles.viverocampo.data.FirebaseCampoRepository
import com.arles.viverocampo.data.local.ViveroCampoDatabase
import com.arles.viverocampo.data.security.AndroidKeystoreReservationTokenVault
import com.arles.viverocampo.data.sync.CountSyncScheduler
import com.arles.viverocampo.data.sync.CountSyncWorkerDependencies
import com.arles.viverocampo.data.sync.WorkManagerCountSyncScheduler
import com.arles.viverocampo.domain.CampoRepository
import java.util.UUID

class AppContainer private constructor(
    val repository: CampoRepository,
    val deviceId: String,
    val syncScheduler: CountSyncScheduler,
) {
    companion object {
        fun create(context: Context): AppContainer {
            val preferences = context.getSharedPreferences("technical_emulator", Context.MODE_PRIVATE)
            val installationId = preferences.getString("installation_id", null)
                ?: UUID.randomUUID().toString().also {
                    preferences.edit { putString("installation_id", it) }
                }
            val deviceId = "ANDROID-INSTALACION-$installationId"
            val services = FirebaseEmulatorInitializer.initialize(context)
            val repository = if (services == null) {
                DisabledCampoRepository()
            } else {
                val database = Room.databaseBuilder(
                    context.applicationContext,
                    ViveroCampoDatabase::class.java,
                    "vivero-campo-emulador.db",
                ).addMigrations(
                    ViveroCampoDatabase.MIGRATION_1_2,
                    ViveroCampoDatabase.MIGRATION_2_3,
                ).build()
                FirebaseCampoRepository(services, database, AndroidKeystoreReservationTokenVault())
            }
            CountSyncWorkerDependencies.repository = repository
            return AppContainer(repository, deviceId, WorkManagerCountSyncScheduler(context))
        }
    }
}
