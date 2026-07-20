package com.arles.viverocampo.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.arles.viverocampo.data.sync.CountSyncScheduler
import com.arles.viverocampo.data.sync.DiscardSyncScheduler
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.CampoEnvironment
import com.arles.viverocampo.domain.ActiveJourney
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.CountFieldErrors
import com.arles.viverocampo.domain.CountFormValidator
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.DiscardFieldErrors
import com.arles.viverocampo.domain.DiscardFormValidator
import com.arles.viverocampo.domain.DiscardInput
import com.arles.viverocampo.domain.DiscardLine
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.InitiateCountCorrectionPayload
import com.arles.viverocampo.domain.InventoryReportConfiguration
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.LocalDiscardDraft
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.RELEASED_RESERVATION_MESSAGE
import com.arles.viverocampo.domain.ReturnedCount
import com.arles.viverocampo.domain.SessionRestoreResult
import com.arles.viverocampo.domain.SessionRevocationReason
import com.arles.viverocampo.domain.SyncState
import com.arles.viverocampo.domain.UserProfile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.launch

enum class CampoMode { CONTEOS, DESCARTES }

enum class SessionStatus {
    RESTORING,
    NO_SESSION,
    RESTORED_VERIFIED,
    RESTORED_CACHED,
    VERIFICATION_PENDING,
    REVOKED,
}

data class CampoUiState(
    val environment: CampoEnvironment,
    val accessEnabled: Boolean,
    val mutableOperationsEnabled: Boolean,
    val email: String = "",
    val password: String = "",
    val signingIn: Boolean = false,
    val sessionStatus: SessionStatus,
    val user: UserProfile? = null,
    val mode: CampoMode = CampoMode.CONTEOS,
    val activeJourneys: List<ActiveJourney> = emptyList(),
    val selectedJourneyId: String? = null,
    val inventoryReportConfiguration: InventoryReportConfiguration? = null,
    val journey: JourneySnapshot? = null,
    val returnedCounts: List<ReturnedCount> = emptyList(),
    val connectionStatus: String = "DESCONECTADO",
    val selectedLine: JourneyLine? = null,
    val reserving: Boolean = false,
    val correctingCountId: String? = null,
    val confirmedReservation: ConfirmedReservation? = null,
    val countInput: CountInput = CountInput(),
    val countErrors: CountFieldErrors = CountFieldErrors(),
    val countTotal: Long? = null,
    val zeroWarning: Boolean = false,
    val countDraft: LocalCountDraft? = null,
    val showCountSummary: Boolean = false,
    val confirmingCount: Boolean = false,
    val discardLines: List<DiscardLine> = emptyList(),
    val discardSearch: String = "",
    val loadingDiscardLines: Boolean = false,
    val selectedDiscardLine: DiscardLine? = null,
    val discardDraft: LocalDiscardDraft? = null,
    val discardInput: DiscardInput = DiscardInput(),
    val discardErrors: DiscardFieldErrors = DiscardFieldErrors(),
    val discardUniqueTotal: Long? = null,
    val discardCausesTotal: Long? = null,
    val showDiscardSummary: Boolean = false,
    val confirmingDiscard: Boolean = false,
    val message: String? = null,
) {
    val requiresPhysicalDeadPlants: Boolean
        get() = inventoryReportConfiguration?.requiresPhysicalDeadPlants == true
}

