# Contratos compartidos

Los JSON Schema Draft 2020-12 son el lenguaje común de Campo, Maestro y backend.

La ETAPA 4 agrega `send-count-request.schema.json` y `send-count-result.schema.json`, amplía el registro idempotente con `ENVIAR_CONTEO` y formaliza el conteo inmutable, la reserva `CONSUMIDA` y los estados locales `PENDIENTE`, `SINCRONIZANDO`, `ENVIADA` y `ERROR`.

Reglas de frontera:

- `total` nunca forma parte de la solicitud: lo calcula el servidor;
- identidad, rol, jornada, línea, estado central y hora de servidor no se aceptan del cliente;
- `ENVIADA` es exclusivamente local y nunca es un estado de `jornadaLineas`;
- un conteo aceptado es inmutable;
- `PENDIENTE_REVISION` no crea ni modifica inventario oficial;
- el token de reserva no aparece en resultados ni registros idempotentes.

Los ejemplos ficticios están en `examples/etapa-04/`, incluidos casos válidos, total cero y un payload inválido que intenta enviar `total`.

```powershell
npm ci
npm run validate
npm test
```

La validación compila todos los esquemas con Ajv 2020 y las pruebas comprueban referencias, propiedades adicionales e invariantes aritméticas. No existe generación automática de DTO: cualquier cambio debe actualizar esquema, ejemplo y pruebas juntos.
