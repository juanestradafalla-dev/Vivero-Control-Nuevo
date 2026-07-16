# Pruebas de la ETAPA 17

La matriz cubre contratos, backend, emuladores, Firestore Rules y Vivero Maestro.

## Backend y concurrencia

- carga válida antes de activar y en jornada activa todavía disponible;
- permisos, estado de línea, versión, inventario existente y fuente ficticia;
- enteros seguros, negativos, decimales, desbordamiento, total cero y campos adicionales;
- bloqueo por reserva, conteo, decisión, corrección o movimiento;
- creación exacta de inventario, carga inicial y auditoría, sin movimiento;
- repetición idempotente, conflicto de payload y dos inicializaciones concurrentes con un solo ganador;
- aprobación posterior desde versión 1 a 2 con diferencias correctas y trazabilidad inicial intacta.

## Seguridad y Maestro

- clientes no pueden leer ni escribir directamente cargas iniciales ni escribir inventario, auditoría o idempotencia;
- Catálogo presenta estado, cantidades, versión, origen, actor, fecha y elegibilidad;
- el formulario calcula total, exige fuente ficticia y confirmación inmutable;
- supervisor y auxiliar no acceden a Catálogo ni a la acción administrativa.

Campo conserva su comportamiento y no recibe cambios funcionales.
