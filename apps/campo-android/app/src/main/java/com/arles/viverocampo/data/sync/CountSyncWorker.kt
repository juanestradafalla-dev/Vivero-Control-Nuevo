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
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CountSyncOutcome

interface CountSyncScheduler {
    fun schedule(reservationId: String, idempotencyKey: String)
    fun cancel(reservationId: String, idempotencyKey: String)
}

class WorkManagerCountSyncScheduler(context: Context) : CountSyncScheduler {
    private val workManager = WorkManager.getInstance(context.applicationContext)

    override fun schedule(reservationId: String, idempotencyKey: String) {
        val request = OneTimeWorkRequestBuilder<CountSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(Data.Builder().putString(INPUT_RESERVATION_ID, reservationId).build())
            .addTag(TAG_COUNT_SEND)
            .build()
        workManager.enqueueUniqueWork(workName(reservationId, idempotencyKey), ExistingWorkPolicy.KEEP, request)
    }

    override fun cancel(reservationId: String, idempotencyKey: String) {
        workManager.cancelUniqueWork(workName(reservationId, idempotencyKey))
    }

    private fun workName(reservationId: String, idempotencyKey: String) =
        "count-send-$reservationId-$idempotencyKey"

    companion object {
        const val INPUT_RESERVATION_ID = "reservation_id"
        const val TAG_COUNT_SEND = "vivero_count_send"
    }
}

object CountSyncWorkerDependencies {
    @Volatile
    var repository: CampoRepository? = null
}

class CountSyncWorker(appContext: Context, parameters: WorkerParameters) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val reservationId = inputData.getString(WorkManagerCountSyncScheduler.INPUT_RESERVATION_ID)
            ?: return Result.failure()
        val repository = CountSyncWorkerDependencies.repository ?: return Result.retry()
        return when (repository.synchronizeCount(reservationId)) {
            CountSyncOutcome.Success -> Result.success()
            is CountSyncOutcome.Retryable -> Result.retry()
            is CountSyncOutcome.PermanentFailure -> Result.failure()
        }
    }
}
