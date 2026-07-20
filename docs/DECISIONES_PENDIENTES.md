# Decisiones vigentes — preparación de FASE B de la ETAPA 21

> **Actualización FASE B1 — 17 de julio de 2026:** el propietario clasificó como prueba y eliminó manualmente las 3 cuentas Authentication y los 41 documentos Firestore inventariados. Las capturas posteriores muestran Authentication sin usuarios y Firestore sin colecciones visibles. La renuncia al backup aplica solo a ese conjunto eliminado; la política de respaldo para datos reales continúa pendiente. Véase `ETAPA_21_FASE_B1_LIMPIEZA_MANUAL.md`.

> **Actualización ETAPA 22 — 17 de julio de 2026:** los cinco bloques de datos reales quedaron completos y validados localmente bajo `.private/`; se generó un paquete privado sin validarlo ni importarlo contra Firebase. Los valores identificables y las cantidades no se publican.

> **Actualización ETAPA 27A/27B — 20 de julio de 2026:** PITR, protección contra eliminación y el programa de backup diario quedaron activos. La comprobación única autorizada encontró un backup todavía no `READY`; no se realizó restauración. OAuth, Secret Manager, IAM dedicado, despliegue y prueba de Drive continúan pendientes.

## 1. Control de decisiones

Este registro conserva los identificadores de las 50 decisiones originales para mantener trazabilidad. Una decisión puede estar:

- **RESUELTA:** ya forma parte de la especificación.
- **RESUELTA PARA EL MVP:** su tratamiento inicial está definido; un diseño futuro no bloquea el piloto.
- **PENDIENTE:** requiere información o definición adicional antes de implementar el área afectada.

Nada marcado como pendiente debe resolverse inventando datos. Cada cierre posterior debe registrar responsable, fecha y efecto sobre requisitos, datos, seguridad y pruebas.

## 2. Evidencia de la clasificación privada que condiciona decisiones

- El proyecto autorizado está activo, Firestore está en `nam5` y las 11 Functions existentes están en `us-central1`.
- Firebase solo tiene 11 de las 30 Callables; las 19 ausentes no se corrigen en FASE A.
- No existe registro Android para `com.arles.viverocampo` ni registro Web productivo de Maestro. Los dos registros explícitamente Staging son `CANDIDATO_ELIMINACION_FUTURA`; el Android heredado sigue `REQUIERE_REVISION`. Ninguno está autorizado para borrado.
- Las 3 cuentas tienen perfil y referencias operativas; las tres permanecen `REQUIERE_REVISION` hasta decisión individual del propietario.
- Firestore tiene 12 grupos y 41 documentos: 38 de nivel superior y 3 anidados. Los 41 permanecen `REQUIERE_REVISION`, incluso los 20 que muestran marcadores de prueba.
- Los 5 principales IAM administrativos permanecen `REQUIERE_REVISION`. Las 11 Functions se conservan hasta reemplazo controlado y los 2 buckets técnicos se conservan.
- No hay backup programado, backup listado o PITR. Ninguna limpieza puede aprobarse antes de generar y probar un respaldo.
- Secret Manager, presupuestos y cuotas no pudieron inventariarse completamente sin habilitar APIs, permisos o herramientas adicionales. FASE A no realizó esos cambios.
- Reglas e índices Firestore coinciden con el repositorio; cualquier cambio futuro debe preservar esa trazabilidad.

Estas evidencias corresponden al estado previo a FASE B1. Posteriormente, el propietario clasificó las 3 cuentas y los 41 documentos como datos de prueba, renunció al backup de ese conjunto y los eliminó manualmente. La ETAPA 22 completó de forma privada los datos reales y responsables requeridos para la preparación local. PITR, protección contra eliminación y backup diario ya están activos; el primer backup disponible y un procedimiento de restauración probado fuera de producción siguen bloqueando el uso de datos reales.

## 3. Decisiones resueltas

