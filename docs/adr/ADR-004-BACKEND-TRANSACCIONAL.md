# ADR-004: operaciones críticas mediante backend transaccional

## Contexto

Reservar, enviar, liberar, devolver y aprobar cambian estado compartido y pueden
recibirse varias veces por fallos de red o concurrencia.

## Decisión

Ejecutar estas operaciones exclusivamente en el backend, con autorización,
precondiciones, transacciones Firestore, timestamps de servidor e idempotencia.
Los clientes no escribirán el inventario oficial.

## Alternativas

- Escrituras directas desde Campo o Maestro.
- Lotes sin verificación de versión.
- Reintentos que creen un nuevo identificador en cada intento.

## Consecuencias

La consistencia y auditoría quedan centralizadas, a costa de requerir conexión
para confirmar operaciones. La ETAPA 2 solo entrega interfaces que fallan de
forma explícita; no exporta Functions incompletas.

## Estado

Aceptada; implementación funcional pendiente.
