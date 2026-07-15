# Reasignación supervisada de correcciones — Etapa 7

## Flujo

La línea permanece `DEVUELTA` mientras supervisor o administrador selecciona a otro usuario activo y autorizado. `reasignarCorreccionConteo` no acepta identidad ni rol del actor en el payload: ambos proceden de Authentication, perfil y autorización central.

```text
DEVUELTA (autor original responsable)
  -> reasignación inmutable y auditada
DEVUELTA (nuevo responsable)
  -> iniciarCorreccionConteo
EN_CONTEO (reserva CORRECCION del responsable)
  -> enviarConteo
PENDIENTE_REVISION (nueva versión)
```

## Transacción de reasignación

En una sola transacción se validan actor, jornada, conteo vigente, estado, ausencia de reserva y usuario destino. Luego se:

1. crea `reasignacionesCorreccion/{reasignacionId}` como registro inmutable;
2. actualiza `responsableCorreccionUsuarioId` y `reasignacionActivaId` en la línea;
3. incrementa exactamente una vez la versión de la línea;
4. crea auditoría `CORRECCION_CONTEO_REASIGNADA`;
5. conserva el resultado idempotente `REASIGNAR_CORRECCION_CONTEO`.

El registro conserva autor original, responsable anterior, nuevo responsable, actor, motivo, hora central y una referencia de solo lectura para Campo. Ninguna escritura toca `conteos`, `inventarioOficialLineas` o `movimientosInventario`.

## Responsabilidad e inmutabilidad

- Sin reasignación activa, el responsable es el autor del conteo vigente.
- Con reasignación activa, solo `responsableCorreccionUsuarioId` inicia la corrección.
- La reserva guarda el usuario responsable y solo el hash del token; Campo conserva el token cifrado con Android Keystore.
- La nueva versión usa como autor a la cuenta que envió la corrección y apunta al conteo anterior.
- El conteo anterior, su autor y todas las versiones previas permanecen intactos.

## Idempotencia y concurrencia

La identidad idempotente combina actor, operación y clave. El hash del payload incluye conteo, destino y motivo. La misma clave con el mismo payload devuelve el resultado anterior; con otro payload produce `IDEMPOTENCY_CONFLICT`.

Dos intentos simultáneos hacia el mismo responsable compiten sobre la versión de la línea: uno confirma y el otro, al reintentarse, recibe `CORRECTION_REASSIGNMENT_NO_CHANGE`. No se duplica registro ni auditoría.

## Acceso de clientes

Maestro solo lee usuarios activos, autorizaciones de su jornada, conteos y reasignaciones permitidas por reglas. La reasignación se solicita por Callable; no hay escritura Firestore directa. Campo puede leer la reasignación donde es autor original o nuevo responsable. Todas las escrituras directas a reasignaciones continúan cerradas.

## Exclusiones

No se implementan liberación de reservas, corrección simultánea, gestión de jornadas, datos reales, Firebase de producción ni despliegues.
