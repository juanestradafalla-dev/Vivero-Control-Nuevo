# Inventario oficial y movimientos — Etapa 5

## Fotografía oficial

`inventarioOficialLineas/{lineaId}` es la única fotografía vigente por línea. Conserva cantidades por categoría, total calculado, versión, último conteo aprobado, actor y hora central.

La aprobación reemplaza todos los valores; no suma el conteo al inventario anterior. Si el inventario no existe, `aprobarConteo` devuelve `INVENTORY_NOT_FOUND`. No existe fallback a cero.

## Datos ficticios repetibles

El seed borra y vuelve a crear, exclusivamente en un proyecto `demo-*`:

| Línea | Hembras | Machos | Patrones | Total | Versión |
|---|---:|---:|---:|---:|---:|
| `LINEA-PRUEBA-1` | 500 | 300 | 200 | 1.000 | 1 |
| `LINEA-PRUEBA-2` | 380 | 220 | 150 | 750 | 1 |
| `LINEA-PRUEBA-3` | 270 | 180 | 90 | 540 | 1 |

Todos declaran `origen=SEED_FICTICIO_ETAPA_5`. No representan el vivero real ni sirven para migración.

## Movimiento histórico

Cada aprobación crea un documento inmutable con:

- jornada, jornada-línea y línea física;
- conteo y decisión de origen;
- valores anteriores y nuevos;
- diferencias `nuevo - anterior` por categoría y total;
- versiones anterior y nueva del inventario;
- clave idempotente y hora central.

Ejemplo ficticio de la primera línea:

```text
Anterior: 500 + 300 + 200 = 1000
Nuevo:    450 + 320 + 210 =  980
Diferencia: -50, +20, +10, total -20
```

Una devolución no crea movimiento y no cambia la fotografía.

## Escrituras

Las reglas niegan `create`, `update` y `delete` desde cualquier cliente sobre inventario, movimientos, decisiones, auditoría y estados centrales. Solo las Callables con Admin SDK realizan la transacción.
