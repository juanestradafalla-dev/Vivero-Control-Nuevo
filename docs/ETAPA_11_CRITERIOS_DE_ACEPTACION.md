# Criterios de aceptación — ETAPA 11

- [x] La base es `d3a043706032645c6120a2067c27bf84477fafe9`.
- [x] Existen `listarParticipantesJornadaBorrador` y `actualizarParticipantesJornadaBorrador`.
- [x] La selección se guarda en `seleccionesParticipantesJornada` separada de autorizaciones operativas.
- [x] Supervisor administra solo borradores propios, administrador todos y auxiliar ninguno.
- [x] Solo se seleccionan perfiles centrales existentes y activos.
- [x] Nombre y rol proceden del backend; el cliente solo indica ID y `puedeContar`.
- [x] Duplicados, campos adicionales, usuarios inexistentes e inactivos son rechazados.
- [x] La actualización es transaccional, auditada e idempotente.
- [x] La misma clave y payload recuperan el resultado; otro payload produce conflicto.
- [x] Firestore Rules niega lectura y escritura directa de la selección.
- [x] Maestro busca, filtra, selecciona y confirma participantes dentro del borrador.
- [x] Campo continúa mostrando únicamente jornadas `ACTIVA` autorizadas.
- [x] No se crean autorizaciones operativas, líneas de jornada, reservas, conteos, inventario ni movimientos.
- [x] No se implementaron activación, gestión de cuentas o roles, Firebase real ni despliegues.
