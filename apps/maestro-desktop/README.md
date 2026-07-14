# Vivero Maestro

Aplicación Electron/React de la Etapa 5 para revisar conteos en Firebase Emulator Suite.

- Observa líneas, conteos e inventarios ficticios mediante snapshots.
- Presenta ubicación, autor, rol, dispositivo, cantidades, observaciones, horas, versión, inventario actual y diferencia.
- Muestra un resumen no editable antes de aprobar.
- Exige motivo antes de devolver.
- Bloquea la aprobación propia del supervisor.
- Advierte y exige motivo al administrador que aprueba excepcionalmente su conteo.
- Solicita acciones mediante Callables; no escribe documentos críticos directamente.
- Auxiliares no leen detalle ajeno ni ven acciones.

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

No incluye corrección, reasignación, liberación, gestión de jornadas ni instalador.
