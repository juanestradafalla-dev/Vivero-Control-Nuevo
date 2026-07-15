# Cancelación y reapertura de borradores — ETAPA 14

## Frontera funcional

La etapa agrega dos operaciones administrativas exclusivamente para jornadas que aún no han sido activadas:

```text
BORRADOR --cancelarJornadaBorrador--> INACTIVA / CANCELACION_BORRADOR
INACTIVA / CANCELACION_BORRADOR --reabrirJornadaCancelada--> BORRADOR
```

Una jornada `ACTIVA`, una cerrada normalmente o cualquier jornada que conserve evidencia de activación no puede entrar en este flujo.

## Cancelación transaccional

`cancelarJornadaBorrador` recibe solo `jornadaId`, `versionEsperada`, `motivo` y `claveIdempotencia`. Auth aporta el actor y Firestore aporta rol, propiedad y hora. En una única transacción:

1. valida actor activo, rol y propiedad;
2. exige estado `BORRADOR` y versión exacta;
3. comprueba ausencia de `jornadaLineas`, autorizaciones operativas, reservas y ocupaciones activas;
4. cambia la jornada a `INACTIVA` con `tipoInactivacion = CANCELACION_BORRADOR`;
5. crea `cancelacionesJornadas/{cancelacionId}` como trazabilidad inmutable;
6. registra auditoría y resultado idempotente.

Las selecciones en `seleccionesLineasJornada` y `seleccionesParticipantesJornada` no se escriben ni eliminan.

## Reapertura segura

`reabrirJornadaCancelada` recibe solo jornada, versión y clave. Exige la cancelación vigente, su registro inmutable y ausencia de `activadaEn`, `cerradaEn` o `cerradaPorUsuarioId`. La transacción restaura `BORRADOR`, incrementa la versión y conserva `ultimaCancelacionId` y el documento de cancelación.

Reabrir no valida nuevamente líneas o perfiles. Esa validación ocurre al editar las selecciones o al ejecutar `activarJornada`, evitando que una fotografía antigua de preparación se convierta directamente en autorización operativa.

## Concurrencia

Cancelar, editar líneas, editar participantes y activar leen y modifican el mismo documento `jornadas/{jornadaId}`. Firestore reintenta la transacción perdedora, que entonces observa el nuevo estado o versión y se rechaza completa. No hay lotes parciales.

## Maestro y Campo

Maestro presenta borradores editables y cancelados en secciones separadas. Los cancelados muestran actor, fecha, motivo, líneas y participantes en modo lectura. Solo los registros devueltos por la consulta administrativa autorizada muestran `Reabrir borrador`.

Campo no cambia: `listarJornadasActivas` nunca incluye `BORRADOR` ni `INACTIVA`, por lo que cancelación y reapertura no exponen jornadas operativas.

## Datos no modificados

Las operaciones no crean ni modifican inventario, movimientos, conteos, decisiones, reservas, autorizaciones operativas, `jornadaLineas` u ocupaciones.