| ID | Estado | Decisión adoptada |
|---:|---|---|
| 1 | RESUELTA | Vivero Maestro es una aplicación para Windows. |
| 2 | RESUELTA | Vivero Maestro usa Electron, React y TypeScript; Electron Builder prepara la distribución Windows. La política de actualización posterior sigue pendiente en la decisión 50. |
| 6 | RESUELTA | La estructura real y sus relaciones quedaron aprobadas en el conjunto privado de la ETAPA 22. |
| 8 | RESUELTA | La unidad del inventario oficial será cada línea. |
| 9 | RESUELTA | Aprobar reemplaza la fotografía oficial de la línea con el conteo aprobado y registra un movimiento histórico con la diferencia. Ejemplo: `1000` pasa a `980` y el ajuste es `-20`. |
| 10 | RESUELTA | Fuente, corte, responsable e inventario inicial quedaron validados en privado; una línea vacía exige confirmación explícita. |
| 13 | RESUELTA | Usuarios iniciales, roles y capacidades quedaron definidos en privado. |
| 15 | RESUELTA | La responsabilidad de crear cuentas y entregar accesos quedó definida en privado. |
| 18 | RESUELTA | Un supervisor no puede aprobar su propio conteo. Un administrador puede hacerlo excepcionalmente con advertencia, motivo obligatorio y auditoría. |
| 19 | RESUELTA | La cuenta maestra tendrá rol de administrador y contará desde Vivero Campo usando el mismo flujo de reserva y envío. |
| 20 | RESUELTA | Si el autor de un conteo devuelto está ausente, supervisor o administrador puede reasignar la corrección conservando el original y su autoría. |
| 22 | RESUELTA | Existen `BORRADOR`, `ACTIVA`, cierre, cancelación controlada de borrador y reapertura exclusiva de borradores cancelados; no se reabren jornadas activadas o cerradas. |
| 24 | RESUELTA PARA EL MVP | La cobertura por zona quedó clasificada en privado; Campo debe operar offline fuera del alcance de red y sincronizar al recuperarla. |
| 25 | RESUELTA PARA EL MVP | Una línea abandonada solo se libera manualmente por supervisor o administrador, con motivo y auditoría. |
| 26 | RESUELTA PARA EL MVP | Las reservas no tienen vencimiento automático durante el MVP. |
| 28 | RESUELTA PARA EL MVP | No se implementará reserva anticipada de bloques hasta medir la calidad real de la señal. |
| 29 | RESUELTA PARA EL MVP | La verificación adicional queda fuera del primer MVP; el revisor solo puede aprobar o devolver. |
| 30 | RESUELTA | `ENVIADA` es un estado local de sincronización. Firestore cambia la línea directamente de `EN_CONTEO` a `PENDIENTE_REVISION` en una sola transacción. |
| 38 | RESUELTA | No existe un envío central huérfano en estado `ENVIADA`; una respuesta perdida se recupera con la misma clave idempotente. |
| 37 | RESUELTA PARA EL MVP | El inventario privado de dispositivos y compatibilidad Android quedó registrado; los equipos variables se mantienen dentro del perfil Android declarado. |
| 39 | RESUELTA PARA EL MVP | El propietario cerró la decisión histórica y el paquete privado de catálogo e inventario quedó generado y validado localmente, aún sin importación remota. |
| 41 | RESUELTA | Desarrollo usa Emulator Suite con proyectos `demo-*`; producción usará únicamente `viverocontrol-3f83f`, Firestore `nam5` y Functions `us-central1`. No existe un tercer ambiente funcional. |

## 4. Información real cerrada en privado

La ETAPA 22 recibió y validó en bloques privados:

1. **Jerarquía exacta del vivero:** estructura y relaciones entre ubicaciones.
2. **Cantidad de módulos, camas y líneas:** sin inventar nombres ni volúmenes.
3. **Calidad real de la señal:** cobertura, zonas sin conexión y duración aproximada de interrupciones.
4. **Celulares de campo:** modelos y versiones de Android.
5. **Usuarios iniciales:** cantidad, responsables y rol requerido.
6. **Datos anteriores que deben conservarse:** fuentes, formatos, calidad y alcance histórico.

Estos datos cerraron las decisiones 6, 10, 13, 15, 24, 37 y 39 para la preparación local. No sustituyen el preflight remoto ni autorizan el corte.

## 5. Decisiones que continúan pendientes

### Producto e implementación

3. **Alcance administrativo del primer piloto:** determinar qué gestión mínima de usuarios, ubicaciones, auditoría y mantenimiento debe estar presente.
4. **Diseño visual detallado:** precisar componentes, accesibilidad, tamaños y adaptación de la identidad verde sin copiar código antiguo.
5. **Indicadores del piloto:** establecer criterios cuantitativos de rendimiento, confiabilidad y adopción cuando existan datos operativos.

