# Modelo Firestore de la ETAPA 3

## Alcance

Este modelo existe únicamente en el proyecto ficticio
`demo-vivero-control-etapa3` de Firebase Emulator Suite. No hay proyecto,
credenciales ni datos de producción configurados.

## Colecciones

```text
usuarios/{usuarioId}
ubicaciones/{ubicacionId}
lineas/{lineaId}
jornadas/{jornadaId}
└── autorizaciones/{usuarioId}
jornadaLineas/{jornadaLineaId}
reservas/{reservaId}
idempotencia/{idempotenciaId}
auditoria/{eventoId}
```

`jornadaLineas` se mantiene como colección global en vez de subcolección. La
decisión permite resolver una línea de jornada por un único ID global, consultar
las líneas autorizadas con `where("jornadaId", "==", ...)` y evitar que el
cliente envíe por separado un `jornadaId` confiable. Cada documento conserva
`jornadaId` y `lineaId`, por lo que sigue existiendo exactamente una instancia
de la línea física dentro de la jornada.

## Documentos mínimos

| Colección | Campos relevantes en esta etapa |
|---|---|
| `usuarios` | `id`, `nombreVisible`, `roles[]`, `activo`, timestamps. |
| `ubicaciones` | `codigo`, `tipo`, `ubicacionPadreId`, `nombreVisible`, `orden`, `activa`. |
| `lineas` | `id`, `ubicacionId`, `codigo`, `nombreVisible`, `orden`, `activa`. |
| `jornadas` | `id`, `nombreVisible`, `estadoAdministrativo`, `creadaPorUsuarioId`, timestamps. |
| `autorizaciones` | `jornadaId`, `usuarioId`, `rolEfectivo`, `activa`, `puedeContar`. |
| `jornadaLineas` | `jornadaId`, `lineaId`, `activa`, `estadoCentral`, `reservaActivaId`, `version`, `ubicacion`, `actualizadaEn`. |
| `reservas` | actor, rol efectivo, dispositivo, línea de jornada, hash del token, estado y timestamp central. |
| `idempotencia` | hash de identidad/operación/clave, hash del payload y resultado exacto. |
| `auditoria` | tipo, actor, recurso, clave de correlación, timestamp y metadatos de transición. |

La ubicación visible se copia dentro de `jornadaLineas` como fotografía para que
Campo pueda confirmar la tarea con una sola lectura autorizada. El catálogo
continúa siendo la fuente para la administración futura.

## Estados

Los contratos permiten `DISPONIBLE`, `EN_CONTEO`, `PENDIENTE_REVISION`,
`DEVUELTA` y `APROBADA`. La ETAPA 3 solo ejecuta:

```text
DISPONIBLE ── reservarLinea ──> EN_CONTEO
```

`estadoCentral`, `reservaActivaId`, `version` y `actualizadaEn` solo cambian en
el backend. Una escritura directa de cualquier cliente es rechazada por reglas.

## Integridad de la reserva

- El ID de `jornadaLineas` es global y combina jornada y línea ficticias.
- Una línea disponible tiene `reservaActivaId = null`.
- Reservar crea un único documento global en `reservas` y guarda su ID en la
  línea dentro de la misma transacción.
- Firestore reintenta la transacción ante contención; solo un intento puede
  observar la línea como `DISPONIBLE` y confirmar el cambio.
- `version` se incrementa exactamente una vez por reserva confirmada.
- `reservadaEn` y `actualizadaEn` se calculan en Functions, no en el cliente.
- El token opaco solo se entrega en el resultado. Firestore guarda SHA-256 del
  token, nunca el valor en texto plano.

## Límites conocidos

No se modelan todavía conteos, aprobación, inventario oficial, liberación,
despachos ni migración. La reserva preexistente de la tercera línea es un dato
ficticio destinado a probar el estado ocupado.
