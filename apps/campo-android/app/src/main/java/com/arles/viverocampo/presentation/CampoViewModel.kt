package com.arles.viverocampo.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.UserProfile
import java.util.UUID
import kotlinx.coroutines.Job
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
    val message: String? = null,
)

class CampoViewModel(
    private val repository: CampoRepository,
    private val deviceId: String,
    private val keyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val mutableState = MutableStateFlow(CampoUiState(emulatorEnabled = repository.emulatorEnabled))
    val uiState: StateFlow<CampoUiState> = mutableState.asStateFlow()
    private val pendingKeys = mutableMapOf<String, String>()
    private var journeyJob: Job? = null

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
                mutableState.value = mutableState.value.copy(
                    signingIn = false,
                    password = "",
                    user = user,
                    connectionStatus = "CONECTANDO",
                )
                mutableState.value = mutableState.value.copy(
                    confirmedReservation = repository.latestConfirmedReservation(user.id),
                )
                observeJourney()
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
            pendingKeys.clear()
            mutableState.value = CampoUiState(emulatorEnabled = repository.emulatorEnabled)
        }
    }

    fun selectLine(line: JourneyLine) {
        if (line.state == "DISPONIBLE" && !mutableState.value.reserving) {
            mutableState.value = mutableState.value.copy(selectedLine = line, message = null)
        }
    }

    fun cancelSelection() {
        if (!mutableState.value.reserving) {
            mutableState.value = mutableState.value.copy(selectedLine = null)
        }
    }

    fun confirmReservation() {
        val state = mutableState.value
        val line = state.selectedLine ?: return
        val user = state.user ?: return
        if (state.reserving) return
        val key = pendingKeys.getOrPut(line.id, keyFactory)
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(reserving = true, message = null)
            try {
                val confirmation = repository.reserveLine(
                    ReserveLinePayload(
                        jornadaLineaId = line.id,
                        dispositivoId = deviceId,
                        claveIdempotencia = key,
                    ),
                    user.id,
                )
                pendingKeys.remove(line.id)
                mutableState.value = mutableState.value.copy(
                    reserving = false,
                    selectedLine = null,
                    confirmedReservation = confirmation,
                    message = "Reserva confirmada por el servidor.",
                )
            } catch (error: CampoRepositoryException) {
                val conflict = error.code == "LINE_NOT_AVAILABLE"
                if (conflict) pendingKeys.remove(line.id)
                mutableState.value = mutableState.value.copy(
                    reserving = false,
                    selectedLine = if (conflict) null else line,
                    message = if (conflict) {
                        "Esta línea acaba de ser tomada por otro usuario"
                    } else {
                        error.message ?: "No se confirmó la reserva. Reintenta."
                    },
                )
            }
        }
    }

    private fun observeJourney() {
        journeyJob?.cancel()
        journeyJob = viewModelScope.launch {
            repository.observeActiveJourney()
                .onStart {
                    mutableState.value = mutableState.value.copy(connectionStatus = "CONECTANDO")
                }
                .catch { error ->
                    mutableState.value = mutableState.value.copy(
                        connectionStatus = "ERROR",
                        message = error.message ?: "Se perdió la conexión con los emuladores.",
                    )
                }
                .collect { journey ->
                    mutableState.value = mutableState.value.copy(
                        journey = journey,
                        connectionStatus = "CONECTADO",
                    )
                }
        }
    }
}

class CampoViewModelFactory(
    private val repository: CampoRepository,
    private val deviceId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(CampoViewModel::class.java))
        return CampoViewModel(repository, deviceId) as T
    }
}
