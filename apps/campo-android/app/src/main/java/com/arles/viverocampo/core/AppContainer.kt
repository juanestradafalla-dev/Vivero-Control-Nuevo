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
import com.arles.viverocampo.data.sync.DiscardSyncScheduler
import com.arles.viverocampo.data.sync.DiscardSyncWorkerDependencies
import com.arles.viverocampo.data.sync.WorkManagerDiscardSyncScheduler
import com.arles.viverocampo.data.sync.WorkManagerCountSyncScheduler
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoEnvironment
import java.util.UUID

class AppContainer private constructor(
    val repository: CampoRepository,
    val deviceId: String,
    val syncScheduler: CountSyncScheduler,
    val discardSyncScheduler: DiscardSyncScheduler,
) {
    companion object {
        fun create(context: Context): AppContainer {
            val initialization = FirebaseServicesInitializer.initialize(context)
            val config = initialization.config
            val namespace = runCatching {
                LocalRuntimeNames.validateNamespace(config.localStorageNamespace)
            }.getOrDefault("disabled")
            val preferences = context.getSharedPreferences(LocalRuntimeNames.preferences(namespace), Context.MODE_PRIVATE)
            val installationId = preferences.getString("installation_id", null)
                ?: UUID.randomUUID().toString().also {
                    preferences.edit { putString("installation_id", it) }
                }
            val deviceId = "ANDROID-${namespace.uppercase()}-INSTALACION-$installationId"
            val services = initialization.services
            val repository = if (services == null) {
                DisabledCampoRepository(config.environment, requireNotNull(initialization.errorMessage))
            } else {
                val database = Room.databaseBuilder(
                    context.applicationContext,
                    ViveroCampoDatabase::class.java,
                    LocalRuntimeNames.database(namespace),
                ).addMigrations(
                    ViveroCampoDatabase.MIGRATION_1_2,
                    ViveroCampoDatabase.MIGRATION_2_3,
                    ViveroCampoDatabase.MIGRATION_3_4,
                    ViveroCampoDatabase.MIGRATION_4_5,
                ).build()
                FirebaseCampoRepository(
                    services,
                    database,
                    AndroidKeystoreReservationTokenVault(namespace),
                    config.environment,
                )
            }
            CountSyncWorkerDependencies.repository = repository
            DiscardSyncWorkerDependencies.repository = repository
            return AppContainer(
                repository,
                deviceId,
                WorkManagerCountSyncScheduler(context, namespace),
                WorkManagerDiscardSyncScheduler(context, namespace),
            )
        }
    }
}
