# Decisiones vigentes — actualización ETAPA 21 FASE A

## 1. Control de decisiones

Este registro conserva los identificadores de las 50 decisiones originales para mantener trazabilidad. Una decisión puede estar:

- **RESUELTA:** ya forma parte de la especificación.
- **RESUELTA PARA EL MVP:** su tratamiento inicial está definido; un diseño futuro no bloquea el piloto.
- **PENDIENTE:** requiere información o definición adicional antes de implementar el área afectada.

Nada marcado como pendiente debe resolverse inventando datos. Cada cierre posterior debe registrar responsable, fecha y efecto sobre requisitos, datos, seguridad y pruebas.

## 2. Evidencia de la auditoría que condiciona decisiones

- El proyecto autorizado está activo, Firestore está en `nam5` y las 11 Functions existentes están en `us-central1`.
- Firebase solo tiene 11 de las 30 Callables; las 19 ausentes no se corrigen en FASE A.
- No existe registro Android para `com.arles.viverocampo` ni registro Web productivo de Maestro. Los registros explícitamente Staging son candidatos de prueba, no objetivos autorizados de borrado.
- Las 3 cuentas y los 38 documentos de nivel superior existentes no tienen evidencia inequívoca de ser ficticios; todos permanecen `REQUIERE_REVISION`. La ejecución original detectó además `autorizaciones` sin cuantificar sus documentos, que también quedan protegidos en esa clasificación.
- No hay backup programado, backup listado o PITR. Ninguna limpieza puede aprobarse antes de generar y probar un respaldo.
- Secret Manager, presupuestos y cuotas no pudieron inventariarse completamente sin habilitar APIs, permisos o herramientas adicionales. FASE A no realizó esos cambios.
- Reglas e índices Firestore coinciden con el repositorio; cualquier cambio futuro debe preservar esa trazabilidad.

Estas evidencias no resuelven datos faltantes del propietario. Sí fijan una decisión operativa: FASE B queda bloqueada hasta cerrar respaldo, recursos ambiguos, apps productivas, despliegue completo, responsables y umbrales.

## 3. Decisiones resueltas

| ID | Estado | Decisión adoptada |
|---:|---|---|
| 1 | RESUELTA | Vivero Maestro es una aplicación para Windows. |
| 2 | RESUELTA | Vivero Maestro usa Electron, React y TypeScript; Electron Builder prepara la distribución Windows. La política de actualización posterior sigue pendiente en la decisión 50. |
| 8 | RESUELTA | La unidad del inventario oficial será cada línea. |
| 9 | RESUELTA | Aprobar reemplaza la fotografía oficial de la línea con el conteo aprobado y registra un movimiento histórico con la diferencia. Ejemplo: `1000` pasa a `980` y el ajuste es `-20`. |
| 18 | RESUELTA | Un supervisor no puede aprobar su propio conteo. Un administrador puede hacerlo excepcionalmente con advertencia, motivo obligatorio y auditoría. |
| 19 | RESUELTA | La cuenta maestra tendrá rol de administrador y contará desde Vivero Campo usando el mismo flujo de reserva y envío. |
| 20 | RESUELTA | Si el autor de un conteo devuelto está ausente, supervisor o administrador puede reasignar la corrección conservando el original y su autoría. |
| 22 | RESUELTA | Existen `BORRADOR`, `ACTIVA`, cierre, cancelación controlada de borrador y reapertura exclusiva de borradores cancelados; no se reabren jornadas activadas o cerradas. |
| 25 | RESUELTA PARA EL MVP | Una línea abandonada solo se libera manualmente por supervisor o administrador, con motivo y auditoría. |
| 26 | RESUELTA PARA EL MVP | Las reservas no tienen vencimiento automático durante el MVP. |
| 28 | RESUELTA PARA EL MVP | No se implementará reserva anticipada de bloques hasta medir la calidad real de la señal. |
| 29 | RESUELTA PARA EL MVP | La verificación adicional queda fuera del primer MVP; el revisor solo puede aprobar o devolver. |
| 30 | RESUELTA | `ENVIADA` es un estado local de sincronización. Firestore cambia la línea directamente de `EN_CONTEO` a `PENDIENTE_REVISION` en una sola transacción. |
| 38 | RESUELTA | No existe un envío central huérfano en estado `ENVIADA`; una respuesta perdida se recupera con la misma clave idempotente. |
| 39 | RESUELTA PARA EL MVP | El contrato de paquete, preflight, importación atómica y reversión condicionada están implementados para datos ficticios; fuentes y datos reales siguen pendientes. |
| 41 | RESUELTA | Desarrollo usa Emulator Suite con proyectos `demo-*`; producción usará únicamente `viverocontrol-3f83f`, Firestore `nam5` y Functions `us-central1`. No existe un tercer ambiente funcional. |

