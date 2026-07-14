# Vivero Campo

Aplicación Android `debug` de la ETAPA 4. Las cuentas ficticias de auxiliar, supervisor y administrador siguen el mismo flujo: autenticar, reservar, capturar, confirmar y sincronizar un conteo.

## Seguridad y persistencia

- Solo conecta al proyecto demo y a Auth, Firestore y Functions Emulator.
- No usa `google-services.json`, registro público ni credenciales reales.
- `release` deshabilita Firebase y falla de forma segura.
- Room conserva reserva y borrador por usuario, instalación y reserva.
- `ReservationTokenVault` cifra el token con AES-GCM y una clave no exportable de Android Keystore antes de persistir ciphertext e IV.
- El éxito central elimina ciphertext e IV; no existe fallback en texto plano.
- `ENVIADA` es local y solo se asigna después de respuesta central.

WorkManager 2.11.2 programa un trabajo único por intento con conectividad obligatoria. El payload y la clave idempotente permanecen congelados durante reintentos y sobreviven al reinicio.

El host por defecto para Android Emulator es `10.0.2.2`; una prueba controlada puede pasar `-PemulatorHost=<IP_PRIVADA>`.

## Comandos

```powershell
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
./gradlew.bat installDebug
```

Aprobación, devolución, corrección, reasignación, liberación e inventario están fuera de esta etapa.
