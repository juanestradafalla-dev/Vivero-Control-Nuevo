# ADR-005: inventario oficial como fotografía por línea

## Contexto

La unidad oficial aprobada es cada línea y debe conservarse el efecto de cada
revisión sobre el inventario previo.

## Decisión

Mantener una fotografía vigente por línea. Aprobar un conteo reemplaza su valor
y crea un movimiento histórico inmutable con valor anterior, nuevo y diferencia.
Ambos cambios ocurrirán en la misma transacción central.

## Alternativas

- Sumar el conteo como entrada o salida.
- Mantener solo un historial y calcular siempre la fotografía.
- Inventario oficial con otra granularidad.

## Consecuencias

La lectura del inventario vigente es directa y cada ajuste es explicable. Deben
probarse la aritmética, la idempotencia y el control de versiones. Un total cero
es válido en el contrato, aunque su tratamiento visual sigue pendiente.

## Estado

Aceptada para el MVP.
