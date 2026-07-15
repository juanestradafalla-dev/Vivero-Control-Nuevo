# Criterios de aceptación — Etapa 7

- [x] `main` partió del commit `65f0a5649dbbccaa79c0bee13a122312bd5a2493`.
- [x] `reasignarCorreccionConteo` funciona solo con Emulator Suite y proyecto `demo-*`.
- [x] Solo supervisor o administrador activo y autorizado puede reasignar.
- [x] El destino debe estar activo, autorizado y habilitado para contar.
- [x] Conteo y línea deben ser vigentes, `DEVUELTA` y sin reserva activa.
- [x] El motivo es obligatorio y el destino debe cambiar realmente.
- [x] Reasignación, línea, auditoría e idempotencia se confirman atómicamente.
- [x] La concurrencia hacia el mismo destino produce un solo ganador.
- [x] `iniciarCorreccionConteo` acepta solo al responsable actual.
- [x] La nueva versión conserva `conteoAnteriorId` y registra al corrector como autor.
- [x] Conteos previos e inventario oficial permanecen intactos.
- [x] Campo muestra al asignado la corrección y al autor original como solo lectura.
- [x] Maestro muestra responsabilidad y reasigna mediante Callable con resumen previo.
- [x] Las reglas rechazan escrituras directas a conteos, líneas y reasignaciones.
- [x] Contratos, Android, Maestro, backend y Emulator Suite pasan localmente.
- [x] No se configuró ni desplegó Firebase real.
- [x] No se implementó liberación de reservas.

La aceptación técnica no resuelve señal real, dispositivos reales, retención local, gestión de jornadas ni operación de Firebase de producción.
