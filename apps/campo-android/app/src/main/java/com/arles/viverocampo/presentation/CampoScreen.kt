package com.arles.viverocampo.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
        onSelectLine = viewModel::selectLine,
        onCancelSelection = viewModel::cancelSelection,
        onConfirmReservation = viewModel::confirmReservation,
    )
}

@Composable
private fun CampoScreen(
    state: CampoUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    onSelectLine: (com.arles.viverocampo.domain.JourneyLine) -> Unit,
    onCancelSelection: () -> Unit,
    onConfirmReservation: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = ViveroBackground) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                text = if (state.emulatorEnabled) {
                    "MODO DE PRUEBA — EMULADOR"
                } else {
                    "FIREBASE DESHABILITADO — SIN PRODUCCIÓN"
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TestBanner)
                    .padding(12.dp),
                color = Color.Black,
                fontWeight = FontWeight.Bold,
            )
            if (state.user == null) {
                LoginContent(state, onEmailChange, onPasswordChange, onSignIn)
            } else {
                JourneyContent(state, onSignOut, onSelectLine)
            }
        }
    }

    state.selectedLine?.let { line ->
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
                OutlinedButton(onClick = onCancelSelection, enabled = !state.reserving) {
                    Text("Cancelar")
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
    Column(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("Vivero Campo", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Inicio de sesión exclusivo para cuentas ficticias del Auth Emulator.")
        OutlinedTextField(
            value = state.email,
            onValueChange = onEmailChange,
            label = { Text("Correo de prueba") },
            singleLine = true,
            enabled = state.emulatorEnabled && !state.signingIn,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = onPasswordChange,
            label = { Text("Contraseña de prueba") },
            singleLine = true,
            enabled = state.emulatorEnabled && !state.signingIn,
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        Button(
            onClick = onSignIn,
            enabled = state.emulatorEnabled && !state.signingIn,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (state.signingIn) "Ingresando…" else "Iniciar sesión")
        }
        state.message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun JourneyContent(
    state: CampoUiState,
    onSignOut: () -> Unit,
    onSelectLine: (com.arles.viverocampo.domain.JourneyLine) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
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
        state.message?.let { message ->
            item { Text(message, color = if (state.confirmedReservation == null) MaterialTheme.colorScheme.error else ViveroGreen) }
        }
        state.confirmedReservation?.let { reservation ->
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Línea reservada", fontWeight = FontWeight.Bold)
                        Text(reservation.location.displayName)
                        Text("Estado: ${reservation.state}")
                        Text("Usuario: ${state.user?.name.orEmpty()}")
                        Text("Hora confirmada: ${reservation.confirmedAt}")
                        Text("El formulario de conteo se implementará después.")
                    }
                }
            }
        }
        item {
            Text(
                state.journey?.displayName ?: "Cargando jornada ficticia…",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
        }
        items(state.journey?.lines.orEmpty(), key = { it.id }) { line ->
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(line.location.displayName, fontWeight = FontWeight.Bold)
                    Text("${line.location.nursery} · ${line.location.module} · ${line.location.bed}")
                    Text("Estado: ${line.state}")
                    Button(
                        onClick = { onSelectLine(line) },
                        enabled = line.state == "DISPONIBLE" && !state.reserving,
                    ) {
                        Text(if (line.state == "DISPONIBLE") "Tomar línea" else "No disponible")
                    }
                }
            }
        }
    }
}
