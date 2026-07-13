# ADR-006: estados centrales frente a estados locales

## Contexto

La palabra `ENVIADA` mezclaba anteriormente la entrega desde un dispositivo con
el estado compartido de una línea.

## Decisión

Los estados centrales son `DISPONIBLE`, `EN_CONTEO`, `PENDIENTE_REVISION`,
`DEVUELTA` y `APROBADA`. Los estados locales son `PENDIENTE`, `SINCRONIZANDO`,
`ENVIADA` y `ERROR`. Al enviar, el backend cambia la línea directamente de
`EN_CONTEO` a `PENDIENTE_REVISION` en una transacción.

## Alternativas

- Agregar `ENVIADA` al documento central.
- Derivar todo estado local desde Firestore.
- Un único enum compartido para ambos propósitos.

## Consecuencias

Un dispositivo puede explicar su cola sin contaminar el flujo central. Las
interfaces y analítica deberán nombrar claramente el tipo de estado que muestran.

## Estado

Aceptada para el MVP.
