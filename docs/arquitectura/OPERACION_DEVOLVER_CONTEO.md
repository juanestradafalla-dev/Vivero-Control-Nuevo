# Operación `devolverConteo`

## Propósito

`devolverConteo` cambia una línea de `PENDIENTE_REVISION` a `DEVUELTA` sin modificar inventario. La creación de una versión corregida pertenece a la Etapa 6.

## Solicitud

```json
{
  "conteoId": "...",
  "motivo": "Motivo obligatorio",
  "claveIdempotencia": "..."
}
```

No acepta identidad, rol, jornada, línea, estado ni tiempo del cliente. El límite de 2.000 caracteres es una protección técnica de transporte, no una política operativa definitiva.

## Validaciones

Comparte con la aprobación el bloqueo emulator-only, perfil activo, jornada activa, autorización vigente, rol revisor central, conteo inmutable y correspondencia entre conteo, línea y `conteoVigenteId`. El motivo se recorta y debe conservar contenido.

## Transacción atómica

1. crea una decisión separada `DEVOLVER` con motivo;
2. cambia la línea a `DEVUELTA`;
3. incrementa una vez la versión de línea;
4. crea auditoría `CONTEO_DEVUELTO`;
5. guarda el resultado idempotente `DEVOLVER_CONTEO`.

No lee, crea ni actualiza movimientos de inventario. El inventario oficial queda byte por byte igual. Un fallo revierte toda la operación.

## Concurrencia

Repetir la misma clave y payload recupera el resultado anterior. Otra carga con la misma clave produce conflicto. Si una devolución compite con otra decisión, exactamente una transición puede confirmar.
