# ETAPA 27B — Criterios de aceptación

## OAuth y selección

- [x] Authorization Code usa PKCE S256, `state`, nonce, expiración y callback loopback exacto.
- [x] Electron abre el navegador del sistema y no usa WebView.
- [x] El único alcance solicitado y aceptado es `drive.file`.
- [x] Google Picker exige una plantilla o carpeta por intento y el backend valida tipo y capacidad.
- [x] La cuenta autorizada debe coincidir con la cuenta principal configurada fuera del repositorio.
- [x] Solo administradores activos pueden iniciar, completar, consultar o revocar la conexión.
- [x] La carpeta puede seleccionarse desde “Compartidos conmigo” con la sesión del usuario.

## Protección del token

- [x] El refresh token se escribe exclusivamente como versión de Secret Manager.
- [x] Firestore, respuestas, auditoría, idempotencia, logs, archivos locales y Maestro no contienen el token ni su hash.
- [x] Las identidades de agregar versión y leer el secreto son distintas y obligatorias en producción.
- [x] `invalid_grant`, expiración, revocación y errores externos producen estados y mensajes sanitizados.
- [x] Revocar es idempotente y no borra historial ni archivos.

## Informe y compatibilidad

- [x] El adaptador fake continúa siendo obligatorio en Emulator Suite y CI.
- [x] El informe conserva deduplicación por jornada y periodo, reintentos y un único archivo lógico.
- [x] La autenticación OAuth sustituye solamente la autenticación de Drive; no cambia cierre, inventario, conteos o XLSX.
- [x] Firestore Rules niega acceso directo a configuración y sesiones OAuth.

## Operación pendiente

- [ ] Primer backup Firestore disponible en estado `READY`.
- [ ] Pantalla de consentimiento publicada fuera de Testing.
- [ ] Cliente OAuth Desktop y APIs configurados.
- [ ] Secreto e identidades dedicadas creados con IAM mínimo.
- [ ] Variables productivas configuradas sin versionarlas.
- [ ] Functions y reglas enumeradas desplegadas y verificadas.
- [ ] Conexión y prueba controlada autorizadas sobre recursos reales.

Hasta completar los pendientes, el estado productivo es `NO-GO`.
