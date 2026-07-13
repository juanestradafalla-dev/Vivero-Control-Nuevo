# Vivero Maestro

Monitor Electron/React de la ETAPA 3. Inicia sesión contra Auth Emulator y
observa en vivo la jornada y sus líneas desde Firestore Emulator.

## Alcance

- Lista líneas ordenadas por módulo, cama, orden y código.
- Muestra `DISPONIBLE` o `EN_CONTEO`.
- Supervisor y administrador pueden ver titular y hora de la reserva.
- Auxiliar solo ve que existe una reserva activa.
- No crea jornadas ni permite reservar, liberar, aprobar o modificar.

## Seguridad

- Solo acepta `VITE_USE_FIREBASE_EMULATORS=true` y proyectos `demo-*`.
- `.env.example` contiene valores públicos de prueba, no secretos.
- `contextIsolation=true`, `nodeIntegration=false` y `sandbox=true`.
- CSP limitada a recursos propios y puertos locales de desarrollo.
- Ventanas, navegación externa y permisos permanecen bloqueados.

## Comandos

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npm run dev
```

No se genera ni versiona instalador en esta etapa.
