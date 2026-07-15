# Criterios de aceptación — ETAPA 12

- [x] `activarJornada` acepta únicamente jornada, tres versiones observadas y clave idempotente.
- [x] Supervisor activa solo un borrador propio; administrador cualquiera; auxiliar ninguno.
- [x] La transacción vuelve a leer y valida jornada, selecciones, perfiles, roles y líneas.
- [x] Se exige al menos una línea, una persona que pueda contar y un revisor supervisor o administrador.
- [x] El máximo combinado es 200 y su exceso no produce lotes ni escrituras parciales.
- [x] Cada línea se materializa en `DISPONIBLE`, sin reserva, con versión 0 y fotografía de ubicación.
- [x] Las autorizaciones usan nombre, estado y rol centrales.
- [x] `ocupacionesLineasActivas/{lineaId}` impide doble pertenencia activa y la concurrencia tiene un solo ganador.
- [x] Jornada, auditoría y resultado idempotente se confirman en la misma transacción.
- [x] La misma clave y payload recuperan exactamente el resultado; otro payload entra en conflicto.
- [x] Las selecciones preparatorias se conservan sin modificación.
- [x] Las reglas niegan escrituras críticas y lectura directa de los bloqueos.
- [x] Maestro bloquea información incompleta, resume el efecto y confirma explícitamente.
- [x] Después del éxito Maestro retira el borrador y refresca las jornadas activas.
- [x] Participantes seleccionados ven la jornada en Campo y usuarios no seleccionados no la ven.
- [x] Inventario oficial y movimientos permanecen sin cambios.
- [x] Todo opera solo con emuladores y datos ficticios, sin despliegue ni credenciales reales.

## Exclusiones confirmadas

No se implementan cierre, cancelación, reapertura, eliminación o modificación de jornadas activas; creación o edición de usuarios, roles, ubicaciones o líneas; inicialización o migración de inventario; Firebase real; despliegues; APK ni instalador.
