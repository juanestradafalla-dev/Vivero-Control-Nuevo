# Pruebas de la ETAPA 19

## Contratos y backend

- formato estricto de importar, listar y revertir;
- hash recalculado, confirmación doble y paquete nuevamente validado;
- generación central de IDs, jerarquía y mapa externo/interno;
- inventario versión 1 con total central y ausencia de movimientos;
- límite de 450 escrituras y cero efectos parciales;
- paquete original y fuentes detalladas ausentes del registro histórico;
- administrador permitido; supervisor y auxiliar rechazados.

## Idempotencia, concurrencia y reversión

- misma clave y payload recuperan exactamente el resultado;
- misma clave con otro payload produce conflicto;
- el mismo hash con otra clave permanece bloqueado;
- dos administradores concurrentes producen un solo ganador;
- reversión válida elimina únicamente los ocho recursos creados por el fixture;
- edición, selección de borrador, jornada, reserva, conteo, decisión, corrección, movimiento o hijo externo bloquean toda la reversión;
- dos reversiones concurrentes producen un ganador y el reintento idempotente recupera su resultado;
- registro, mapa, bloqueo de hash y auditorías permanecen después de revertir.

## Maestro, reglas y compatibilidad

- Maestro muestra proyección, exige fragmento del hash y presenta el mapa generado;
- historial diferencia `APLICADA` y `REVERTIDA` y oculta la acción cuando no es elegible;
- la reversión exige motivo y confirmación explícita;
- reglas rechazan lectura y escritura directa de importaciones y bloqueos de hash;
- Campo conserva compilación y pruebas sin cambios funcionales.

La matriz final ejecuta contratos, Android, Maestro, backend, emuladores, reglas, concurrencia, auditorías y escaneo de artefactos. No ejecuta `firebase deploy`.
