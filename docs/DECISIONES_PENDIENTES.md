# Decisiones pendientes

## 1. Regla de uso

Nada de esta lista debe resolverse inventando datos durante la implementación. Cada decisión debe registrar responsable, fecha, alternativas consideradas y efecto sobre requisitos, datos, seguridad y pruebas.

## 2. Producto y plataforma

1. **Plataforma definitiva de Vivero Maestro:** confirmar si será una aplicación de escritorio nativa, web instalable, Electron u otra alternativa, y cuáles versiones de Windows debe soportar.
2. **Tecnología de Vivero Maestro:** definir framework, distribución, actualizaciones y funcionamiento ante pérdida de conexión.
3. **Alcance administrativo del primer piloto:** determinar qué gestión mínima de usuarios, ubicaciones, auditoría y mantenimiento debe estar presente antes de pilotear.
4. **Diseño visual detallado:** precisar componentes, accesibilidad, tamaños y adaptación de la identidad verde sin copiar código ni formularios antiguos.
5. **Indicadores del piloto:** establecer criterios cuantitativos de rendimiento, confiabilidad y adopción cuando existan datos operativos.

## 3. Estructura real del vivero e inventario

6. **Estructura completa del vivero:** suministrar módulos, camas, líneas, jerarquía, códigos, nombres y relaciones reales.
7. **Reglas de identidad:** definir unicidad, nomenclatura, orden y tratamiento de ubicaciones inactivas o reorganizadas.
8. **Granularidad del inventario oficial:** confirmar si la unidad oficial es la línea u otra combinación de ubicación y clasificación.
9. **Política de aprobación:** decidir si un conteo aprobado reemplaza una fotografía completa de la línea o genera un movimiento con otra semántica.
10. **Inventario inicial:** determinar su fuente, fecha de corte, responsable y validación.
11. **Conteo total cero:** decidir si se permite directamente, exige observación o requiere verificación.
12. **Límites operativos:** definir rangos máximos realistas para hembras, machos, patrones y longitud de observaciones.

## 4. Usuarios, autenticación y permisos

13. **Cantidad y lista de usuarios:** no se ha suministrado cuántas cuentas existirán ni quiénes las usarán.
14. **Método de autenticación:** elegir correo, teléfono, proveedor corporativo u otro método compatible con Firebase Authentication.
15. **Alta y recuperación de cuentas:** definir quién crea usuarios, cómo se entrega el acceso y cómo se recupera o bloquea una cuenta.
16. **Autorización de jornadas:** decidir quién añade o retira usuarios de una jornada y si los supervisores pueden delegar ese acceso.
17. **Alcance por ubicación:** confirmar si además de la jornada habrá restricciones por módulo, cama u otra zona.
18. **Separación de funciones:** decidir si un supervisor o administrador puede aprobar un conteo realizado por sí mismo.
19. **Cuenta maestra:** confirmar si corresponde al rol supervisor, administrador o a ambos; no se creará un rol adicional sin aprobación.
20. **Reasignación de correcciones:** definir qué ocurre cuando el autor de un conteo devuelto no está disponible.
21. **Registro de dispositivos:** decidir si los dispositivos requieren aprobación, pueden compartirse y cómo se bloquean o sustituyen.

## 5. Jornada, reservas y revisión

22. **Estados administrativos de jornada:** definir borrador, activación, cierre, cancelación, reapertura y transiciones autorizadas.
23. **Política de cierre:** establecer si se permite cierre excepcional con líneas no aprobadas y cómo quedan registradas.
24. **Calidad y cobertura de señal:** medir las zonas, duración de interrupciones y capacidad real de los dispositivos.
25. **Política de liberación de líneas:** definir el tiempo o condiciones de abandono, avisos previos, contacto con el auxiliar y recuperación.
26. **Expiración de reservas:** decidir si existe vencimiento automático o solo liberación supervisada.
27. **Actividad válida:** determinar qué evento central actualiza el último contacto sin permitir reservas indefinidas artificialmente.
28. **Reserva anticipada de bloques:** decidir si se usará, cuántas líneas como máximo, duración, devolución, equidad y control. Se documenta, pero no se implementa todavía.
29. **Flujo de verificación:** definir quién verifica, cómo se asigna, si requiere un nuevo conteo, qué estados o atributos usa y cómo vuelve a revisión.
30. **Relación entre `ENVIADA` y `PENDIENTE_REVISION`:** confirmar si ambos estados serán visibles al usuario o si `ENVIADA` será un estado técnico transitorio y reconciliable.
31. **Observaciones obligatorias:** establecer en qué devoluciones, ceros, diferencias u otros casos se exige una explicación.
32. **Comparación de conteos:** definir qué alertas se muestran cuando una versión difiere de otra o del inventario oficial, sin promediar automáticamente.

