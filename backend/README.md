# Backend local de Vivero Control

Backend de la Etapa 11 para Firebase Emulator Suite. Exporta las operaciones existentes y agrega `listarParticipantesJornadaBorrador` y `actualizarParticipantesJornadaBorrador`. No contiene proyecto real, credenciales ni despliegue.

`listarJornadasActivas` acepta una solicitud vacía, toma la identidad de Auth y devuelve solo jornadas activas autorizadas, ordenadas por fecha central y nombre visible. No escribe documentos ni expone autorizaciones ajenas.

`crearJornadaBorrador` crea una jornada global `BORRADOR`, con identidad y hora centrales, auditoría e idempotencia. `actualizarLineasJornadaBorrador` valida propiedad o administración, líneas activas y ausencia de uso en jornadas activas; guarda la preparación en `seleccionesLineasJornada`, separada de las `jornadaLineas` operativas. `listarJornadasAdministrables` devuelve al supervisor solo sus borradores y al administrador todos, junto con el catálogo central validado; auxiliares son rechazados.

`listarParticipantesJornadaBorrador` entrega exclusivamente usuarios centrales activos con nombre y rol validados. `actualizarParticipantesJornadaBorrador` acepta únicamente IDs y `puedeContar`, rechaza duplicados y campos adicionales, vuelve a obtener los perfiles centrales y guarda la preparación en `seleccionesParticipantesJornada` mediante una transacción auditada e idempotente. No crea documentos bajo `autorizaciones`.

`aprobarConteo` crea una decisión, reemplaza el inventario oficial, registra un movimiento, cambia la línea a `APROBADA`, audita y persiste el resultado idempotente en una sola transacción. `devolverConteo` crea decisión y auditoría, cambia la línea a `DEVUELTA` y no toca inventario.

`reasignarCorreccionConteo` valida actor, destino y jornada, crea un registro inmutable, actualiza el responsable y audita en una transacción idempotente. `iniciarCorreccionConteo` acepta exclusivamente al responsable actual, crea una reserva `CORRECCION`, guarda el hash del token y cambia `DEVUELTA` a `EN_CONTEO`. `enviarConteo` crea `versionNumero + 1`, enlaza `conteoAnteriorId`, usa como autor a quien corrigió y vuelve a `PENDIENTE_REVISION` sin modificar inventario.

`liberarReservaLinea` exige supervisor o administrador autorizado, reserva `ACTIVA`, línea `EN_CONTEO` y motivo. En una sola transacción marca la reserva `LIBERADA`, crea el registro inmutable y la auditoría, limpia `reservaActivaId`, restaura `DISPONIBLE` o `DEVUELTA` según el tipo y persiste el resultado idempotente. Una corrección recupera `reasignacionOrigenId` y conserva su responsable. La carrera contra `enviarConteo` tiene un solo ganador.

El seed repetible crea tres inventarios ficticios y se niega a ejecutar si el proyecto no comienza por `demo-`. Las Functions exigen además `FUNCTIONS_EMULATOR=true`.

```powershell
Set-Location backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

La prueba integrada reserva y envía antes de revisar. Cubre atomicidad, autorrevisión, idempotencia, concurrencia, rollback y reglas. Los riesgos de dependencias están en [Dependencias y riesgos](../docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md).
