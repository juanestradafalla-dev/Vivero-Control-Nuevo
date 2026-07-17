# ETAPA 20 — Criterios de aceptación

## Backend

- [x] Existe una sola frontera explícita `EMULATOR` / `PRODUCTION`.
- [x] Production exige `viverocontrol-3f83f` y `APP_ENV=production`.
- [x] Las 30 Callables ejecutan la frontera antes de autenticar.
- [x] Se conservan roles, autorización, validación, versiones, idempotencia, concurrencia y auditoría.
- [x] Las operaciones administrativas peligrosas conservan rol administrador y confirmaciones.
- [x] No se versiona `.env.viverocontrol-3f83f`.

## Android

- [x] `debug` usa `com.arles.viverocampo.emulator`, proyecto `demo-*` y Emulator Suite.
- [x] `release` usa `com.arles.viverocampo`, Project ID exacto y ningún emulador.
- [x] Production rechaza configuración incompleta.
- [x] Room, preferencias, FirebaseApp, WorkManager y Keystore están aislados.
- [x] Reserva, conteo offline, sincronización, corrección e historial están habilitados según permisos.
- [x] La firma queda preparada mediante valores locales, sin secretos ni llave real.

## Maestro

- [x] Solo se admiten `EMULATOR` y `PRODUCTION`.
- [x] Production exige las seis variables locales y Functions `us-central1`.
- [x] Las funciones visibles dependen del rol, no de bloqueos de ambiente.
- [x] CSP no contiene comodines ni `unsafe-eval`.
- [x] Electron Builder usa identidad y nombre final, sin generar instalador.

## Datos y seguridad

- [x] Firestore Rules no se debilitan.
- [x] No existen escrituras críticas directas desde clientes.
- [x] Las pruebas Firebase se ejecutan solo contra emuladores.
- [x] CI no despliega, firma, usa cuentas reales ni guarda secretos.

## Documentación y estado operativo

- [x] La documentación refleja Electron/React, los estados de jornada y la importación/reversión ya implementados.
- [x] Se documentan `nam5`, `us-central1` y el único proyecto real autorizado.
- [x] Se declara expresamente que no existe staging funcional.
- [x] Se declara que todavía no hubo despliegue, limpieza, cuentas, inventario ni artefactos definitivos.
- [ ] ETAPA 21: ejecutar el corte controlado, configuración real, despliegue y validación operativa solo después de aprobar los riesgos pendientes.
