# Criterios de aceptación — Etapa 5

- [x] `main` de partida contiene `0f2ac559c822ac282982787a906f11a25deba9e5`.
- [x] Campo finaliza un envío, conserva historial y permite tomar otra línea.
- [x] Una reserva consumida no se restaura como activa.
- [x] Maestro muestra bandeja, inventario y diferencias sin editar el conteo.
- [x] Auxiliar no revisa; supervisor y administrador requieren autorización central.
- [x] Supervisor no aprueba su propio conteo.
- [x] Administrador autor requiere advertencia y motivo auditado.
- [x] Devolución exige motivo.
- [x] Aprobación y devolución son Callables emulator-only e idempotentes.
- [x] Aprobación reemplaza inventario y crea un movimiento dentro de una transacción.
- [x] Inventario inexistente rechaza sin asumir cero ni escribir parcialmente.
- [x] Devolución no modifica inventario ni crea movimiento.
- [x] Conteo original permanece inmutable.
- [x] Concurrencia confirma exactamente una decisión y una transición.
- [x] Reglas niegan escrituras críticas directas.
- [x] Seed repetible contiene únicamente inventario ficticio documentado.
- [x] Contratos, Android, Maestro, backend, reglas y emuladores tienen cobertura automática.
- [x] No existe Firebase real, credencial, despliegue, APK ni instalador versionado.

## Pendiente para etapas posteriores

- corrección y nueva versión después de `DEVUELTA`;
- reasignación y liberación;
- datos y jerarquía reales;
- dispositivos y señal reales;
- política productiva, migración y Firebase de producción.
