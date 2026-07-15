# Vivero Campo

Aplicación Android `debug` de la Etapa 7. Auxiliares, supervisores y administradores usan el mismo flujo: autenticar, reservar, capturar, confirmar y sincronizar.

- Room conserva reserva, borrador e historial por usuario, dispositivo y reserva.
- Android Keystore cifra el token con AES-GCM; nunca se persiste en texto plano.
- WorkManager mantiene payload y clave idempotente durante reintentos.
- `ENVIADA` solo aparece después de confirmación central.
- `Finalizar y tomar otra línea` cierra la reserva consumida sin borrar el conteo local.
- Un inicio posterior solo restaura reservas con token cifrado todavía activo.
- La prueba de dos líneas consecutivas comprueba que la primera queda en historial y la segunda abre un intento independiente.
- El autor ve sus conteos `DEVUELTA`, su motivo y puede iniciar una reserva de corrección.
- La versión anterior se usa como referencia editable para un borrador Room nuevo ligado a la nueva reserva.
- La migración Room 2 a 3 conserva el tipo de reserva, el conteo anterior y la siguiente versión esperada.
- El usuario reasignado ve la corrección, el asignador y el motivo; puede iniciar el mismo flujo versionado y offline.
- El autor original conserva el conteo como solo lectura y deja de ver el botón de corrección mientras otra persona sea responsable.

```powershell
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```

Campo no aprueba, devuelve, reasigna, libera ni modifica inventario. Solo el responsable central actual puede iniciar la corrección mediante la Callable.