## 4. Información real prioritaria para cerrar

Antes de preparar FASE B se necesita recibir:

1. **Jerarquía exacta del vivero:** estructura y relaciones entre ubicaciones.
2. **Cantidad de módulos, camas y líneas:** sin inventar nombres ni volúmenes.
3. **Calidad real de la señal:** cobertura, zonas sin conexión y duración aproximada de interrupciones.
4. **Celulares de campo:** modelos y versiones de Android.
5. **Usuarios iniciales:** cantidad, responsables y rol requerido.
6. **Datos anteriores que deben conservarse:** fuentes, formatos, calidad y alcance histórico.

Estos datos corresponden principalmente a las decisiones 6, 13, 24, 37 y 39. La jerarquía y las cantidades se solicitan por separado aunque pertenecen al mismo bloque de estructura.

## 5. Decisiones que continúan pendientes

### Producto e implementación

3. **Alcance administrativo del primer piloto:** determinar qué gestión mínima de usuarios, ubicaciones, auditoría y mantenimiento debe estar presente.
4. **Diseño visual detallado:** precisar componentes, accesibilidad, tamaños y adaptación de la identidad verde sin copiar código antiguo.
5. **Indicadores del piloto:** establecer criterios cuantitativos de rendimiento, confiabilidad y adopción cuando existan datos operativos.

### Estructura real e inventario

6. **Estructura completa del vivero:** suministrar jerarquía, módulos, camas, líneas, códigos, nombres, relaciones y cantidades reales.
7. **Reglas de identidad:** definir unicidad, nomenclatura, orden y tratamiento de ubicaciones inactivas o reorganizadas.
10. **Inventario inicial:** determinar fuente, fecha de corte, responsable y validación.
11. **Conteo total cero:** decidir si se permite directamente, exige observación o requiere otro control.
12. **Límites operativos:** definir rangos máximos realistas para hembras, machos, patrones y longitud de observaciones.

### Usuarios, autenticación y permisos

13. **Usuarios iniciales:** suministrar cantidad, cuentas requeridas y rol de cada persona.
14. **Método de autenticación:** elegir correo, teléfono, proveedor corporativo u otro método compatible con Firebase Authentication.
15. **Alta y recuperación de cuentas:** definir quién crea usuarios, cómo se entrega el acceso y cómo se recupera o bloquea una cuenta.
16. **Autorización de jornadas:** decidir quién añade o retira usuarios de una jornada y si los supervisores pueden delegar ese acceso.
17. **Alcance por ubicación:** confirmar si además de la jornada habrá restricciones por módulo, cama u otra zona.
21. **Registro de dispositivos:** decidir si los dispositivos requieren aprobación, pueden compartirse y cómo se bloquean o sustituyen.

### Jornada y operación

23. **Política de cierre:** establecer si se permite cierre excepcional con líneas no aprobadas y cómo quedan registradas.
24. **Calidad y cobertura de señal:** medir zonas, duración de interrupciones y capacidad real de los dispositivos.
27. **Actividad visible:** determinar qué evento central actualiza el último contacto mostrado al supervisor, sin usarlo para vencimiento automático.
31. **Observaciones obligatorias:** establecer en qué devoluciones, ceros, diferencias u otros casos se exige una explicación.
32. **Comparación de conteos:** definir qué alertas se muestran cuando una versión difiere de otra o del inventario oficial, sin promediar automáticamente.

### Tiempo y datos locales

33. **Zona horaria de presentación:** confirmar la zona horaria operativa aunque el almacenamiento central use una referencia uniforme.
34. **Diferencia de reloj:** definir el umbral de advertencia y si alguna discrepancia debe bloquear el envío.
35. **Retención de borradores locales:** decidir cuánto se conservan conteos enviados, erróneos, liberados o pertenecientes a usuarios que cerraron sesión.
36. **Protección local:** definir requisitos de cifrado, bloqueo de pantalla y manejo de tokens en los celulares reales.
37. **Compatibilidad Android:** suministrar modelos, versiones de Android y restricciones de los dispositivos de campo.

### Migración y ambientes

39. **Datos anteriores que deben conservarse:** identificar fuentes, formatos, calidad, propietarios y alcance histórico.
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
