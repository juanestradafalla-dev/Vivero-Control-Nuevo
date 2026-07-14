# Vivero Maestro

Monitor Electron/React de solo lectura para la ETAPA 4. Inicia sesión contra Auth Emulator y observa la jornada, reservas y conteos mediante snapshots de Firestore Emulator.

## Alcance

- Presenta `DISPONIBLE`, `EN_CONTEO` y `PENDIENTE_REVISION`.
- Ofrece búsqueda por ubicación y filtro por estado.
- Supervisor y administrador autorizados ven autor, rol, dispositivo, cantidades, total, observaciones, horas y versión.
- Auxiliares no consultan ni ven conteos ajenos.
- No incluye botones de aprobar, devolver, corregir, reasignar, liberar ni modificar inventario.

## Seguridad

- Solo acepta emuladores y proyectos `demo-*`.
- `.env.example` contiene valores públicos de prueba, no secretos.
- `contextIsolation=true`, `nodeIntegration=false` y `sandbox=true`.
- Ventanas, navegación externa y permisos permanecen bloqueados.

## Comandos

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm run dev
```

No se genera ni versiona instalador.
