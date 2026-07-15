# Criterios de aceptación — ETAPA 14

- [x] `cancelarJornadaBorrador` acepta solo jornada, versión, motivo y clave idempotente.
- [x] `reabrirJornadaCancelada` acepta solo jornada, versión y clave idempotente.
- [x] Supervisor activo administra exclusivamente borradores propios; administrador cualquiera; auxiliar ninguno.
- [x] Solo `BORRADOR` puede cancelarse y solo `INACTIVA / CANCELACION_BORRADOR` puede reabrirse.
- [x] Jornadas activadas o cerradas normalmente nunca se reabren como borrador.
- [x] Cancelar exige motivo válido de hasta 2.000 caracteres y versión exacta.
- [x] Cancelar rechaza cualquier línea operativa, autorización, reserva u ocupación existente.
- [x] Las selecciones de líneas y participantes se conservan exactamente.
- [x] Cada cancelación queda en un documento inmutable y la reapertura preserva su identificador.
- [x] Ambas operaciones son transaccionales, auditadas e idempotentes.
- [x] Misma clave y payload recuperan el resultado; otro payload produce `IDEMPOTENCY_CONFLICT`.
- [x] Cancelar contra activar o editar produce exactamente un ganador y cero escrituras parciales.
- [x] Maestro separa borradores editables y cancelados y muestra los cancelados en modo lectura.
- [x] Maestro exige resumen, motivo y confirmación explícita antes de cancelar.
- [x] Reabrir devuelve la jornada a borradores editables sin crear datos operativos.
- [x] Campo permanece sin cambios y nunca muestra borradores o cancelados.
- [x] Inventario, movimientos, conteos, decisiones e historial permanecen intactos.
- [x] Las reglas niegan lecturas y escrituras directas de cancelaciones y datos preparatorios.
- [x] Todo opera exclusivamente con emuladores y datos ficticios, sin despliegue.

## Exclusiones confirmadas

No se implementan reapertura de jornadas activadas o cerradas; cancelación de jornadas activas; eliminación definitiva; cierre forzado; edición histórica; usuarios, roles, ubicaciones o líneas; inventario inicial o migración; Firebase real; despliegues; APK ni instalador.
