# Backend local de Vivero Control

Backend de la Etapa 6 para Firebase Emulator Suite. Exporta `reservarLinea`, `enviarConteo`, `iniciarCorreccionConteo`, `aprobarConteo` y `devolverConteo`. No contiene proyecto real, credenciales ni despliegue.

`aprobarConteo` crea una decisión, reemplaza el inventario oficial, registra un movimiento, cambia la línea a `APROBADA`, audita y persiste el resultado idempotente en una sola transacción. `devolverConteo` crea decisión y auditoría, cambia la línea a `DEVUELTA` y no toca inventario.

`iniciarCorreccionConteo` solo acepta al autor vigente, crea una reserva `CORRECCION`, guarda el hash del token y cambia `DEVUELTA` a `EN_CONTEO`. `enviarConteo` reconoce esa reserva, crea `versionNumero + 1`, enlaza `conteoAnteriorId` y vuelve a `PENDIENTE_REVISION` sin modificar inventario.

El seed repetible crea tres inventarios ficticios y se niega a ejecutar si el proyecto no comienza por `demo-`. Las Functions exigen además `FUNCTIONS_EMULATOR=true`.

```powershell
Set-Location backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

La prueba integrada reserva y envía antes de revisar. Cubre atomicidad, autorrevisión, idempotencia, concurrencia, rollback y reglas. Los riesgos de dependencias están en [Dependencias y riesgos](../docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md).
