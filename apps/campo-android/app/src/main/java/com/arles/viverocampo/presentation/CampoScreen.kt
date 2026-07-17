package com.arles.viverocampo.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
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
        onSelectMode = viewModel::selectMode,
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
        onDiscardSearchChange = viewModel::updateDiscardSearch,
        onRefreshDiscardLines = viewModel::refreshDiscardLines,
        onSelectDiscardLine = viewModel::selectDiscardLine,
        onDiscardFemalesChange = viewModel::updateDiscardFemales,
        onDiscardMalesChange = viewModel::updateDiscardMales,
        onDiscardRootstocksChange = viewModel::updateDiscardRootstocks,
        onDiscardDeadChange = viewModel::updateDiscardDead,
        onDiscardNematodesChange = viewModel::updateDiscardNematodes,
        onDiscardGooseNeckChange = viewModel::updateDiscardGooseNeck,
        onDiscardBifurcatedRootsChange = viewModel::updateDiscardBifurcatedRoots,
        onDiscardDoubleGraftingChange = viewModel::updateDiscardDoubleGrafting,
        onDiscardObservationsChange = viewModel::updateDiscardObservations,
        onRequestDiscardConfirmation = viewModel::requestDiscardConfirmation,
        onCancelDiscardConfirmation = viewModel::cancelDiscardConfirmation,
        onConfirmDiscardSubmission = viewModel::confirmDiscardSubmission,
        onRetryDiscard = viewModel::retryDiscardSubmission,
        onAbandonDiscard = viewModel::abandonDiscardDraft,
        onFinishDiscard = viewModel::finishDiscard,
    )
}

@Composable
private fun CampoScreen(
    state: CampoUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    onSelectMode: (CampoMode) -> Unit,
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
    onDiscardSearchChange: (String) -> Unit,
    onRefreshDiscardLines: () -> Unit,
    onSelectDiscardLine: (com.arles.viverocampo.domain.DiscardLine) -> Unit,
    onDiscardFemalesChange: (String) -> Unit,
    onDiscardMalesChange: (String) -> Unit,
    onDiscardRootstocksChange: (String) -> Unit,
    onDiscardDeadChange: (String) -> Unit,
    onDiscardNematodesChange: (String) -> Unit,
    onDiscardGooseNeckChange: (String) -> Unit,
    onDiscardBifurcatedRootsChange: (String) -> Unit,
    onDiscardDoubleGraftingChange: (String) -> Unit,
    onDiscardObservationsChange: (String) -> Unit,
    onRequestDiscardConfirmation: () -> Unit,
    onCancelDiscardConfirmation: () -> Unit,
    onConfirmDiscardSubmission: () -> Unit,
    onRetryDiscard: () -> Unit,
    onAbandonDiscard: () -> Unit,
    onFinishDiscard: () -> Unit,
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
            if (state.user != null) ModeSwitcher(state.mode, onSelectMode)
            when {
                state.user == null -> LoginContent(state, onEmailChange, onPasswordChange, onSignIn)
                state.mode == CampoMode.DESCARTES -> DiscardContent(
                    state,
                    onSignOut,
                    onDiscardSearchChange,
                    onRefreshDiscardLines,
                    onSelectDiscardLine,
                    onDiscardFemalesChange,
                    onDiscardMalesChange,
                    onDiscardRootstocksChange,
                    onDiscardDeadChange,
                    onDiscardNematodesChange,
                    onDiscardGooseNeckChange,
                    onDiscardBifurcatedRootsChange,
                    onDiscardDoubleGraftingChange,
                    onDiscardObservationsChange,
                    onRequestDiscardConfirmation,
                    onRetryDiscard,
                    onAbandonDiscard,
                    onFinishDiscard,
                )
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

    if (state.showDiscardSummary && state.mutableOperationsEnabled) {
        val draft = requireNotNull(state.discardDraft)
        AlertDialog(
            onDismissRequest = onCancelDiscardConfirmation,
            title = { Text("Confirmar descarte") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(draft.line.location.displayName, fontWeight = FontWeight.Bold)
                    Text("Hembras: ${state.discardInput.females}")
                    Text("Machos: ${state.discardInput.males}")
                    Text("Patrones: ${state.discardInput.rootstocks}")
                    Text("Total único: ${state.discardUniqueTotal ?: 0}", fontWeight = FontWeight.Bold)
                    Text("Suma de causas: ${state.discardCausesTotal ?: 0}")
                    Text("Una planta se resta una sola vez aunque tenga varias causas.")
                    Text("Quedará pendiente de revisión; aún no modifica el inventario.")
                }
            },
            confirmButton = {
                Button(onClick = onConfirmDiscardSubmission, enabled = !state.confirmingDiscard) {
                    Text(if (state.confirmingDiscard) "Guardando…" else "Confirmar descarte")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = onCancelDiscardConfirmation, enabled = !state.confirmingDiscard) {
                    Text("Volver")
                }
            },
        )
    }
}

