# Vivero Campo

Aplicación Android `debug` de la Etapa 5. Auxiliares, supervisores y administradores usan el mismo flujo: autenticar, reservar, capturar, confirmar y sincronizar.

- Room conserva reserva, borrador e historial por usuario, dispositivo y reserva.
- Android Keystore cifra el token con AES-GCM; nunca se persiste en texto plano.
- WorkManager mantiene payload y clave idempotente durante reintentos.
- `ENVIADA` solo aparece después de confirmación central.
- `Finalizar y tomar otra línea` cierra la reserva consumida sin borrar el conteo local.
- Un inicio posterior solo restaura reservas con token cifrado todavía activo.
- La prueba de dos líneas consecutivas comprueba que la primera queda en historial y la segunda abre un intento independiente.

```powershell
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```

Campo no aprueba, devuelve, corrige, reasigna ni modifica inventario.
