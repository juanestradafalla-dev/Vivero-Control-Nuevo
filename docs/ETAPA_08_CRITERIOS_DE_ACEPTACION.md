# Criterios de aceptación — Etapa 8

- [x] `main` partió de `560e781995b25db9f1f32406b429208ec51550fb`.
- [x] `liberarReservaLinea` funciona solo con Emulator Suite y proyecto `demo-*`.
- [x] Solo supervisor o administrador activo y autorizado puede liberar.
- [x] La reserva debe estar `ACTIVA`, la línea `EN_CONTEO` y `reservaActivaId` debe coincidir.
- [x] El motivo es obligatorio y el conteo no puede haber sido aceptado.
- [x] Reserva normal vuelve a `DISPONIBLE`; corrección vuelve a `DEVUELTA`.
- [x] Una corrección conserva responsable y restaura su reasignación activa.
- [x] Liberación, reserva, línea, auditoría e idempotencia se confirman atómicamente.
- [x] Misma clave y payload recuperan el resultado; otro payload produce conflicto.
- [x] Dos liberaciones y la carrera liberar/enviar producen un solo ganador.
- [x] No se eliminan reservas, borradores, conteos ni historial.
- [x] Campo conserva el borrador y token cifrado, cancela reintentos y no marca `ENVIADA`.
- [x] Maestro exige motivo, muestra advertencia y resumen, y solo usa la Callable.
- [x] Las reglas rechazan escrituras directas críticas.
- [x] Inventario oficial y movimientos permanecen intactos.
- [x] Contratos, Android, Maestro, backend y Emulator Suite pasan localmente.
- [x] No existen temporizadores ni liberación automática.
- [x] No se configuró ni desplegó Firebase real.

La aceptación técnica no resuelve señal y dispositivos reales, retención local definitiva, gestión completa de jornadas ni Firebase de producción.
