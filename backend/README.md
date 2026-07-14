# Backend local de Vivero Control

Backend de la ETAPA 4 para Firebase Emulator Suite. Exporta `reservarLinea` y `enviarConteo`, reglas de acceso mínimo y un seed enteramente ficticio. No contiene proyecto real, credenciales ni despliegue.

`enviarConteo` valida identidad y autorización centrales, token por hash, reserva, dispositivo, línea y cantidades. Una transacción crea el conteo inmutable, consume la reserva, cambia la línea a `PENDIENTE_REVISION`, audita y persiste el resultado idempotente. No escribe inventario oficial.

## Requisitos y ejecución

Desde `backend/functions`:

```powershell
npm ci
npm run build
npm run emulators:start
```

Con los emuladores activos, `npm run emulator:seed` restablece datos ficticios. El proyecto permitido es `demo-vivero-control-etapa3`; seed y Functions se niegan a operar fuera de un `demo-*` local.

## Verificación

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

La prueba integrada reserva antes de enviar y cubre autorización, atomicidad, idempotencia, concurrencia, reglas y ausencia de inventario. Las alertas moderadas transitivas están registradas en [Dependencias y riesgos](../docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md).
