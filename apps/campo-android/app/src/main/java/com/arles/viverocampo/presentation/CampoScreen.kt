package com.arles.viverocampo.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.ActiveJourney
import com.arles.viverocampo.domain.CampoEnvironment
import com.arles.viverocampo.domain.ReturnedCount
import com.arles.viverocampo.domain.SyncState

private val ViveroGreen = Color(0xFF1B5E20)
private val ViveroBackground = Color(0xFFF1F8F2)
private val TestBanner = Color(0xFFFFE082)

@Composable
fun ViveroCampoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MaterialTheme.colorScheme.copy(
            primary = ViveroGreen,
            background = ViveroBackground,
            surface = Color.White,
        ),
        content = content,
    )
}

@Composable
fun CampoRoute(viewModel: CampoViewModel) {
    val state = viewModel.uiState.collectAsStateWithLifecycle().value
    CampoScreen(
        state = state,
        onEmailChange = viewModel::updateEmail,
        onPasswordChange = viewModel::updatePassword,
        onSignIn = viewModel::signIn,
        onSignOut = viewModel::signOut,
        onSelectJourney = viewModel::selectJourney,
        onReturnToJourneySelection = viewModel::returnToJourneySelection,
        onSelectLine = viewModel::selectLine,
        onCancelSelection = viewModel::cancelSelection,
        onConfirmReservation = viewModel::confirmReservation,
        onCorrectCount = viewModel::correctCount,
        onFemalesChange = viewModel::updateFemales,
        onMalesChange = viewModel::updateMales,
        onRootstocksChange = viewModel::updateRootstocks,
        onObservationsChange = viewModel::updateObservations,
        onRequestCountConfirmation = viewModel::requestCountConfirmation,
        onCancelCountConfirmation = viewModel::cancelCountConfirmation,
        onConfirmCountSubmission = viewModel::confirmCountSubmission,
        onRetry = viewModel::retryCountSubmission,
        onFinishAndTakeAnotherLine = viewModel::finishAndTakeAnotherLine,
    )
}

@Composable
private fun CampoScreen(
    state: CampoUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    onSelectJourney: (String) -> Unit,
    onReturnToJourneySelection: () -> Unit,
    onSelectLine: (JourneyLine) -> Unit,
    onCancelSelection: () -> Unit,
    onConfirmReservation: () -> Unit,
    onCorrectCount: (ReturnedCount) -> Unit,
    onFemalesChange: (String) -> Unit,
    onMalesChange: (String) -> Unit,
    onRootstocksChange: (String) -> Unit,
    onObservationsChange: (String) -> Unit,
    onRequestCountConfirmation: () -> Unit,
    onCancelCountConfirmation: () -> Unit,
    onConfirmCountSubmission: () -> Unit,
    onRetry: () -> Unit,
    onFinishAndTakeAnotherLine: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = ViveroBackground) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                text = when (state.environment) {
                    CampoEnvironment.EMULATOR -> "MODO DE PRUEBA — EMULADOR"
                    CampoEnvironment.PRODUCTION -> "PRODUCCIÓN"
                    CampoEnvironment.DISABLED -> "CONFIGURACIÓN DE FIREBASE NO VÁLIDA"
                },
                modifier = Modifier.fillMaxWidth().background(TestBanner).padding(12.dp),
                color = Color.Black,
                fontWeight = FontWeight.Bold,
            )
            when {
                state.user == null -> LoginContent(state, onEmailChange, onPasswordChange, onSignIn)
                state.confirmedReservation != null -> CountContent(
                    state,
                    onSignOut,
                    onFemalesChange,
                    onMalesChange,
                    onRootstocksChange,
                    onObservationsChange,
                    onRequestCountConfirmation,
                    onRetry,
                    onFinishAndTakeAnotherLine,
                )
                state.journey == null -> JourneySelectionContent(state, onSignOut, onSelectJourney)
                else -> JourneyContent(state, onSignOut, onReturnToJourneySelection, onSelectLine, onCorrectCount)
            }
        }
    }

    state.selectedLine?.takeIf { state.mutableOperationsEnabled }?.let { line ->
        AlertDialog(
            onDismissRequest = onCancelSelection,
            title = { Text("Confirmar línea") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Vivero: ${line.location.nursery}")
                    Text("Módulo: ${line.location.module}")
                    Text("Cama: ${line.location.bed}")
                    Text("Línea: ${line.location.line}")
                    Text("¿Deseas tomar esta línea para conteo?")
                }
            },
            confirmButton = {
                Button(onClick = onConfirmReservation, enabled = !state.reserving) {
                    Text(if (state.reserving) "Reservando…" else "Sí, reservar")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = onCancelSelection, enabled = !state.reserving) { Text("Cancelar") }
            },
        )
    }

    if (state.showCountSummary && state.mutableOperationsEnabled) {
        val reservation = requireNotNull(state.confirmedReservation)
        AlertDialog(
            onDismissRequest = onCancelCountConfirmation,
            title = { Text("Confirmar conteo") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${reservation.location.nursery} · ${reservation.location.module}")
                    Text("${reservation.location.bed} · ${reservation.location.line}", fontWeight = FontWeight.Bold)
                    Text("Hembras: ${state.countInput.females}")
                    Text("Machos: ${state.countInput.males}")
                    Text("Patrones: ${state.countInput.rootstocks}")
                    Text("Total: ${state.countTotal ?: 0}", fontWeight = FontWeight.Bold)
                    Text("Observaciones: ${state.countInput.observations.ifBlank { "Sin observaciones" }}")
                    Text("Responsable: ${state.user?.name.orEmpty()}")
                    Text("Al confirmar, este intento queda congelado para sus reintentos.")
                }
            },
            confirmButton = {
                Button(onClick = onConfirmCountSubmission, enabled = !state.confirmingCount) {
                    Text(if (state.confirmingCount) "Confirmando…" else "Confirmar y enviar")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = onCancelCountConfirmation, enabled = !state.confirmingCount) {
                    Text("Volver")
                }
            },
        )
    }
}

