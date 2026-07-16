# Criterios de aceptación — ETAPA 16

- Solo un administrador central activo lista o modifica el catálogo.
- Las ubicaciones forman un árbol genérico sin imponer niveles productivos.
- El backend genera IDs y normaliza códigos antes de comprobar unicidad.
- Código, tipo y padre de ubicaciones son inmutables; código y ubicación de líneas también.
- Padres inexistentes, inactivos, referencias propias y ciclos se rechazan sin escrituras parciales.
- Crear o reactivar exige la cadena completa de padres activa.
- No se desactiva una ubicación con hijas o líneas activas y nunca existe cascada.
- Una línea ocupada por jornada activa no se modifica ni desactiva.
- Una línea seleccionada solo en borrador puede desactivarse sin borrar la selección y queda marcada inválida.
- Todas las escrituras son transaccionales, versionadas, auditadas e idempotentes.
- Los bloqueos deterministas producen un único ganador ante códigos concurrentes equivalentes.
- Firestore Rules niega escrituras directas y acceso cliente a bloqueos de unicidad.
- Maestro muestra “Catálogo” solo a administradores, con árbol, búsqueda, filtros, creación, edición y confirmación.
- Los borradores refrescan el catálogo; las fotografías históricas nunca se reescriben.
- Inventario, movimientos, jornadas operativas, reservas e historial permanecen intactos.
- La jerarquía real sigue pendiente y los tipos actuales son fixtures ficticios.
- No existe importación de datos reales ni inicialización de inventario.
- Todo funciona únicamente con Emulator Suite; no se configura ni despliega Firebase real.