@Composable
private fun ModeSwitcher(mode: CampoMode, onSelectMode: (CampoMode) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (mode == CampoMode.CONTEOS) {
            Button(onClick = { onSelectMode(CampoMode.CONTEOS) }, modifier = Modifier.weight(1f)) { Text("Conteos") }
        } else {
            OutlinedButton(onClick = { onSelectMode(CampoMode.CONTEOS) }, modifier = Modifier.weight(1f)) {
                Text("Conteos")
            }
        }
        if (mode == CampoMode.DESCARTES) {
            Button(onClick = { onSelectMode(CampoMode.DESCARTES) }, modifier = Modifier.weight(1f)) { Text("Descartes") }
        } else {
            OutlinedButton(onClick = { onSelectMode(CampoMode.DESCARTES) }, modifier = Modifier.weight(1f)) {
                Text("Descartes")
            }
        }
    }
}

@Composable
private fun DiscardContent(
    state: CampoUiState,
    onSignOut: () -> Unit,
    onSearchChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onSelectLine: (com.arles.viverocampo.domain.DiscardLine) -> Unit,
    onFemalesChange: (String) -> Unit,
    onMalesChange: (String) -> Unit,
    onRootstocksChange: (String) -> Unit,
    onDeadChange: (String) -> Unit,
    onNematodesChange: (String) -> Unit,
    onGooseNeckChange: (String) -> Unit,
    onBifurcatedRootsChange: (String) -> Unit,
    onDoubleGraftingChange: (String) -> Unit,
    onObservationsChange: (String) -> Unit,
    onRequestConfirmation: () -> Unit,
    onRetry: () -> Unit,
    onAbandon: () -> Unit,
    onFinish: () -> Unit,
) {
    val draft = state.discardDraft
    val syncState = draft?.syncState ?: SyncState.PENDIENTE
    val editable = draft != null && (
        (syncState == SyncState.PENDIENTE && draft.frozenPayload == null) ||
            (syncState == SyncState.ERROR && draft.errorCode == "INVALID_ARGUMENT")
        )
    val filtered = state.discardLines.filter { line ->
        val query = state.discardSearch.trim()
        query.isEmpty() || listOf(
            line.location.module,
            line.location.bed,
            line.location.line,
            line.location.displayName,
        ).any { it.contains(query, ignoreCase = true) }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(state.user?.name.orEmpty(), fontWeight = FontWeight.Bold)
                    Text("Captura sin conexión disponible")
                    if (draft != null) Text("Sincronización: ${syncState.name}")
                }
                OutlinedButton(onClick = onSignOut, enabled = syncState != SyncState.SINCRONIZANDO) { Text("Salir") }
            }
        }
        if (draft == null) {
            item {
                Text("Selecciona módulo, cama y línea", style = MaterialTheme.typography.titleLarge)
                Text("El inventario mostrado es la última copia guardada en este teléfono.")
            }
            item {
                OutlinedTextField(
                    value = state.discardSearch,
                    onValueChange = onSearchChange,
                    label = { Text("Buscar módulo, cama o línea") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            item {
                OutlinedButton(onClick = onRefresh, enabled = !state.loadingDiscardLines, modifier = Modifier.fillMaxWidth()) {
                    Text(if (state.loadingDiscardLines) "Actualizando…" else "Actualizar catálogo con señal")
                }
            }
            if (filtered.isEmpty()) {
                item { Text("No hay líneas guardadas que coincidan con la búsqueda.") }
            }
            items(filtered, key = { it.lineId }) { line ->
                Card(onClick = { onSelectLine(line) }, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(line.location.displayName, fontWeight = FontWeight.Bold)
                        Text("Módulo ${line.location.module} · Cama ${line.location.bed} · Línea ${line.location.line}")
                        Text(
                            "Inventario: H ${line.inventory.females} · M ${line.inventory.males} · P ${line.inventory.rootstocks}",
                        )
                    }
                }
            }
        } else {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0))) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text("Descarte en captura", fontWeight = FontWeight.Bold)
                        Text(draft.line.location.displayName)
                        Text(
                            "Disponible: H ${draft.line.inventory.females} · M ${draft.line.inventory.males} · " +
                                "P ${draft.line.inventory.rootstocks}",
                        )
                    }
                }
            }
            item { Text("Plantas únicas por categoría", fontWeight = FontWeight.Bold) }
            item { QuantityField("Hembras", state.discardInput.females, state.discardErrors.females, editable, onFemalesChange) }
            item { QuantityField("Machos", state.discardInput.males, state.discardErrors.males, editable, onMalesChange) }
            item { QuantityField("Patrones", state.discardInput.rootstocks, state.discardErrors.rootstocks, editable, onRootstocksChange) }
            item { Text("Causas (una planta puede aparecer en varias)", fontWeight = FontWeight.Bold) }
            item { QuantityField("Muertos", state.discardInput.dead, state.discardErrors.dead, editable, onDeadChange) }
            item { QuantityField("Nematodos", state.discardInput.nematodes, state.discardErrors.nematodes, editable, onNematodesChange) }
            item { QuantityField("Cuello de ganso", state.discardInput.gooseNeck, state.discardErrors.gooseNeck, editable, onGooseNeckChange) }
            item {
                QuantityField(
                    "Raíces bifurcadas",
                    state.discardInput.bifurcatedRoots,
                    state.discardErrors.bifurcatedRoots,
                    editable,
                    onBifurcatedRootsChange,
                )
            }
            item {
                QuantityField(
                    "Doble injertación",
                    state.discardInput.doubleGrafting,
                    state.discardErrors.doubleGrafting,
                    editable,
                    onDoubleGraftingChange,
                )
            }
            item {
                OutlinedTextField(
                    value = state.discardInput.observations,
                    onValueChange = onObservationsChange,
                    label = { Text("Observaciones opcionales") },
                    minLines = 3,
                    enabled = editable,
                    isError = state.discardErrors.observations != null,
                    supportingText = { state.discardErrors.observations?.let { Text(it) } },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Total único: ${state.discardUniqueTotal ?: "—"}", fontWeight = FontWeight.Bold)
                        Text("Suma de causas: ${state.discardCausesTotal ?: "—"}")
                    }
                }
            }
            state.discardErrors.general?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
            state.message?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
            item {
                when (syncState) {
                    SyncState.ENVIADA -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Descarte recibido y pendiente de revisión.", color = ViveroGreen, fontWeight = FontWeight.Bold)
                        Button(onClick = onFinish, modifier = Modifier.fillMaxWidth()) { Text("Registrar otro descarte") }
                    }
                    SyncState.SINCRONIZANDO -> Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                        Text("Sincronizando…")
                    }
                    SyncState.ERROR -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
                            Text("Reintentar mismo envío")
                        }
                        OutlinedButton(onClick = onAbandon, modifier = Modifier.fillMaxWidth()) {
                            Text("Eliminar borrador y elegir otra línea")
                        }
                    }
                    SyncState.PENDIENTE -> Button(
                        onClick = onRequestConfirmation,
                        enabled = editable,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (draft.frozenPayload == null) "Revisar y confirmar" else "Esperando conexión") }
                }
            }
        }
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
