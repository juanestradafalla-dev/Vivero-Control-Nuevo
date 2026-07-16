# Pruebas de la ETAPA 16

## Contratos y backend

Los contratos cubren las cinco Callables, propiedades adicionales, campos estructurales inmutables, resultados versionados e idempotencia. Las pruebas integradas usan Auth, Functions y Firestore Emulator reales para validar permisos, creación, actualización, padres inexistentes o inactivos, ciclos, normalización, duplicados, concurrencia, versiones obsoletas y dependencias activas.

Dos creaciones equivalentes compiten por el mismo bloqueo determinista y producen un único ganador. Repetir clave y payload recupera exactamente el resultado; cambiar el payload produce conflicto sin escritura parcial.

## Integridad

Se comprueba que una línea ocupada no cambia y que su `jornadaLineas.ubicacion` histórico permanece idéntico. Una línea seleccionada solo en borrador puede desactivarse: la selección se conserva y el catálogo de preparación la devuelve bloqueada por `LINEA_INACTIVA`. No se alteran inventario, movimientos, jornadas, reservas ni historial.

Firestore Rules rechaza crear, editar o eliminar directamente ubicaciones y líneas, y niega todo acceso cliente a los bloqueos de unicidad.

## Maestro y matriz

Maestro prueba visibilidad exclusiva de “Catálogo”, árbol, búsqueda, filtros, advertencias, creación, edición confirmada, líneas ocupadas y borradores conservados. Se ejecutan contratos; Android build, unitarias y lint; Maestro lint, typecheck, pruebas, build y audit; backend lint, typecheck, unitarias, build, emuladores, reglas y audit; además de la revisión de secretos y artefactos. No existe despliegue.
