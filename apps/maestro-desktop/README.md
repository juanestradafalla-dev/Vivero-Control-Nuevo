# Vivero Maestro

Aplicación Electron/React de la Etapa 9 para revisar conteos y liberar reservas en Firebase Emulator Suite.

- Consulta jornadas activas autorizadas y permite seleccionar una.
- Al cambiar cancela todas las suscripciones anteriores y limpia el snapshot para no mezclar jornadas.

- Observa líneas, conteos e inventarios ficticios mediante snapshots.
- Presenta ubicación, autor, rol, dispositivo, cantidades, observaciones, horas, versión, inventario actual y diferencia.
- Muestra un resumen no editable antes de aprobar.
- Exige motivo antes de devolver.
- Bloquea la aprobación propia del supervisor.
- Advierte y exige motivo al administrador que aprueba excepcionalmente su conteo.
- Solicita acciones mediante Callables; no escribe documentos críticos directamente.
- Auxiliares no leen detalle ajeno ni ven acciones.
- Presenta todas las versiones por línea, marca la vigente y conserva visible el motivo de devolución.
- Las versiones anteriores son solo lectura; las acciones apuntan a la versión vigente y el backend vuelve a validarla.
- En líneas `DEVUELTA` muestra autor original, responsable actual, asignador y motivos.
- Supervisor y administrador seleccionan exclusivamente usuarios activos y autorizados, revisan un resumen y solicitan la reasignación mediante Callable.
- En líneas `EN_CONTEO` muestra titular, tipo, dispositivo, hora y versión de línea.
- Supervisor y administrador deben escribir un motivo, revisar la advertencia y el estado de retorno, y confirmar `liberarReservaLinea` con una única clave.

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

No incluye edición de versiones, liberación automática, temporizadores, gestión de jornadas ni instalador.
