# Vivero Campo

Aplicación Android `debug` de la ETAPA 3 para iniciar sesión, observar la jornada
ficticia y reservar una línea mediante la Callable Function `reservarLinea`.

## Seguridad del entorno

- Proyecto fijo `demo-vivero-control-etapa3`.
- Auth Emulator `10.0.2.2:9099`.
- Firestore Emulator `10.0.2.2:8180`.
- Functions Emulator `10.0.2.2:5001`.
- Sin `google-services.json`, registro público ni credenciales reales.
- `release` deshabilita Firebase y muestra un aviso de fallo seguro.
- El dispositivo es un UUID por instalación; no concede permisos.

El host se puede sustituir para una prueba controlada con
`-PemulatorHost=<IP_PRIVADA>`. Consulte
[Configuración de emuladores](../../docs/arquitectura/CONFIGURACION_EMULADORES_CLIENTES.md).

## Persistencia local

Room guarda únicamente la reserva ya confirmada, incluida la identidad del
usuario, ubicación, estado, hora y versión. No persiste contraseña, clave de
idempotencia ni token opaco. Las consultas se filtran por usuario.

La base aprovecha el aislamiento de la aplicación Android, pero todavía no tiene
cifrado adicional ni política de borrado remoto. Antes de usar datos reales se
deben definir protección del dispositivo, retención y recuperación.

## Comandos

```powershell
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
./gradlew.bat installDebug
```

El formulario de conteo, liberación y sincronización diferida no pertenecen a
esta etapa.