class CampoViewModel(
    private val repository: CampoRepository,
    private val deviceId: String,
    private val syncScheduler: CountSyncScheduler = NoOpCountSyncScheduler,
    private val discardSyncScheduler: DiscardSyncScheduler = NoOpDiscardSyncScheduler,
    private val keyFactory: () -> String = { UUID.randomUUID().toString() },
    private val timestampFactory: () -> String = {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
    },
) : ViewModel() {
    private val mutableState = MutableStateFlow(
        CampoUiState(
            environment = repository.environment,
            accessEnabled = repository.accessEnabled,
            mutableOperationsEnabled = repository.mutableOperationsEnabled,
            sessionStatus = if (repository.accessEnabled) SessionStatus.RESTORING else SessionStatus.NO_SESSION,
            message = repository.configurationError,
        ),
    )
    val uiState: StateFlow<CampoUiState> = mutableState.asStateFlow()
    private val pendingReservationKeys = mutableMapOf<String, String>()
    private val pendingCorrectionKeys = mutableMapOf<String, String>()
    private var journeyJob: Job? = null
    private var returnedCountsJob: Job? = null
    private var draftJob: Job? = null
    private var reservationStateJob: Job? = null
    private var countSaveJob: Job? = null
    private var accountStatusJob: Job? = null
    private var discardDraftJob: Job? = null
    private var discardSaveJob: Job? = null
    private var restorationJob: Job? = null
    private val scheduledCountWork = mutableSetOf<Pair<String, String>>()
    private val scheduledDiscardWork = mutableSetOf<Pair<String, String>>()

    init {
        startSessionRestoration()
    }

    private fun startSessionRestoration() {
        if (!repository.accessEnabled) return
        if (restorationJob?.isActive == true) return
        restorationJob = viewModelScope.launch {
            mutableState.value = mutableState.value.copy(
                sessionStatus = SessionStatus.RESTORING,
                signingIn = false,
                password = "",
                message = "Verificando sesi\u00f3n\u2026",
            )
            val result = try {
                repository.restoreSession()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                null
            }
            when (result) {
                SessionRestoreResult.NoSession -> mutableState.value = CampoUiState(
                    environment = repository.environment,
                    accessEnabled = repository.accessEnabled,
                    mutableOperationsEnabled = repository.mutableOperationsEnabled,
                    sessionStatus = SessionStatus.NO_SESSION,
                    message = repository.configurationError,
                )
                is SessionRestoreResult.RestoredVerified -> restoreAuthenticatedSession(
                    result.profile,
                    SessionStatus.RESTORED_VERIFIED,
                )
                is SessionRestoreResult.RestoredCached -> restoreAuthenticatedSession(
                    result.profile,
                    SessionStatus.RESTORED_CACHED,
                )
                is SessionRestoreResult.VerificationPending, null -> mutableState.value = mutableState.value.copy(
                    sessionStatus = SessionStatus.VERIFICATION_PENDING,
                    user = null,
                    connectionStatus = "SIN CONEXI\u00d3N",
                    message = "Verificando sesi\u00f3n; conecta el dispositivo para continuar",
                )
                is SessionRestoreResult.Revoked -> handleAuthoritativeRevocation(
                    when (result.reason) {
                        SessionRevocationReason.PROFILE_NOT_FOUND -> "La cuenta no tiene un perfil operativo."
                        SessionRevocationReason.PROFILE_INACTIVE -> "Cuenta desactivada"
                    },
                )
            }
        }
    }

    fun retrySessionVerification() {
        if (mutableState.value.sessionStatus !in setOf(
                SessionStatus.VERIFICATION_PENDING,
                SessionStatus.RESTORED_CACHED,
            )
        ) return
        startSessionRestoration()
    }

    private suspend fun restoreAuthenticatedSession(user: UserProfile, status: SessionStatus) {
            val journeysResult = runCatching { repository.listActiveJourneys() }
            val journeys = journeysResult.getOrDefault(emptyList())
            val reservation = repository.latestActiveReservation(user.id, deviceId)
            val discardLines = runCatching { repository.listDiscardLines() }.getOrDefault(emptyList())
            val pendingDiscard = repository.latestPendingDiscard(user.id, deviceId)
            val selectedJourneyId = reservation?.journeyId ?: journeys.singleOrNull()?.id
            val listedInventoryReportConfiguration = journeys
                .firstOrNull { it.id == selectedJourneyId }
                ?.inventoryReportConfiguration
            val inventoryReportConfiguration = listedInventoryReportConfiguration
                ?: reservation?.inventoryReportConfiguration?.takeIf { journeysResult.isFailure }
            mutableState.value = mutableState.value.copy(
                user = user,
                sessionStatus = status,
                activeJourneys = journeys,
                selectedJourneyId = selectedJourneyId,
                inventoryReportConfiguration = inventoryReportConfiguration,
                confirmedReservation = reservation,
                discardLines = discardLines,
                discardDraft = pendingDiscard,
                discardInput = pendingDiscard?.input ?: DiscardInput(),
                connectionStatus = if (selectedJourneyId == null) "SIN SEÑAL / CACHÉ LOCAL" else "CONECTANDO",
                message = if (journeys.isEmpty() && discardLines.isEmpty()) {
                    "Sesión restaurada. Conéctate una vez para actualizar jornadas y líneas."
                } else {
                    "Sesión restaurada; los datos locales siguen disponibles sin señal."
                },
            )
            if (status == SessionStatus.RESTORED_CACHED) {
                mutableState.value = mutableState.value.copy(
                    message = "Sesi\u00f3n restaurada desde cach\u00e9; la verificaci\u00f3n central sigue pendiente.",
                )
            }
            observeAccountStatus(user)
            if (selectedJourneyId != null) {
                observeJourney(selectedJourneyId)
                observeReturnedCounts(user, selectedJourneyId)
            }
            if (reservation != null && reservation.deviceId == deviceId) {
                observeReservationState(reservation)
                observeDraft(user, reservation)
            }
            if (pendingDiscard != null) observeDiscardDraft(user, pendingDiscard)
    }

    fun updateEmail(value: String) {
        if (mutableState.value.sessionStatus !in setOf(SessionStatus.NO_SESSION, SessionStatus.REVOKED)) return
        mutableState.value = mutableState.value.copy(email = value, message = null)
    }

    fun updatePassword(value: String) {
        if (mutableState.value.sessionStatus !in setOf(SessionStatus.NO_SESSION, SessionStatus.REVOKED)) return
        mutableState.value = mutableState.value.copy(password = value, message = null)
    }

    fun signIn() {
        val state = mutableState.value
        if (!state.accessEnabled) {
            mutableState.value = state.copy(message = repository.configurationError)
            return
        }
        if (state.sessionStatus !in setOf(SessionStatus.NO_SESSION, SessionStatus.REVOKED)) return
        if (state.signingIn || state.email.isBlank() || state.password.isBlank()) {
            if (state.email.isBlank() || state.password.isBlank()) {
                mutableState.value = state.copy(message = "Ingresa correo y contraseña.")
            }
            return
        }
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(signingIn = true, message = null)
            try {
                val user = repository.signIn(state.email, state.password)
                val journeys = repository.listActiveJourneys()
                val reservation = repository.latestActiveReservation(user.id, deviceId)
                val discardLines = runCatching { repository.listDiscardLines() }.getOrDefault(emptyList())
                val pendingDiscard = repository.latestPendingDiscard(user.id, deviceId)
                val selectedJourneyId = reservation?.journeyId ?: journeys.singleOrNull()?.id
                val inventoryReportConfiguration = journeys
                    .firstOrNull { it.id == selectedJourneyId }
                    ?.inventoryReportConfiguration
                mutableState.value = mutableState.value.copy(
                    signingIn = false,
                    password = "",
                    user = user,
                    sessionStatus = SessionStatus.RESTORED_VERIFIED,
                    activeJourneys = journeys,
                    selectedJourneyId = selectedJourneyId,
                    inventoryReportConfiguration = inventoryReportConfiguration,
                    confirmedReservation = reservation,
                    discardLines = discardLines,
                    discardDraft = pendingDiscard,
                    discardInput = pendingDiscard?.input ?: DiscardInput(),
                    connectionStatus = if (selectedJourneyId == null) "CONECTADO" else "CONECTANDO",
                    message = if (journeys.isEmpty() && discardLines.isEmpty()) {
                        "No hay jornadas ni líneas de descarte disponibles para esta cuenta."
                    } else {
                        null
                    },
                )
                observeAccountStatus(user)
                if (selectedJourneyId != null) {
                    observeJourney(selectedJourneyId)
                    observeReturnedCounts(user, selectedJourneyId)
                }
                if (reservation != null && reservation.deviceId == deviceId) {
                    observeReservationState(reservation)
                    observeDraft(user, reservation)
                }
                if (pendingDiscard != null) observeDiscardDraft(user, pendingDiscard)
            } catch (error: CampoRepositoryException) {
                mutableState.value = mutableState.value.copy(
                    signingIn = false,
                    password = "",
                    message = error.message,
                    connectionStatus = "ERROR",
                )
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            restorationJob?.cancel()
            repository.signOut()
            cancelSessionJobs()
            clearSessionCoordination()
            mutableState.value = CampoUiState(
                environment = repository.environment,
                accessEnabled = repository.accessEnabled,
                mutableOperationsEnabled = repository.mutableOperationsEnabled,
                sessionStatus = SessionStatus.NO_SESSION,
                message = repository.configurationError,
            )
        }
    }

    private fun cancelSessionJobs() {
        journeyJob?.cancel()
        returnedCountsJob?.cancel()
        draftJob?.cancel()
        reservationStateJob?.cancel()
        countSaveJob?.cancel()
        accountStatusJob?.cancel()
        discardDraftJob?.cancel()
        discardSaveJob?.cancel()
    }

    private fun clearSessionCoordination() {
        pendingReservationKeys.clear()
        pendingCorrectionKeys.clear()
        scheduledCountWork.clear()
        scheduledDiscardWork.clear()
    }

    private suspend fun handleAuthoritativeRevocation(message: String) {
        val current = mutableState.value
        current.countDraft?.frozenPayload?.let { payload ->
            syncScheduler.cancel(payload.reservationId, payload.idempotencyKey)
        }
        current.discardDraft?.frozenPayload?.let { payload ->
            discardSyncScheduler.cancel(payload.draftId, payload.idempotencyKey)
        }
        cancelSessionJobs()
        clearSessionCoordination()
        mutableState.value = CampoUiState(
            environment = repository.environment,
            accessEnabled = repository.accessEnabled,
            mutableOperationsEnabled = repository.mutableOperationsEnabled,
            sessionStatus = SessionStatus.REVOKED,
            message = message,
        )
    }

    private fun observeAccountStatus(user: UserProfile) {
        accountStatusJob?.cancel()
        accountStatusJob = viewModelScope.launch {
            repository.observeAccountActive(user.id)
                .catch { error ->
                    mutableState.value = mutableState.value.copy(
                        message = error.message ?: "No fue posible comprobar el estado de la cuenta.",
                    )
                }
                .collect { active ->
                    if (active) return@collect
                    repository.signOut()
                    handleAuthoritativeRevocation("Cuenta desactivada")
                }
        }
    }

    fun selectMode(mode: CampoMode) {
        val state = mutableState.value
        if (mode == CampoMode.DESCARTES && state.confirmedReservation != null) {
            mutableState.value = state.copy(message = "Finaliza el conteo activo antes de abrir descartes.")
            return
        }
        mutableState.value = state.copy(mode = mode, message = null)
        if (mode == CampoMode.DESCARTES && state.discardLines.isEmpty()) refreshDiscardLines()
    }

    fun refreshDiscardLines() {
        val state = mutableState.value
        if (state.loadingDiscardLines || state.user == null) return
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(loadingDiscardLines = true, message = null)
            try {
                val lines = repository.listDiscardLines()
                mutableState.value = mutableState.value.copy(
                    loadingDiscardLines = false,
                    discardLines = lines,
                    message = if (lines.isEmpty()) "No hay líneas con inventario oficial disponible." else null,
                )
            } catch (error: CampoRepositoryException) {
                mutableState.value = mutableState.value.copy(loadingDiscardLines = false, message = error.message)
            }
        }
    }

    fun updateDiscardSearch(value: String) {
        mutableState.value = mutableState.value.copy(discardSearch = value)
    }

    fun selectDiscardLine(line: DiscardLine) {
        if (blockMutableOperation() || mutableState.value.discardDraft != null) return
        val user = mutableState.value.user ?: return
        viewModelScope.launch {
            try {
                val draft = repository.startDiscardDraft(keyFactory(), line, user.id, deviceId)
                mutableState.value = mutableState.value.copy(
                    selectedDiscardLine = line,
                    discardDraft = draft,
                    discardInput = draft.input,
                    discardErrors = DiscardFieldErrors(),
                    message = "Borrador local listo. Puedes continuar sin señal.",
                )
                observeDiscardDraft(user, draft)
            } catch (error: CampoRepositoryException) {
                mutableState.value = mutableState.value.copy(message = error.message)
            }
        }
    }

    fun updateDiscardFemales(value: String) = updateDiscardInput(mutableState.value.discardInput.copy(females = value))
    fun updateDiscardMales(value: String) = updateDiscardInput(mutableState.value.discardInput.copy(males = value))
    fun updateDiscardRootstocks(value: String) = updateDiscardInput(mutableState.value.discardInput.copy(rootstocks = value))
    fun updateDiscardDead(value: String) = updateDiscardInput(mutableState.value.discardInput.copy(dead = value))
    fun updateDiscardNematodes(value: String) = updateDiscardInput(mutableState.value.discardInput.copy(nematodes = value))
    fun updateDiscardGooseNeck(value: String) = updateDiscardInput(mutableState.value.discardInput.copy(gooseNeck = value))
    fun updateDiscardBifurcatedRoots(value: String) =
        updateDiscardInput(mutableState.value.discardInput.copy(bifurcatedRoots = value))
    fun updateDiscardDoubleGrafting(value: String) =
        updateDiscardInput(mutableState.value.discardInput.copy(doubleGrafting = value))
    fun updateDiscardObservations(value: String) =
        updateDiscardInput(mutableState.value.discardInput.copy(observations = value))

    private fun updateDiscardInput(input: DiscardInput) {
        val state = mutableState.value
        val draft = state.discardDraft ?: return
        if (draft.syncState in setOf(SyncState.SINCRONIZANDO, SyncState.ENVIADA)) return
        draft.takeIf { it.syncState == SyncState.ERROR }?.frozenPayload?.let {
            cancelDiscardSchedule(draft.draftId, it.idempotencyKey)
        }
        val validation = DiscardFormValidator.validate(input)
        mutableState.value = state.copy(
            discardInput = input,
            discardErrors = DiscardFieldErrors(),
            discardUniqueTotal = validation.uniqueTotal,
            discardCausesTotal = validation.causesTotal,
            showDiscardSummary = false,
            message = null,
        )
        discardSaveJob?.cancel()
        discardSaveJob = viewModelScope.launch {
            repository.saveDiscardInput(draft.draftId, draft.userId, draft.deviceId, input)
        }
    }

    fun requestDiscardConfirmation() {
        if (blockMutableOperation()) return
        val state = mutableState.value
        val validation = DiscardFormValidator.validate(state.discardInput)
        val values = validation.values
        val inventoryExceeded = values.size >= 3 && values.take(3).all { it != null } && state.discardDraft?.let { draft ->
            requireNotNull(values[0]) > draft.line.inventory.females ||
                requireNotNull(values[1]) > draft.line.inventory.males ||
                requireNotNull(values[2]) > draft.line.inventory.rootstocks
        } == true
        val errors = if (inventoryExceeded) {
            validation.errors.copy(general = "Las cantidades superan el inventario guardado de la línea.")
        } else {
            validation.errors
        }
        if (!validation.valid || inventoryExceeded) {
            mutableState.value = state.copy(
                discardErrors = errors,
                discardUniqueTotal = validation.uniqueTotal,
                discardCausesTotal = validation.causesTotal,
                message = "Corrige los campos marcados.",
            )
            return
        }
        mutableState.value = state.copy(
            discardErrors = DiscardFieldErrors(),
            discardUniqueTotal = validation.uniqueTotal,
            discardCausesTotal = validation.causesTotal,
            showDiscardSummary = true,
            message = null,
        )
    }

    fun cancelDiscardConfirmation() {
        if (!mutableState.value.confirmingDiscard) {
            mutableState.value = mutableState.value.copy(showDiscardSummary = false)
        }
    }

    fun confirmDiscardSubmission() {
        if (blockMutableOperation()) return
        val state = mutableState.value
        val draft = state.discardDraft ?: return
        if (state.confirmingDiscard) return
        val pendingSave = discardSaveJob
        mutableState.value = state.copy(confirmingDiscard = true, message = null)
        viewModelScope.launch {
            try {
                pendingSave?.cancelAndJoin()
                repository.saveDiscardInput(draft.draftId, draft.userId, draft.deviceId, state.discardInput)
                val frozen = repository.freezeDiscardAttempt(
                    draft.draftId,
                    draft.userId,
                    draft.deviceId,
                    keyFactory(),
                    timestampFactory(),
                ).frozenPayload ?: throw CampoRepositoryException("INVALID_ARGUMENT", "No se pudo congelar el descarte.")
                scheduleDiscardOnce(draft.draftId, frozen.idempotencyKey)
                mutableState.value = mutableState.value.copy(
                    confirmingDiscard = false,
                    showDiscardSummary = false,
                    message = "Descarte guardado. Se enviará automáticamente al recuperar conexión.",
                )
            } catch (error: CampoRepositoryException) {
                mutableState.value = mutableState.value.copy(
                    confirmingDiscard = false,
                    showDiscardSummary = false,
                    message = error.message,
                )
            }
        }
    }

    fun retryDiscardSubmission() {
        val draft = mutableState.value.discardDraft ?: return
        val frozen = draft.frozenPayload ?: return
        scheduleDiscardOnce(draft.draftId, frozen.idempotencyKey)
    }

    fun abandonDiscardDraft() {
        val draft = mutableState.value.discardDraft ?: return
        if (draft.syncState in setOf(SyncState.SINCRONIZANDO, SyncState.ENVIADA)) return
        draft.frozenPayload?.let { cancelDiscardSchedule(draft.draftId, it.idempotencyKey) }
        viewModelScope.launch {
            try {
                repository.abandonDiscardDraft(draft.draftId, draft.userId, draft.deviceId)
                discardDraftJob?.cancel()
                discardSaveJob?.cancel()
                mutableState.value = mutableState.value.copy(
                    selectedDiscardLine = null,
                    discardDraft = null,
                    discardInput = DiscardInput(),
                    discardErrors = DiscardFieldErrors(),
                    discardUniqueTotal = null,
                    discardCausesTotal = null,
                    showDiscardSummary = false,
                    message = "Borrador local eliminado. Actualiza el catálogo y elige la línea nuevamente.",
                )
                refreshDiscardLines()
            } catch (error: CampoRepositoryException) {
                mutableState.value = mutableState.value.copy(message = error.message)
            }
        }
    }

    fun finishDiscard() {
        val state = mutableState.value
        if (state.discardDraft?.syncState != SyncState.ENVIADA) return
        discardDraftJob?.cancel()
        discardSaveJob?.cancel()
        mutableState.value = state.copy(
            selectedDiscardLine = null,
            discardDraft = null,
            discardInput = DiscardInput(),
            discardErrors = DiscardFieldErrors(),
            discardUniqueTotal = null,
            discardCausesTotal = null,
            showDiscardSummary = false,
            message = "Descarte enviado y pendiente de revisión administrativa.",
        )
        refreshDiscardLines()
    }

    private fun observeDiscardDraft(user: UserProfile, initial: LocalDiscardDraft) {
        discardDraftJob?.cancel()
        discardDraftJob = viewModelScope.launch {
            repository.observeDiscardDraft(initial.draftId, user.id, deviceId).collect { draft ->
                if (draft == null) return@collect
                if (draft.syncState == SyncState.PENDIENTE && draft.frozenPayload != null) {
                    scheduleDiscardOnce(draft.draftId, draft.frozenPayload.idempotencyKey)
                } else if (draft.syncState == SyncState.ERROR && draft.frozenPayload != null) {
                    scheduledDiscardWork.remove(draft.draftId to draft.frozenPayload.idempotencyKey)
                }
                val validation = DiscardFormValidator.validate(draft.input)
                mutableState.value = mutableState.value.copy(
                    selectedDiscardLine = draft.line,
                    discardDraft = draft,
                    discardInput = draft.input,
                    discardUniqueTotal = validation.uniqueTotal,
                    discardCausesTotal = validation.causesTotal,
                    message = draft.errorMessage ?: mutableState.value.message,
                )
            }
        }
    }

    private fun scheduleCountOnce(reservationId: String, idempotencyKey: String) {
        if (scheduledCountWork.add(reservationId to idempotencyKey)) {
            syncScheduler.schedule(reservationId, idempotencyKey)
        }
    }

    private fun cancelCountSchedule(reservationId: String, idempotencyKey: String) {
        scheduledCountWork.remove(reservationId to idempotencyKey)
        syncScheduler.cancel(reservationId, idempotencyKey)
    }

    private fun scheduleDiscardOnce(draftId: String, idempotencyKey: String) {
        if (scheduledDiscardWork.add(draftId to idempotencyKey)) {
            discardSyncScheduler.schedule(draftId, idempotencyKey)
        }
    }

    private fun cancelDiscardSchedule(draftId: String, idempotencyKey: String) {
        scheduledDiscardWork.remove(draftId to idempotencyKey)
        discardSyncScheduler.cancel(draftId, idempotencyKey)
    }

    fun selectLine(line: JourneyLine) {
        if (blockMutableOperation()) return
        if (line.state == "DISPONIBLE" && !mutableState.value.reserving) {
            mutableState.value = mutableState.value.copy(selectedLine = line, message = null)
        }
    }

    fun selectJourney(journeyId: String) {
        val state = mutableState.value
        val user = state.user ?: return
        if (hasWorkThatBlocksJourneyChange(state)) {
            mutableState.value = state.copy(message = "Termina o resuelve el trabajo pendiente antes de cambiar de jornada.")
            return
        }
        val journey = state.activeJourneys.find { it.id == journeyId } ?: return
        journeyJob?.cancel()
        returnedCountsJob?.cancel()
        mutableState.value = state.copy(
            selectedJourneyId = journey.id,
            inventoryReportConfiguration = journey.inventoryReportConfiguration,
            journey = null,
            returnedCounts = emptyList(),
            selectedLine = null,
            connectionStatus = "CONECTANDO",
            message = null,
        )
        observeJourney(journey.id)
        observeReturnedCounts(user, journey.id)
    }

    fun returnToJourneySelection() {
        val state = mutableState.value
        if (hasWorkThatBlocksJourneyChange(state)) {
            mutableState.value = state.copy(message = "Termina o resuelve el trabajo pendiente antes de cambiar de jornada.")
            return
        }
        journeyJob?.cancel()
        returnedCountsJob?.cancel()
        mutableState.value = state.copy(
            selectedJourneyId = null,
            inventoryReportConfiguration = null,
            journey = null,
            returnedCounts = emptyList(),
            selectedLine = null,
            connectionStatus = "CONECTADO",
            message = null,
        )
    }

    fun cancelSelection() {
        if (!mutableState.value.reserving) mutableState.value = mutableState.value.copy(selectedLine = null)
    }

    fun confirmReservation() {
        if (blockMutableOperation()) return
        val state = mutableState.value
        val line = state.selectedLine ?: return
        val user = state.user ?: return
        if (state.reserving) return
        val key = pendingReservationKeys.getOrPut(line.id, keyFactory)
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(reserving = true, message = null)
            try {
                val confirmation = repository.reserveLine(
                    ReserveLinePayload(line.id, deviceId, key),
                    user.id,
                    state.inventoryReportConfiguration,
                )
                pendingReservationKeys.remove(line.id)
                mutableState.value = mutableState.value.copy(
                    reserving = false,
                    selectedLine = null,
                    confirmedReservation = confirmation,
                    message = "Reserva confirmada por el servidor.",
                )
                observeReservationState(confirmation)
                observeDraft(user, confirmation)
            } catch (error: CampoRepositoryException) {
                val conflict = error.code == "LINE_NOT_AVAILABLE"
                if (conflict) pendingReservationKeys.remove(line.id)
                mutableState.value = mutableState.value.copy(
                    reserving = false,
                    selectedLine = if (conflict) null else line,
                    message = if (conflict) "Esta línea acaba de ser tomada por otro usuario" else error.message,
                )
            }
        }
    }

    fun correctCount(returnedCount: ReturnedCount) {
        if (blockMutableOperation()) return
        val state = mutableState.value
        val user = state.user ?: return
        if (!returnedCount.canCorrect || state.correctingCountId != null || state.confirmedReservation != null) return
        val key = pendingCorrectionKeys.getOrPut(returnedCount.countId, keyFactory)
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(correctingCountId = returnedCount.countId, message = null)
            try {
                val reservation = repository.initiateCountCorrection(
                    InitiateCountCorrectionPayload(returnedCount.countId, deviceId, key),
                    user.id,
                    returnedCount.input,
                    state.inventoryReportConfiguration,
                )
                pendingCorrectionKeys.remove(returnedCount.countId)
                mutableState.value = mutableState.value.copy(
                    correctingCountId = null,
                    confirmedReservation = reservation,
                    countInput = returnedCount.input,
                    message = "Corrección iniciada. Revisa los valores de la versión anterior.",
                )
                observeReservationState(reservation)
                observeDraft(user, reservation)
            } catch (error: CampoRepositoryException) {
                if (error.code != "NETWORK_ERROR" && error.code != "INTERNAL_ERROR") {
                    pendingCorrectionKeys.remove(returnedCount.countId)
                }
                mutableState.value = mutableState.value.copy(
                    correctingCountId = null,
                    message = error.message,
                )
            }
        }
    }

    fun updateFemales(value: String) = updateCountInput(mutableState.value.countInput.copy(females = value))
    fun updateMales(value: String) = updateCountInput(mutableState.value.countInput.copy(males = value))
    fun updateRootstocks(value: String) = updateCountInput(mutableState.value.countInput.copy(rootstocks = value))
    fun updateDeadPlants(value: String) = updateCountInput(mutableState.value.countInput.copy(deadPlants = value))
    fun updateObservations(value: String) = updateCountInput(mutableState.value.countInput.copy(observations = value))

    private fun updateCountInput(input: CountInput) {
        val state = mutableState.value
        val reservation = state.confirmedReservation ?: return
        val user = state.user ?: return
        if (reservation.state == "LIBERADA") return
        if (state.countDraft?.syncState in setOf(SyncState.SINCRONIZANDO, SyncState.ENVIADA)) return
        state.countDraft?.takeIf { it.syncState == SyncState.ERROR }?.frozenPayload?.let {
            cancelCountSchedule(reservation.reservationId, it.idempotencyKey)
        }
        val validation = CountFormValidator.validate(input, state.requiresPhysicalDeadPlants)
        mutableState.value = state.copy(
            countInput = input,
            countErrors = CountFieldErrors(),
            countTotal = validation.total,
            zeroWarning = validation.zeroWarning,
            showCountSummary = false,
            message = null,
        )
        countSaveJob?.cancel()
        countSaveJob = viewModelScope.launch {
            repository.saveCountInput(reservation.reservationId, user.id, deviceId, input)
        }
    }

    fun requestCountConfirmation() {
        if (blockMutableOperation()) return
        if (mutableState.value.confirmedReservation?.state == "LIBERADA") return
        val validation = CountFormValidator.validate(
            mutableState.value.countInput,
            mutableState.value.requiresPhysicalDeadPlants,
        )
        if (!validation.valid) {
            mutableState.value = mutableState.value.copy(
                countErrors = validation.errors,
                countTotal = validation.total,
                zeroWarning = validation.zeroWarning,
                message = "Corrige los campos marcados.",
            )
            return
        }
        mutableState.value = mutableState.value.copy(
            countErrors = CountFieldErrors(),
            countTotal = validation.total,
            zeroWarning = validation.zeroWarning,
            showCountSummary = true,
            message = null,
        )
    }

    fun cancelCountConfirmation() {
        if (!mutableState.value.confirmingCount) {
            mutableState.value = mutableState.value.copy(showCountSummary = false)
        }
    }

    fun confirmCountSubmission() {
        if (blockMutableOperation()) return
        val state = mutableState.value
        val reservation = state.confirmedReservation ?: return
        val user = state.user ?: return
        if (reservation.state == "LIBERADA") return
        if (state.confirmingCount) return
        val pendingSave = countSaveJob
        mutableState.value = state.copy(confirmingCount = true, message = null)
        viewModelScope.launch {
            try {
                pendingSave?.cancelAndJoin()
                repository.saveCountInput(reservation.reservationId, user.id, deviceId, state.countInput)
                val draft = repository.freezeCountAttempt(
                    reservation.reservationId,
                    user.id,
                    deviceId,
                    keyFactory(),
                    timestampFactory(),
                    state.requiresPhysicalDeadPlants,
                )
                val frozen = requireNotNull(draft.frozenPayload)
                scheduleCountOnce(reservation.reservationId, frozen.idempotencyKey)
                mutableState.value = mutableState.value.copy(
                    confirmingCount = false,
                    showCountSummary = false,
                    message = "Envío confirmado. Se sincronizará con conexión disponible.",
                )
            } catch (error: CampoRepositoryException) {
                mutableState.value = mutableState.value.copy(
                    confirmingCount = false,
                    showCountSummary = false,
                    message = error.message,
                )
            }
        }
    }

    fun retryCountSubmission() {
        if (blockMutableOperation()) return
        if (mutableState.value.confirmedReservation?.state == "LIBERADA") return
        val frozen = mutableState.value.countDraft?.frozenPayload ?: return
        scheduleCountOnce(frozen.reservationId, frozen.idempotencyKey)
    }

    fun finishAndTakeAnotherLine() {
        val state = mutableState.value
        if (state.countDraft?.syncState != SyncState.ENVIADA) return
        draftJob?.cancel()
        countSaveJob?.cancel()
        mutableState.value = state.copy(
            selectedLine = null,
            confirmedReservation = null,
            countInput = CountInput(),
            countErrors = CountFieldErrors(),
            countTotal = null,
            zeroWarning = false,
            countDraft = null,
            showCountSummary = false,
            confirmingCount = false,
            message = if (state.confirmedReservation?.reservationType == "CORRECCION") {
                "Nueva versión enviada y pendiente de revisión. El historial anterior permanece intacto."
            } else {
                "Conteo enviado y conservado en el historial local. Ya puedes tomar otra línea."
            },
        )
    }

    private fun observeDraft(user: UserProfile, reservation: ConfirmedReservation) {
        draftJob?.cancel()
        draftJob = viewModelScope.launch {
            repository.observeCountDraft(reservation.reservationId, user.id, deviceId).collect { draft ->
                if (draft == null) {
                    repository.saveCountInput(reservation.reservationId, user.id, deviceId, CountInput())
                } else {
                    if (
                        draft.syncState == SyncState.PENDIENTE &&
                        draft.frozenPayload != null &&
                        mutableState.value.confirmedReservation?.state != "LIBERADA"
                    ) {
                        scheduleCountOnce(reservation.reservationId, draft.frozenPayload.idempotencyKey)
                    } else if (draft.syncState == SyncState.ERROR && draft.frozenPayload != null) {
                        scheduledCountWork.remove(reservation.reservationId to draft.frozenPayload.idempotencyKey)
                    }
                    val validation = CountFormValidator.validate(
                        draft.input,
                        mutableState.value.requiresPhysicalDeadPlants,
                    )
                    mutableState.value = mutableState.value.copy(
                        countDraft = draft,
                        countInput = draft.input,
                        countTotal = validation.total,
                        zeroWarning = validation.zeroWarning,
                        message = draft.errorMessage ?: mutableState.value.message,
                    )
                }
            }
        }
    }

    private fun observeReservationState(reservation: ConfirmedReservation) {
        reservationStateJob?.cancel()
        reservationStateJob = viewModelScope.launch {
            repository.observeReservationState(reservation.reservationId)
                .catch { error ->
                    mutableState.value = mutableState.value.copy(
                        message = error.message ?: "No fue posible comprobar el estado de la reserva.",
                    )
                }
                .collect { centralState ->
                    if (
                        centralState != "LIBERADA" ||
                        mutableState.value.confirmedReservation?.state == "LIBERADA"
                    ) return@collect
                    mutableState.value.countDraft?.frozenPayload?.let { frozen ->
                        cancelCountSchedule(reservation.reservationId, frozen.idempotencyKey)
                    }
                    repository.markReservationReleased(reservation.reservationId)
                    mutableState.value = mutableState.value.copy(
                        confirmedReservation = mutableState.value.confirmedReservation?.copy(state = "LIBERADA"),
                        showCountSummary = false,
                        confirmingCount = false,
                        message = RELEASED_RESERVATION_MESSAGE,
                    )
                }
        }
    }

    private fun observeJourney(journeyId: String) {
        journeyJob?.cancel()
        journeyJob = viewModelScope.launch {
            repository.observeJourney(journeyId)
                .onStart { mutableState.value = mutableState.value.copy(connectionStatus = "CONECTANDO") }
                .catch { error -> handleJourneyObservationFailure(journeyId, error) }
                .collect { journey ->
                    mutableState.value = mutableState.value.copy(journey = journey, connectionStatus = "CONECTADO")
                }
        }
    }

    private fun observeReturnedCounts(user: UserProfile, journeyId: String) {
        returnedCountsJob?.cancel()
        returnedCountsJob = viewModelScope.launch {
            repository.observeReturnedCounts(user.id, journeyId)
                .catch { error ->
                    mutableState.value = mutableState.value.copy(
                        message = error.message ?: "No fue posible leer los conteos devueltos.",
                    )
                }
                .collect { returnedCounts ->
                    mutableState.value = mutableState.value.copy(returnedCounts = returnedCounts)
                }
        }
    }

    private fun hasWorkThatBlocksJourneyChange(state: CampoUiState): Boolean =
        state.confirmedReservation != null ||
            state.reserving ||
            state.correctingCountId != null ||
            state.selectedLine != null ||
            state.countDraft?.syncState in setOf(SyncState.PENDIENTE, SyncState.SINCRONIZANDO, SyncState.ERROR)

    private fun blockMutableOperation(): Boolean {
        if (repository.mutableOperationsEnabled) return false
        mutableState.value = mutableState.value.copy(
            message = "Las operaciones no están disponibles con la configuración actual.",
        )
        return true
    }

    private suspend fun handleJourneyObservationFailure(journeyId: String, error: Throwable) {
        val refreshedJourneys = runCatching { repository.listActiveJourneys() }.getOrNull()
        if (refreshedJourneys == null || refreshedJourneys.any { it.id == journeyId }) {
            mutableState.value = mutableState.value.copy(
                connectionStatus = "ERROR",
                message = error.message ?: "Se perdió la conexión con Firebase.",
            )
            return
        }
        val current = mutableState.value
        if (hasLocalWorkToPreserveAfterClosure(current)) {
            mutableState.value = current.copy(
                activeJourneys = refreshedJourneys,
                connectionStatus = "ERROR",
                message = "La jornada se está cerrando o ya fue cerrada. El trabajo local se conservó; consulta con supervisión.",
            )
            return
        }
        returnedCountsJob?.cancel()
        mutableState.value = current.copy(
            activeJourneys = refreshedJourneys,
            selectedJourneyId = null,
            inventoryReportConfiguration = null,
            journey = null,
            returnedCounts = emptyList(),
            selectedLine = null,
            connectionStatus = "CONECTADO",
            message = "La jornada se está cerrando o ya fue cerrada y no está disponible. El historial local se conservó.",
        )
    }

    private fun hasLocalWorkToPreserveAfterClosure(state: CampoUiState): Boolean =
        state.confirmedReservation != null ||
            state.reserving ||
            state.correctingCountId != null ||
            state.countDraft?.syncState in setOf(SyncState.PENDIENTE, SyncState.SINCRONIZANDO, SyncState.ERROR)

    private object NoOpCountSyncScheduler : CountSyncScheduler {
        override fun schedule(reservationId: String, idempotencyKey: String) = Unit
        override fun cancel(reservationId: String, idempotencyKey: String) = Unit
    }

    private object NoOpDiscardSyncScheduler : DiscardSyncScheduler {
        override fun schedule(draftId: String, idempotencyKey: String) = Unit
        override fun cancel(draftId: String, idempotencyKey: String) = Unit
    }
}

class CampoViewModelFactory(
    private val repository: CampoRepository,
    private val deviceId: String,
    private val syncScheduler: CountSyncScheduler,
    private val discardSyncScheduler: DiscardSyncScheduler,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(CampoViewModel::class.java))
        return CampoViewModel(repository, deviceId, syncScheduler, discardSyncScheduler) as T
    }
}
