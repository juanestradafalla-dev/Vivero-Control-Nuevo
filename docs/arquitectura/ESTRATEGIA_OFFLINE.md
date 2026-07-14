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

## Persistencia y sincronización implementadas en la ETAPA 4

Room implementa los borradores locales y WorkManager el trabajo diferido con
conectividad obligatoria y trabajo único. El registro local conserva alcance,
payload congelado, estado, error y clave creada al confirmar el intento.

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

El token ya se cifra con AES-GCM y Android Keystore. El plazo de retención, la
protección operativa completa del dispositivo y la respuesta ante relojes
incorrectos siguen pendientes; la implementación no inventa esos valores.

## Relación

Véase [ADR-007: estrategia sin conexión](../adr/ADR-007-ESTRATEGIA-OFFLINE.md).
