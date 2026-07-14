package com.arles.viverocampo.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.arles.viverocampo.data.sync.CountSyncScheduler
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.CountFieldErrors
import com.arles.viverocampo.domain.CountFormValidator
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.SyncState
import com.arles.viverocampo.domain.UserProfile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.launch

data class CampoUiState(
    val emulatorEnabled: Boolean,
    val email: String = "",
    val password: String = "",
    val signingIn: Boolean = false,
    val user: UserProfile? = null,
    val journey: JourneySnapshot? = null,
    val connectionStatus: String = "DESCONECTADO",
    val selectedLine: JourneyLine? = null,
    val reserving: Boolean = false,
    val confirmedReservation: ConfirmedReservation? = null,
    val countInput: CountInput = CountInput(),
    val countErrors: CountFieldErrors = CountFieldErrors(),
    val countTotal: Long? = null,
    val zeroWarning: Boolean = false,
    val countDraft: LocalCountDraft? = null,
    val showCountSummary: Boolean = false,
    val confirmingCount: Boolean = false,
    val message: String? = null,
)

class CampoViewModel(
    private val repository: CampoRepository,
    private val deviceId: String,
    private val syncScheduler: CountSyncScheduler = NoOpCountSyncScheduler,
    private val keyFactory: () -> String = { UUID.randomUUID().toString() },
    private val timestampFactory: () -> String = {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
    },
) : ViewModel() {
    private val mutableState = MutableStateFlow(CampoUiState(emulatorEnabled = repository.emulatorEnabled))
    val uiState: StateFlow<CampoUiState> = mutableState.asStateFlow()
    private val pendingReservationKeys = mutableMapOf<String, String>()
    private var journeyJob: Job? = null
    private var draftJob: Job? = null
    private var countSaveJob: Job? = null

    fun updateEmail(value: String) {
        mutableState.value = mutableState.value.copy(email = value, message = null)
    }

    fun updatePassword(value: String) {
        mutableState.value = mutableState.value.copy(password = value, message = null)
    }

    fun signIn() {
        val state = mutableState.value
        if (state.signingIn || state.email.isBlank() || state.password.isBlank()) {
            if (state.email.isBlank() || state.password.isBlank()) {
                mutableState.value = state.copy(message = "Ingresa correo y contraseña de prueba.")
            }
            return
        }
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(signingIn = true, message = null)
            try {
                val user = repository.signIn(state.email, state.password)
                val reservation = repository.latestConfirmedReservation(user.id)
                mutableState.value = mutableState.value.copy(
                    signingIn = false,
                    password = "",
                    user = user,
                    confirmedReservation = reservation,
                    connectionStatus = "CONECTANDO",
                )
                observeJourney()
                if (reservation != null && reservation.deviceId == deviceId) observeDraft(user, reservation)
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
            repository.signOut()
            journeyJob?.cancel()
            draftJob?.cancel()
            countSaveJob?.cancel()
            pendingReservationKeys.clear()
            mutableState.value = CampoUiState(emulatorEnabled = repository.emulatorEnabled)
        }
    }

    fun selectLine(line: JourneyLine) {
        if (line.state == "DISPONIBLE" && !mutableState.value.reserving) {
            mutableState.value = mutableState.value.copy(selectedLine = line, message = null)
        }
    }

    fun cancelSelection() {
        if (!mutableState.value.reserving) mutableState.value = mutableState.value.copy(selectedLine = null)
    }

    fun confirmReservation() {
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
                )
                pendingReservationKeys.remove(line.id)
                mutableState.value = mutableState.value.copy(
                    reserving = false,
                    selectedLine = null,
                    confirmedReservation = confirmation,
                    message = "Reserva confirmada por el servidor.",
                )
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

    fun updateFemales(value: String) = updateCountInput(mutableState.value.countInput.copy(females = value))
    fun updateMales(value: String) = updateCountInput(mutableState.value.countInput.copy(males = value))
    fun updateRootstocks(value: String) = updateCountInput(mutableState.value.countInput.copy(rootstocks = value))
    fun updateObservations(value: String) = updateCountInput(mutableState.value.countInput.copy(observations = value))

    private fun updateCountInput(input: CountInput) {
        val state = mutableState.value
        val reservation = state.confirmedReservation ?: return
        val user = state.user ?: return
        if (state.countDraft?.syncState in setOf(SyncState.SINCRONIZANDO, SyncState.ENVIADA)) return
        state.countDraft?.takeIf { it.syncState == SyncState.ERROR }?.frozenPayload?.let {
            syncScheduler.cancel(reservation.reservationId, it.idempotencyKey)
        }
        val validation = CountFormValidator.validate(input)
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
        val validation = CountFormValidator.validate(mutableState.value.countInput)
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
        val state = mutableState.value
        val reservation = state.confirmedReservation ?: return
        val user = state.user ?: return
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
                )
                val frozen = requireNotNull(draft.frozenPayload)
                syncScheduler.schedule(reservation.reservationId, frozen.idempotencyKey)
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
        val frozen = mutableState.value.countDraft?.frozenPayload ?: return
        syncScheduler.schedule(frozen.reservationId, frozen.idempotencyKey)
    }

    private fun observeDraft(user: UserProfile, reservation: ConfirmedReservation) {
        draftJob?.cancel()
        draftJob = viewModelScope.launch {
            repository.observeCountDraft(reservation.reservationId, user.id, deviceId).collect { draft ->
                if (draft == null) {
                    repository.saveCountInput(reservation.reservationId, user.id, deviceId, CountInput())
                } else {
                    if (draft.syncState == SyncState.PENDIENTE && draft.frozenPayload != null) {
                        syncScheduler.schedule(reservation.reservationId, draft.frozenPayload.idempotencyKey)
                    }
                    val validation = CountFormValidator.validate(draft.input)
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

    private fun observeJourney() {
        journeyJob?.cancel()
        journeyJob = viewModelScope.launch {
            repository.observeActiveJourney()
                .onStart { mutableState.value = mutableState.value.copy(connectionStatus = "CONECTANDO") }
                .catch { error ->
                    mutableState.value = mutableState.value.copy(
                        connectionStatus = "ERROR",
                        message = error.message ?: "Se perdió la conexión con los emuladores.",
                    )
                }
                .collect { journey ->
                    mutableState.value = mutableState.value.copy(journey = journey, connectionStatus = "CONECTADO")
                }
        }
    }

    private object NoOpCountSyncScheduler : CountSyncScheduler {
        override fun schedule(reservationId: String, idempotencyKey: String) = Unit
        override fun cancel(reservationId: String, idempotencyKey: String) = Unit
    }
}

class CampoViewModelFactory(
    private val repository: CampoRepository,
    private val deviceId: String,
    private val syncScheduler: CountSyncScheduler,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(CampoViewModel::class.java))
        return CampoViewModel(repository, deviceId, syncScheduler) as T
    }
}
