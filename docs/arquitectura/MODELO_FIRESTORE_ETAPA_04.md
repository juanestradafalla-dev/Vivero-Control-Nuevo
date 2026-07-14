# Modelo Firestore — ETAPA 4

## Alcance

El modelo continúa siendo ficticio y exclusivo de `demo-vivero-control-etapa3`. La Etapa 4 agrega conteos inmutables y consume reservas, pero no introduce inventario oficial ni movimientos de inventario.

## Colecciones relevantes

### `reservas/{reservaId}`

Se conservan identidad, jornada, línea, dispositivo, rol efectivo, `tokenReservaHash`, estado y horas centrales. `enviarConteo` cambia exactamente una reserva de `ACTIVA` a `CONSUMIDA` y agrega `consumidaEn`. El token opaco nunca se persiste: solo su SHA-256.

### `conteos/{conteoId}`

Registro inmutable creado únicamente por backend:

- identidad: `id`, `jornadaId`, `jornadaLineaId`, `lineaId`, `reservaId`;
- autor central: `autorUsuarioId`, `autorNombreVisible`, `rolEfectivo`, `dispositivoId`;
- captura: `hembras`, `machos`, `patrones`, `observaciones`, `timestampDispositivo`;
- resultado central: `total`, `recibidoEn`, `versionNumero = 1`, `conteoAnteriorId = null`;
- trazabilidad: `claveIdempotencia`, `ubicacion`, `inmutable = true`.

`total` se calcula en backend. Un cliente no puede crear, actualizar ni eliminar documentos de esta colección.

### `jornadaLineas/{jornadaLineaId}`

La transición implementada es:

```text
EN_CONTEO --enviarConteo--> PENDIENTE_REVISION
```

La misma transacción establece `conteoVigenteId`, limpia `reservaActivaId`, incrementa una sola vez `version` y actualiza `actualizadaEn`. `ENVIADA` no es un estado central.

### `idempotencia/{hash}`

Para `ENVIAR_CONTEO` el identificador deriva de cuenta, operación y clave. Se guarda el hash normalizado del payload y el resultado exacto. El hash del payload incorpora el hash del token, nunca el token en texto plano.

### `auditoria/{eventoId}`

Se crea una vez `CONTEO_ENVIADO` con actor, recurso, jornada, clave, transición y versión. No incluye token.

## Lecturas desde clientes

- autor: puede leer solo sus conteos y debe consultar con `autorUsuarioId == request.auth.uid`;
- supervisor o administrador autorizado: puede leer conteos de la jornada;
- auxiliar: no puede leer conteos ajenos;
- ningún cliente escribe `conteos`, `reservas`, `idempotencia`, `auditoria` ni estados de `jornadaLineas`.

## Inventario

`inventarioOficialLineas` y `movimientosInventario` no son escritos por la Etapa 4. `PENDIENTE_REVISION` es una captura esperando decisión; no representa inventario vigente.
