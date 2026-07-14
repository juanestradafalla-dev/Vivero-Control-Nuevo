# Operación `aprobarConteo`

## Propósito

`aprobarConteo` convierte una línea `PENDIENTE_REVISION` en `APROBADA`, reemplaza su fotografía de inventario oficial y registra la diferencia histórica. Solo existe en Firebase Emulator Suite.

## Solicitud

```json
{
  "conteoId": "...",
  "claveIdempotencia": "...",
  "motivoExcepcion": "..."
}
```

`motivoExcepcion` se omite normalmente. Solo se admite cuando un administrador aprueba su propio conteo. Identidad, rol, jornada, línea, estado y tiempo se obtienen desde Authentication y Firestore.

## Validaciones centrales

- `FUNCTIONS_EMULATOR=true` y proyecto `demo-*`.
- Authentication presente, perfil existente y activo.
- Jornada activa y autorización activa con `puedeRevisar=true`.
- Rol efectivo `SUPERVISOR` o `ADMINISTRADOR`, vigente también en el perfil.
- Conteo existente, inmutable, aritméticamente válido y vinculado a la línea.
- Línea activa en `PENDIENTE_REVISION` y `conteoVigenteId` coincidente.
- Supervisor distinto del autor.
- Administrador autor con motivo de excepción no vacío.
- Inventario oficial inicial existente y coherente. Nunca se supone cero.
- Versiones dentro del rango seguro.

## Transacción atómica

La misma transacción:

1. crea `decisionesRevision/{decisionId}` con decisión `APROBAR`;
2. reemplaza hembras, machos, patrones y total en `inventarioOficialLineas/{lineaId}`;
3. incrementa una vez la versión de inventario;
4. crea `movimientosInventario/{movimientoId}` con valores anteriores, nuevos y diferencias;
5. cambia `jornadaLineas` a `APROBADA` e incrementa una vez su versión;
6. crea auditoría `CONTEO_APROBADO`;
7. crea el resultado idempotente `APROBAR_CONTEO`.

El conteo original no se actualiza. Si una lectura o validación falla, no se confirma ninguna escritura.

## Idempotencia

La referencia idempotente deriva de actor, operación y clave. El hash del payload contiene `conteoId` y `motivoExcepcion` normalizado. Misma clave y payload devuelve exactamente el resultado persistido; misma clave con otro payload devuelve `IDEMPOTENCY_CONFLICT`.

En una carrera entre dos aprobaciones, o entre aprobación y devolución, Firestore reintenta la transacción contendiente. Después de la primera confirmación, la segunda observa que la línea ya no está pendiente y falla sin duplicar inventario, movimiento, auditoría ni versión.

## Resultado

Incluye conteo, línea, decisión, movimiento, estado `APROBADA`, fotografía anterior, fotografía nueva, diferencias, versiones y hora central. No incluye identidad confiada al cliente ni datos sensibles.
