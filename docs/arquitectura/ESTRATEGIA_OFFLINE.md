# Estrategia offline

## Principios del MVP

- Reservar una línea requiere conexión y confirmación central. No se permite
  asumir una reserva desde el dispositivo.
- Después de confirmar la reserva, el usuario puede continuar el conteo sin
  señal y guardar un borrador local.
- Las reservas no vencen automáticamente durante el MVP. Un supervisor las
  libera manualmente mediante una operación central.
- No se reservan bloques anticipados hasta medir la señal real.
- Cada borrador queda aislado por identificador de usuario y de jornada. Un
  cambio de sesión no expone ni envía los borradores de otra cuenta.

## Persistencia y sincronización futuras

Room implementará el puerto de borradores locales y WorkManager implementará el
puerto de trabajo diferido. La ETAPA 2 solo define esos puntos de extensión. El
registro local incluirá un identificador global y una clave de idempotencia
creada antes del primer intento.

```text
PENDIENTE -> SINCRONIZANDO -> ENVIADA
                    |             |
                    +--> ERROR ---+
```

`ENVIADA` confirma la recepción local de una respuesta satisfactoria; el envío
central cambia la línea directamente de `EN_CONTEO` a `PENDIENTE_REVISION` en
una única transacción.

## Casos de recuperación

### Respuesta perdida

Si el backend confirmó el conteo pero la respuesta se perdió, Campo repite la
solicitud con la misma clave. El backend debe devolver el resultado previo sin
crear otro conteo ni otra transición.

### Reserva liberada mientras existe un borrador

El borrador no se elimina. Se marca como conflicto, no se envía y requiere una
decisión explícita del supervisor. Recuperar contenido local no concede de
nuevo la reserva.

### Usuario autor ausente

El supervisor podrá reasignar la corrección en una etapa funcional posterior.
El conteo original, su autor y la reasignación deben permanecer en auditoría.

### Retención y protección

El plazo de retención, el cifrado local y la respuesta ante relojes incorrectos
siguen como decisiones pendientes de la ETAPA 1. La implementación no debe
suponer valores antes de contar con los dispositivos reales.

## Relación

Véase [ADR-007: estrategia sin conexión](../adr/ADR-007-ESTRATEGIA-OFFLINE.md).