### Estructura real e inventario

7. **Reglas de identidad:** definir unicidad, nomenclatura, orden y tratamiento de ubicaciones inactivas o reorganizadas.
11. **Conteo total cero:** decidir si se permite directamente, exige observación o requiere otro control.
12. **Límites operativos:** definir rangos máximos realistas para hembras, machos, patrones y longitud de observaciones.

### Usuarios, autenticación y permisos

14. **Método de autenticación:** elegir correo, teléfono, proveedor corporativo u otro método compatible con Firebase Authentication.
16. **Autorización de jornadas:** decidir quién añade o retira usuarios de una jornada y si los supervisores pueden delegar ese acceso.
17. **Alcance por ubicación:** confirmar si además de la jornada habrá restricciones por módulo, cama u otra zona.
21. **Registro de dispositivos:** decidir si los dispositivos requieren aprobación, pueden compartirse y cómo se bloquean o sustituyen.

### Jornada y operación

23. **Política de cierre:** establecer si se permite cierre excepcional con líneas no aprobadas y cómo quedan registradas.
27. **Actividad visible:** determinar qué evento central actualiza el último contacto mostrado al supervisor, sin usarlo para vencimiento automático.
31. **Observaciones obligatorias:** establecer en qué devoluciones, ceros, diferencias u otros casos se exige una explicación.
32. **Comparación de conteos:** definir qué alertas se muestran cuando una versión difiere de otra o del inventario oficial, sin promediar automáticamente.

### Tiempo y datos locales

33. **Zona horaria de presentación:** confirmar la zona horaria operativa aunque el almacenamiento central use una referencia uniforme.
34. **Diferencia de reloj:** definir el umbral de advertencia y si alguna discrepancia debe bloquear el envío.
35. **Retención de borradores locales:** decidir cuánto se conservan conteos enviados, erróneos, liberados o pertenecientes a usuarios que cerraron sesión.
36. **Protección local:** definir requisitos de cifrado, bloqueo de pantalla y manejo de tokens en los celulares reales.

### Migración y ambientes

40. **Correspondencia con el sistema anterior:** definir qué catálogos o inventarios son confiables y cómo se validarán; no se copiarán automáticamente.
42. **Acceso a ambientes:** definir quién administra credenciales, despliegues y reglas; los secretos no deben guardarse en Git.
43. **Datos de prueba:** establecer un conjunto ficticio autorizado que no exponga producción ni se confunda con valores reales.
44. **Plan de corte y reversión:** decidir cómo se pasará del sistema actual al nuevo después de validar el MVP.

### Auditoría, respaldo y operación

45. **Retención de auditoría:** definir plazo, acceso, exportación y tratamiento de datos personales.
46. **Copias de seguridad:** fijar frecuencia, retención, responsable, cifrado y pruebas de restauración.
47. **Mantenimiento:** definir procedimiento para corregir datos sin editar historia silenciosamente.
48. **Datos visibles entre usuarios:** determinar qué información del titular de una reserva puede mostrarse a otros auxiliares.
49. **Monitoreo y alertas:** definir responsables y canales para fallos de sincronización, líneas bloqueadas y errores de aprobación.
50. **Política de versiones:** establecer versiones mínimas admitidas y cómo se obliga a actualizar clientes incompatibles.

## 6. Puntos que ya no constituyen ambigüedad

- `ENVIADA` y `PENDIENTE_REVISION` pertenecen a ámbitos distintos: dispositivo local y estado central, respectivamente.
- La verificación adicional no forma parte del MVP.
- La autorrevisión solo se permite al administrador como excepción controlada.
- Una corrección puede reasignarse sin modificar la autoría del original.
- La aprobación reemplaza la fotografía oficial de la línea y registra la diferencia como movimiento histórico.
- Maestro ya tiene tecnología definida: Electron, React y TypeScript.
- Importación y reversión controlada existen; todavía no se han usado con paquetes o datos reales.
- Los estados de jornada implementados no autorizan cierre forzado, cancelación de activas ni reapertura histórica.
- La ETAPA 20 prepara código de producción, pero no constituye un despliegue ni una puesta en operación.

La auditoría sí identificó diferencias operativas entre el contrato y Firebase: despliegue parcial de Functions, registros productivos ausentes y datos sin clasificación. Son bloqueos de preparación, no autorización para alterar alcance funcional o eliminar recursos.
