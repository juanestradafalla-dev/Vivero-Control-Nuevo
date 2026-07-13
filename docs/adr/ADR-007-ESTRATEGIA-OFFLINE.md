# ADR-007: estrategia de trabajo sin conexión

## Contexto

La señal real aún no está medida, pero el conteo debe tolerar interrupciones sin
crear reservas conflictivas ni duplicar envíos.

## Decisión

Exigir conexión para reservar. Después de confirmarla, permitir borrador local
aislado por usuario y sincronizarlo con clave idempotente. No reservar bloques
anticipados ni vencer reservas automáticamente en el primer MVP; el supervisor
las libera manualmente.

## Alternativas

- Reservas y aprobaciones totalmente offline.
- Vencimiento automático por tiempo.
- Reservar anticipadamente grupos completos de líneas.

## Consecuencias

Reduce conflictos y permite continuar el registro durante cortes. Una respuesta
perdida se recupera repitiendo la misma solicitud. Un borrador cuya reserva fue
liberada queda en conflicto y requiere intervención; no se elimina ni se envía.

## Estado

Aceptada de forma provisional hasta medir señal y dispositivos.
