# Pruebas de la Etapa 5

## Contratos

- compilación Draft 2020-12 con referencias completas;
- solicitudes y resultados de aprobar/devolver;
- propiedades adicionales rechazadas;
- motivo obligatorio;
- invariantes de total y diferencias.

## Backend y Emulator Suite

La suite integrada usa Auth, Functions y Firestore Emulator reales. Cada revisión crea primero una reserva con `reservarLinea` y un conteo con `enviarConteo`.

Casos cubiertos:

- aprobación y devolución válidas;
- cálculo por categoría y total;
- inventario reemplazado exactamente una vez;
- devolución sin movimiento ni cambio de inventario;
- auxiliar sin permiso;
- autorrevisión del supervisor bloqueada;
- autorrevisión administrativa con y sin motivo;
- conteo inexistente, ya revisado o desalineado con la línea;
- inventario inexistente con rollback total;
- recuperación de respuesta perdida con la misma clave;
- conflicto de clave con payload distinto;
- dos aprobaciones simultáneas;
- aprobación y devolución simultáneas;
- reglas positivas y negativas para conteos, decisiones, inventario y movimientos.

En las carreras se comprueba una decisión, a lo sumo un movimiento, una auditoría de revisión y una sola subida de versión.

## Campo

- botón `Finalizar y tomar otra línea` solo después de `ENVIADA`;
- historial local conservado;
- reserva consumida no restaurada al reiniciar sesión;
- flujo completo de dos líneas consecutivas;
- pruebas anteriores de formulario, Room, aislamiento, cifrado y reintento conservadas.

## Maestro

- bandeja `PENDIENTE_REVISION` y actualización por snapshot;
- detalle de conteo e inventario, con diferencia;
- resumen no editable de aprobación;
- devolución con motivo;
- bloqueo de supervisor autor y excepción administrativa;
- auxiliar sin detalle ni acciones;
- ausencia de edición directa, liberación o reasignación.

## Matriz de comandos

Los comandos obligatorios se mantienen en el README raíz y en `.github/workflows/ci.yml`. CI no contiene `firebase deploy`.