## 6. Tiempo, sincronización y datos locales

33. **Zona horaria de presentación:** confirmar la zona horaria operativa y reglas para cambios, aunque el almacenamiento central use una referencia uniforme.
34. **Diferencia de reloj:** definir el umbral de advertencia y si alguna discrepancia debe bloquear el envío.
35. **Retención de borradores locales:** decidir cuánto se conservan conteos enviados, erróneos, liberados o pertenecientes a usuarios que cerraron sesión.
36. **Protección local:** definir requisitos de cifrado, bloqueo de pantalla y manejo de tokens en los celulares reales.
37. **Compatibilidad Android:** suministrar versiones de Android, modelos y restricciones de los dispositivos de campo.
38. **Recuperación de envíos huérfanos:** aprobar el procedimiento para `ENVIADA` que no alcance `PENDIENTE_REVISION`.

## 7. Migración y ambientes

39. **Datos actuales que deben migrarse:** identificar fuentes, formatos, calidad, propietarios y alcance histórico.
40. **Correspondencia con el sistema anterior:** definir qué catálogos o inventarios son confiables y cómo se validarán; no se copiarán automáticamente.
41. **Proyectos de Firebase:** definir propietarios, nombres y regiones de proyectos separados de desarrollo y producción.
42. **Acceso a ambientes:** definir quién administra credenciales, despliegues y reglas; los secretos no deben guardarse en Git.
43. **Datos de prueba:** establecer un conjunto ficticio autorizado que no exponga producción ni se confunda con valores reales.
44. **Plan de corte y reversión:** decidir cómo se pasará del sistema actual al nuevo después de validar el MVP.

## 8. Auditoría, respaldo y cumplimiento

45. **Retención de auditoría:** definir plazo, acceso, exportación y tratamiento de datos personales.
46. **Copias de seguridad:** fijar frecuencia, retención, responsable, cifrado y pruebas de restauración.
47. **Mantenimiento:** definir procedimiento para corregir datos sin editar historia silenciosamente.
48. **Datos visibles entre usuarios:** determinar qué información del titular de una reserva puede mostrarse a otros auxiliares.
49. **Monitoreo y alertas:** definir responsables y canales para fallos de sincronización, líneas bloqueadas y errores de aprobación.
50. **Política de versiones:** establecer versiones mínimas admitidas y cómo se obliga a actualizar clientes incompatibles.

## 9. Ambigüedades que deben resolverse, no contradicciones directas

- Se exigen los estados `ENVIADA` y `PENDIENTE_REVISION`, pero no se define la frontera exacta entre ambos. La propuesta los separa como persistencia técnica e ingreso a revisión.
- Se exige poder «solicitar verificación», pero no se suministra un estado `EN_VERIFICACION`. La propuesta registra un evento y mantiene `PENDIENTE_REVISION` hasta acordar el flujo.
- El supervisor puede contar y también aprobar; falta decidir si puede aprobar su propio conteo.
- El auxiliar solo corrige sus conteos devueltos; falta una salida cuando el autor ya no puede hacerlo.
- Se exige impedir inventarios negativos, pero todavía no se ha definido si una aprobación reemplaza una fotografía o aplica un movimiento. Ambas alternativas requieren reglas distintas.

No se identificó una contradicción irreconciliable en los requisitos recibidos. Estos puntos son definiciones incompletas que deben cerrarse antes de programar los flujos afectados.