@Composable
private fun LoginContent(
    state: CampoUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSignIn: () -> Unit,
) {
    Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Vivero Campo", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(
            if (state.environment == CampoEnvironment.PRODUCTION) {
                "Inicio de sesión para cuentas autorizadas de Vivero Campo."
            } else {
                "Inicio de sesión con cuentas cargadas en Auth Emulator."
            },
        )
        OutlinedTextField(
            value = state.email,
            onValueChange = onEmailChange,
            label = { Text(if (state.environment == CampoEnvironment.PRODUCTION) "Correo" else "Correo de prueba") },
            singleLine = true,
            enabled = state.accessEnabled && !state.signingIn,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = onPasswordChange,
            label = { Text(if (state.environment == CampoEnvironment.PRODUCTION) "Contraseña" else "Contraseña de prueba") },
            singleLine = true,
            enabled = state.accessEnabled && !state.signingIn,
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        Button(onClick = onSignIn, enabled = state.accessEnabled && !state.signingIn, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.signingIn) "Ingresando…" else "Iniciar sesión")
        }
        state.message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun CountContent(
    state: CampoUiState,
    onSignOut: () -> Unit,
    onFemalesChange: (String) -> Unit,
    onMalesChange: (String) -> Unit,
    onRootstocksChange: (String) -> Unit,
    onObservationsChange: (String) -> Unit,
    onRequestCountConfirmation: () -> Unit,
    onRetry: () -> Unit,
    onFinishAndTakeAnotherLine: () -> Unit,
) {
    val reservation = requireNotNull(state.confirmedReservation)
    val syncState = state.countDraft?.syncState ?: SyncState.PENDIENTE
    val released = reservation.state == "LIBERADA" || state.countDraft?.errorCode == "RESERVATION_RELEASED"
    val editable = !released && (
        (syncState == SyncState.ERROR && state.countDraft?.errorCode == "INVALID_ARGUMENT") ||
            (syncState == SyncState.PENDIENTE && state.countDraft?.frozenPayload == null)
        )
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(state.user?.name.orEmpty(), fontWeight = FontWeight.Bold)
                    Text("Conexión: ${state.connectionStatus}")
                    Text("Sincronización local: ${syncState.name}")
                }
                OutlinedButton(onClick = onSignOut, enabled = syncState != SyncState.SINCRONIZANDO) { Text("Salir") }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(if (released) "Reserva liberada" else "Línea en conteo", fontWeight = FontWeight.Bold)
                    Text("Jornada: ${state.journey?.displayName ?: reservation.journeyId}")
                    Text("Vivero: ${reservation.location.nursery}")
                    Text("Módulo: ${reservation.location.module}")
                    Text("Cama: ${reservation.location.bed}")
                    Text("Línea: ${reservation.location.line}", fontWeight = FontWeight.Bold)
                    if (reservation.reservationType == "CORRECCION") {
                        Text(
                            "Corrección versionada · nueva versión ${reservation.nextCountVersion}",
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
        item { QuantityField("Hembras", state.countInput.females, state.countErrors.females, editable, onFemalesChange) }
        item { QuantityField("Machos", state.countInput.males, state.countErrors.males, editable, onMalesChange) }
        item { QuantityField("Patrones", state.countInput.rootstocks, state.countErrors.rootstocks, editable, onRootstocksChange) }
        item {
            OutlinedTextField(
                value = state.countInput.observations,
                onValueChange = onObservationsChange,
                label = { Text("Observaciones opcionales") },
                minLines = 3,
                enabled = editable,
                isError = state.countErrors.observations != null,
                supportingText = { state.countErrors.observations?.let { Text(it) } },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Text(
                    "Total: ${state.countTotal ?: "—"}",
                    modifier = Modifier.padding(18.dp),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        if (state.zeroWarning) {
            item { Text("Advertencia: el total cero se acepta técnicamente en el emulador; su política operativa sigue pendiente.") }
        }
        state.message?.let { item { Text(it, color = if (syncState == SyncState.ENVIADA) ViveroGreen else MaterialTheme.colorScheme.error) } }
        item {
            when (syncState) {
                SyncState.ENVIADA -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        if (reservation.reservationType == "CORRECCION") {
                            "Versión ${reservation.nextCountVersion} confirmada y pendiente de revisión."
                        } else {
                            "Conteo confirmado por el servidor y pendiente de revisión."
                        },
                        color = ViveroGreen,
                        fontWeight = FontWeight.Bold,
                    )
                    Button(onClick = onFinishAndTakeAnotherLine, modifier = Modifier.fillMaxWidth()) {
                        Text("Finalizar y tomar otra línea")
                    }
                }
                SyncState.ERROR -> if (released) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "La reserva fue liberada por supervisión.",
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold,
                        )
                        Text("El borrador permanece guardado. Consulta con el supervisor antes de continuar.")
                    }
                } else {
                    Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("Reintentar mismo envío") }
                }
                SyncState.SINCRONIZANDO -> Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text("Sincronizando…") }
                SyncState.PENDIENTE -> Button(
                    onClick = onRequestCountConfirmation,
                    enabled = editable,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (state.countDraft?.frozenPayload == null) "Revisar y confirmar" else "Esperando conexión") }
            }
        }
    }
}

