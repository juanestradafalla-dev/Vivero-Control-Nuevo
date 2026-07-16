# Inventario inicial controlado — ETAPA 17

## Alcance

`registrarInventarioInicial` crea la primera fotografía oficial de una línea únicamente en Firebase Emulator Suite. Solo un perfil central activo con rol `ADMINISTRADOR` puede ejecutarla. La solicitud no acepta identidad, rol, total, estado, jornada ni hora del cliente.

## Transacción

La operación vuelve a leer perfil, línea, versión, ocupación, inventario e historial operativo. Rechaza líneas inactivas, inventario existente, versiones obsoletas, total cero y cualquier reserva, conteo, decisión, corrección o movimiento previo. Una línea de jornada activa solo es elegible si permanece `DISPONIBLE` y sin referencias operativas.

En una sola transacción crea:

- `inventarioOficialLineas/{lineaId}` con versión 1, total central y origen `CARGA_INICIAL_ADMINISTRATIVA_EMULADOR`;
- `cargasInventarioInicial/{lineaId}` como trazabilidad inmutable;
- auditoría `INVENTARIO_INICIAL_REGISTRADO`;
- resultado idempotente `REGISTRAR_INVENTARIO_INICIAL`.

No crea un movimiento porque no existe fotografía anterior. Una aprobación posterior reemplaza la fotografía oficial, incrementa a versión 2 y crea el movimiento normal desde los valores iniciales; la carga inicial permanece intacta.

## Datos y decisiones pendientes

Todas las cifras son ficticias. La fuente real, fecha de corte, inventario productivo, importación y migración siguen pendientes. Nunca se supone inventario cero. Corregir una carga inicial requerirá un flujo futuro, separado y auditado.
