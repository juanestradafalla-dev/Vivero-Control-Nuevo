package com.arles.viverocampo.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.arles.viverocampo.core.LocalRuntimeNames
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.DiscardSyncOutcome

interface DiscardSyncScheduler {
    fun schedule(draftId: String, idempotencyKey: String)
    fun cancel(draftId: String, idempotencyKey: String)
}

class WorkManagerDiscardSyncScheduler(
    context: Context,
    private val namespace: String = "emulator",
) : DiscardSyncScheduler {
    private val workManager = WorkManager.getInstance(context.applicationContext)

    init { LocalRuntimeNames.validateNamespace(namespace) }

    override fun schedule(draftId: String, idempotencyKey: String) {
        val request = OneTimeWorkRequestBuilder<DiscardSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(Data.Builder().putString(INPUT_DRAFT_ID, draftId).build())
            .addTag(LocalRuntimeNames.workTag(namespace))
            .build()
        workManager.enqueueUniqueWork(workName(draftId, idempotencyKey), ExistingWorkPolicy.KEEP, request)
    }

    override fun cancel(draftId: String, idempotencyKey: String) {
        workManager.cancelUniqueWork(workName(draftId, idempotencyKey))
    }

    private fun workName(draftId: String, idempotencyKey: String) =
        LocalRuntimeNames.workName(namespace, "discard-$draftId", idempotencyKey)

    companion object {
        const val INPUT_DRAFT_ID = "discard_draft_id"
    }
}

object DiscardSyncWorkerDependencies {
    @Volatile
    var repository: CampoRepository? = null
}

class DiscardSyncWorker(appContext: Context, parameters: WorkerParameters) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val draftId = inputData.getString(WorkManagerDiscardSyncScheduler.INPUT_DRAFT_ID)
            ?: return Result.failure()
        val repository = DiscardSyncWorkerDependencies.repository ?: return Result.retry()
        return when (repository.synchronizeDiscard(draftId)) {
            DiscardSyncOutcome.Success -> Result.success()
            is DiscardSyncOutcome.Retryable -> Result.retry()
            is DiscardSyncOutcome.PermanentFailure -> Result.failure()
        }
    }
}
