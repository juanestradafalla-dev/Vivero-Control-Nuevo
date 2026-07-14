# Operación `enviarConteo`

## Frontera

Callable Function disponible solo si `FUNCTIONS_EMULATOR=true` y el proyecto comienza por `demo-`.

Solicitud exacta:

```json
{
  "reservaId": "...",
  "tokenReserva": "...",
  "dispositivoId": "...",
  "hembras": 450,
  "machos": 320,
  "patrones": 210,
  "observaciones": "Opcional",
  "timestampDispositivo": "2026-07-13T20:00:00.000Z",
  "claveIdempotencia": "..."
}
```

Se rechaza cualquier propiedad adicional, incluidos actor, rol, jornada, línea, `total`, hora de servidor y estado central. La identidad procede exclusivamente de Authentication.

## Validaciones

La función valida perfil activo, rol vigente, autorización para contar, jornada activa, reserva activa y titular, dispositivo, comparación segura del hash del token, línea y reserva activa coincidentes, estado `EN_CONTEO`, cantidades enteras no negativas dentro del rango seguro JavaScript, suma segura, observaciones de hasta 4.000 caracteres y clave idempotente válida.

El límite de observaciones protege transporte y almacenamiento; no resuelve el límite operativo. El conteo cero se acepta técnicamente y su política sigue pendiente.

## Transacción atómica

Una única transacción:

1. crea `conteos/{conteoId}` inmutable y calcula `total`;
2. asigna versión de conteo 1 y anterior nulo;
3. consume la reserva y registra hora central;
4. cambia la línea a `PENDIENTE_REVISION`, enlaza el conteo, limpia la reserva activa e incrementa una versión;
5. crea auditoría `CONTEO_ENVIADO`;
6. crea el resultado idempotente.

Si falla una precondición no hay escrituras parciales. La operación no consulta ni escribe inventario oficial.

## Idempotencia y concurrencia

- misma cuenta, clave y payload: devuelve el mismo resultado;
- misma clave con payload diferente: `IDEMPOTENCY_CONFLICT`;
- dos claves para una reserva: una transacción gana y la otra recibe un error controlado;
- una respuesta perdida se recupera reenviando payload y clave congelados;
- nunca se duplica conteo, auditoría, consumo ni incremento de versión.

## Resultado

Incluye conteo, línea, `PENDIENTE_REVISION`, cantidades, total calculado, versiones y `recibidoEn`. Nunca incluye `tokenReserva`.
