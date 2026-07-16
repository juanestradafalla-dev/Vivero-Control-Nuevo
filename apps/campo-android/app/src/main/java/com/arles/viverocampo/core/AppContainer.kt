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
import com.arles.viverocampo.domain.CampoEnvironment
import java.util.UUID

class AppContainer private constructor(
    val repository: CampoRepository,
    val deviceId: String,
    val syncScheduler: CountSyncScheduler,
) {
    companion object {
        fun create(context: Context): AppContainer {
            val initialization = FirebaseServicesInitializer.initialize(context)
            val config = initialization.config
            val namespace = config.localStorageNamespace.takeIf { it.matches(Regex("[a-z0-9_-]+")) } ?: "disabled"
            val preferences = context.getSharedPreferences("technical_$namespace", Context.MODE_PRIVATE)
            val installationId = preferences.getString("installation_id", null)
                ?: UUID.randomUUID().toString().also {
                    preferences.edit { putString("installation_id", it) }
                }
            val emulatorMode = config.environment == CampoEnvironment.EMULATOR
            val deviceId = if (emulatorMode) {
                "ANDROID-INSTALACION-$installationId"
            } else {
                "ANDROID-${namespace.uppercase()}-INSTALACION-$installationId"
            }
            val services = initialization.services
            val repository = if (services == null) {
                DisabledCampoRepository(config.environment, requireNotNull(initialization.errorMessage))
            } else {
                val database = Room.databaseBuilder(
                    context.applicationContext,
                    ViveroCampoDatabase::class.java,
                    if (emulatorMode) "vivero-campo-emulador.db" else "vivero-campo-$namespace.db",
                ).addMigrations(
                    ViveroCampoDatabase.MIGRATION_1_2,
                    ViveroCampoDatabase.MIGRATION_2_3,
                ).build()
                FirebaseCampoRepository(
                    services,
                    database,
                    AndroidKeystoreReservationTokenVault(namespace),
                    config.environment,
                )
            }
            CountSyncWorkerDependencies.repository = repository
            return AppContainer(repository, deviceId, WorkManagerCountSyncScheduler(context, namespace))
        }
    }
}
