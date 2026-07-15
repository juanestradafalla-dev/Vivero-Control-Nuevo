# Criterios de aceptación — ETAPA 13

- [x] `cerrarJornada` acepta solo jornada, versión esperada y clave idempotente.
- [x] Supervisor activo cierra únicamente jornadas propias; administrador cualquiera; auxiliar ninguna.
- [x] Se exige jornada `ACTIVA`, versión exacta y todas las líneas `APROBADA`.
- [x] Estados pendientes, reservas, correcciones y reasignaciones bloquean íntegramente el cierre.
- [x] Jornada, líneas, autorizaciones, ocupaciones, auditoría e idempotencia cambian en una única transacción.
- [x] Líneas y autorizaciones quedan inactivas pero conservadas con su estado e historia.
- [x] Se liberan exactamente las ocupaciones pertenecientes a la jornada.
- [x] Conteos, decisiones, inventarios, movimientos, reservas y selecciones preparatorias permanecen intactos.
- [x] El máximo combinado de 200 mantiene el cierre bajo el límite técnico sin lotes parciales.
- [x] La misma clave y payload recuperan el resultado; otro payload produce `IDEMPOTENCY_CONFLICT`.
- [x] Dos cierres concurrentes producen un solo efecto.
- [x] Las carreras contra reservar, enviar, aprobar, devolver y liberar nunca dejan cierre parcial.
- [x] Maestro muestra permisos, resumen, bloqueos exactos y confirmación explícita.
- [x] Tras el éxito Maestro retira la jornada activa y refresca el catálogo.
- [x] Campo limpia una selección cerrada sin borrar historial local y conserva trabajo inesperado.
- [x] Las reglas niegan escrituras directas críticas.
- [x] Todo opera solo con emuladores y datos ficticios, sin Firebase real ni despliegue.

## Exclusiones confirmadas

No se implementan cierre forzado o excepcional; cancelación, reapertura o eliminación; edición de jornadas cerradas; modificación histórica; usuarios, roles, ubicaciones o líneas; inicialización o migración de inventario; Firebase real; despliegues; APK ni instalador.
