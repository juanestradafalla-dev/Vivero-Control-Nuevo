# Operación `reservarLinea`

`reservarLinea` es una Firebase Callable Function de región `us-central1`,
habilitada únicamente en Emulator Suite.

## Solicitud

La carga acepta exactamente tres campos:

```json
{
  "jornadaLineaId": "JORNADA-PRUEBA-ETAPA-3__LINEA-PRUEBA-1",
  "dispositivoId": "ANDROID-INSTALACION-IDENTIFICADOR-FICTICIO",
  "claveIdempotencia": "reserva-clave-ficticia-0001"
}
```

Se rechazan campos adicionales. Los IDs solo admiten caracteres seguros y
límites definidos en backend y JSON Schema. La identidad procede de
`request.auth.uid`.

## Validaciones centrales

La operación comprueba, en orden seguro:

1. ejecución en emulador y proyecto `demo-*`;
2. autenticación y formato exacto;
3. existencia y estado activo del perfil;
4. resultado idempotente previo;
5. existencia y estado `ACTIVA` de la jornada;
6. autorización activa, `puedeContar` y rol central coincidente;
7. existencia y actividad de la línea de jornada;
8. estado exactamente `DISPONIBLE` y ausencia de reserva activa;
9. versión y ubicación válidas.

## Transacción

En una sola transacción Firestore se crean o modifican:

```text
reservas/{reservaId}                 crear
jornadaLineas/{jornadaLineaId}       DISPONIBLE -> EN_CONTEO, versión + 1
auditoria/{eventoId}                 crear LINEA_RESERVADA
idempotencia/{hash}                  crear resultado exacto
```

Si cualquier validación o escritura falla, nada se confirma. `reservaId` y el
evento usan UUID criptográfico. `tokenReserva` usa 32 bytes aleatorios y formato
base64url; solo su hash SHA-256 se persiste.

## Resultado

```json
{
  "reservaId": "UUID",
  "jornadaLineaId": "JORNADA-PRUEBA-ETAPA-3__LINEA-PRUEBA-1",
  "estadoCentral": "EN_CONTEO",
  "tokenReserva": "VALOR_OPACO",
  "reservadaEn": "2026-07-13T12:00:00.000Z",
  "version": 1,
  "ubicacion": {
    "vivero": "VIVERO-PRUEBA",
    "modulo": "MODULO-PRUEBA-1",
    "cama": "CAMA-PRUEBA-1",
    "linea": "LINEA-PRUEBA-1",
    "nombreVisible": "Línea ficticia 1",
    "orden": 1
  }
}
```

Campo exige el token para aceptar la respuesta, pero no lo guarda. Room conserva
solo metadatos confirmados, aislados por `usuarioId`, para restaurar la tarea.

## Idempotencia y reintentos

El ID del documento idempotente es SHA-256 de actor, operación y clave. El hash
del payload incluye línea y dispositivo.

- Misma cuenta, clave y payload: devuelve el resultado almacenado exactamente.
- Misma cuenta y clave con otro payload: `IDEMPOTENCY_CONFLICT`.
- Clave nueva para una línea ocupada: `LINE_NOT_AVAILABLE`.
- Error de red: Campo conserva la clave pendiente y la reutiliza al reintentar.

La repetición no crea una segunda reserva o auditoría ni incrementa otra vez la
versión.

## Errores controlados

Los códigos son `UNAUTHENTICATED`, `INVALID_ARGUMENT`, `USER_NOT_FOUND`,
`USER_INACTIVE`, `PERMISSION_DENIED`, `JOURNEY_NOT_FOUND`,
`JOURNEY_NOT_ACTIVE`, `JOURNEY_ACCESS_DENIED`, `JOURNEY_LINE_NOT_FOUND`,
`LINE_NOT_AVAILABLE`, `IDEMPOTENCY_CONFLICT`, `EMULATOR_ONLY` e
`INTERNAL_ERROR`. La respuesta no expone trazas, rutas, tokens ni datos de otro
usuario.
