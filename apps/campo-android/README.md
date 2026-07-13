# Vivero Campo: fundación técnica

Esqueleto Android nativo con Kotlin, Jetpack Compose, MVVM y separación entre `presentation`, `domain`, `data` y `core`.

- `applicationId` provisional: `com.arles.viverocampo`.
- `compileSdk`: Android 36.1.
- `targetSdk`: Android 36.
- `minSdk`: Android 23 como base técnica provisional, no como promesa de compatibilidad con los celulares del vivero.
- Firebase y Google Services no están configurados.
- No se solicitan permisos Android.
- `LocalDraftStore` es el puerto futuro para Room.
- `DeferredSyncScheduler` es el puerto futuro para WorkManager.
- Gradle Wrapper 9.4.1 incluye checksum y el grafo de dependencias está
  registrado en `app/gradle.lockfile`.

El identificador y el `minSdk` deben confirmarse antes de registrar la aplicación en Firebase o preparar una publicación.

## Comandos

```powershell
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```