@Composable
private fun QuantityField(
    label: String,
    value: String,
    error: String?,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        enabled = enabled,
        isError = error != null,
        supportingText = { error?.let { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun JourneyContent(
    state: CampoUiState,
    onSignOut: () -> Unit,
    onReturnToJourneySelection: () -> Unit,
    onSelectLine: (JourneyLine) -> Unit,
    onCorrectCount: (ReturnedCount) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(state.user?.name.orEmpty(), fontWeight = FontWeight.Bold)
                    Text("Rol central: ${state.user?.role.orEmpty()}")
                    Text("Conexión: ${state.connectionStatus}")
                }
                OutlinedButton(onClick = onSignOut, enabled = !state.reserving) { Text("Salir") }
            }
        }
        if (state.activeJourneys.size > 1) {
            item {
                OutlinedButton(
                    onClick = onReturnToJourneySelection,
                    enabled = !state.reserving && state.correctingCountId == null,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Cambiar jornada") }
            }
        }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        item {
            Text(
                state.journey?.displayName ?: "Cargando jornada…",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
        }
        if (state.returnedCounts.isNotEmpty()) {
            item {
                Text(
                    "Correcciones pendientes",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
            items(state.returnedCounts, key = { "returned-${it.countId}" }) { returned ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0)),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(returned.location.displayName, fontWeight = FontWeight.Bold)
                        Text("Versión ${returned.version} devuelta")
                        Text("Motivo: ${returned.reason}", color = MaterialTheme.colorScheme.error)
                        Text("Autor original: ${returned.originalAuthorName}")
                        Text("Responsable actual: ${returned.correctionResponsibleName}", fontWeight = FontWeight.Bold)
                        if (returned.isReassigned) {
                            Text("Reasignada por: ${returned.reassignedByName ?: "Supervisor"}")
                            Text("Motivo de reasignacion: ${returned.reassignmentReason.orEmpty()}")
                        }
                        Text(
                            "Referencia editable · H ${returned.input.females} · M ${returned.input.males} · " +
                                "P ${returned.input.rootstocks}",
                        )
                        if (returned.canCorrect) {
                            Button(
                            onClick = { onCorrectCount(returned) },
                            enabled = state.mutableOperationsEnabled && state.correctingCountId == null,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                if (state.correctingCountId == returned.countId) {
                                    "Iniciando corrección…"
                                } else {
                                    "Corregir conteo"
                                },
                            )
                            }
                        } else {
                            Text(
                                "Solo lectura: la correccion fue asignada a ${returned.correctionResponsibleName}.",
                                color = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    }
                }
            }
        }
        items(state.journey?.lines.orEmpty(), key = { it.id }) { line ->
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(line.location.displayName, fontWeight = FontWeight.Bold)
                    Text("${line.location.nursery} · ${line.location.module} · ${line.location.bed}")
                    Text("Estado: ${line.state}")
                    Button(
                        onClick = { onSelectLine(line) },
                        enabled = state.mutableOperationsEnabled && line.state == "DISPONIBLE" && !state.reserving,
                    ) {
                        Text(
                            when {
                                !state.mutableOperationsEnabled -> "Operación no disponible"
                                line.state == "DISPONIBLE" -> "Tomar línea"
                                else -> "No disponible"
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun JourneySelectionContent(
    state: CampoUiState,
    onSignOut: () -> Unit,
    onSelectJourney: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(state.user?.name.orEmpty(), fontWeight = FontWeight.Bold)
                    Text("Selecciona una jornada activa")
                }
                OutlinedButton(onClick = onSignOut) { Text("Salir") }
            }
        }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        items(state.activeJourneys, key = ActiveJourney::id) { journey ->
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(journey.displayName, fontWeight = FontWeight.Bold)
                    Text("Rol efectivo: ${journey.effectiveRole}")
                    Text("Líneas: ${journey.lineCount}")
                    Button(
                        onClick = { onSelectJourney(journey.id) },
                        enabled = journey.state == "ACTIVA",
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Entrar a esta jornada") }
                }
            }
        }
    }
}
