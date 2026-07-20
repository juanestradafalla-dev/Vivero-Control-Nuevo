# ETAPA 26 — Criterios de aceptación

## Configuración mensual

- [x] Una jornada puede crearse sin informe y conserva compatibilidad con etapas anteriores.
- [x] Cuando el informe está habilitado, mes, año y fuente de plantas muertas son obligatorios y se validan centralmente.
- [x] La configuración queda almacenada en la jornada y no puede cambiar después de activarla.
- [x] La fuente es exactamente `CONTEO_FISICO` o `DESCARTES_APROBADOS`; nunca se suman ambas.

## Conteo físico y descartes

- [x] `CONTEO_FISICO` exige `plantasMuertas` como entero seguro no negativo, lo conserva offline y lo versiona con el conteo inmutable.
- [x] `plantasMuertas` no forma parte del total vivo ni modifica por sí sola `inventarioOficialLineas`.
- [x] `DESCARTES_APROBADOS` rechaza `plantasMuertas` en el payload y suma únicamente `causas.muertos` de descartes aprobados vinculados centralmente a la misma jornada y línea.
- [x] El vínculo de un descarte con la jornada procede de `ocupacionesLineasActivas`, nunca del cliente ni de una inferencia histórica.
- [x] Descartes devueltos o antiguos sin vínculo confiable no se incluyen; descartes pendientes bloquean el cierre.
- [x] Registrar un descarte asociado y cerrar compiten mediante un guard compartido; nunca queda un descarte pendiente asociado después de un cierre que no lo validó.

## Cierre e informe

- [x] `cerrarJornada` conserva todas sus validaciones, congela una huella del alcance y cambia únicamente una jornada completamente aprobada de `ACTIVA` a `CERRANDO`.
- [x] El inicio crea un único `trabajosCierreJornada/{jornadaId}` determinista y devuelve estado `CERRANDO` sin esperar a procesar 400 líneas en una transacción monolítica.
- [x] Mientras la jornada está `CERRANDO`, se rechazan reservas, conteos, correcciones, descartes vinculados y modificaciones administrativas.
- [x] Una línea de una jornada `CERRANDO` permanece bloqueada para catálogo, borradores y activación aunque su ocupación física ya haya sido eliminada.
- [x] El worker reclama el trabajo transaccionalmente con lease de 15 minutos y procesa `LINEAS`, `OCUPACIONES` y `AUTORIZACIONES` en lotes de máximo 100 elementos.
- [x] Fase, cursor, progreso, intentos y error sanitizado permiten reanudar después de cualquier lote sin repetir efectos.
- [x] `reintentarCierreJornada` exige autorización y solo recupera un trabajo en error o con lease vencido; no cambia la huella congelada.
- [x] La transacción final cambia a `INACTIVA`, completa una sola auditoría e idempotencia y crea exactamente un `informesInventario/{jornadaId}` `PENDIENTE` cuando corresponde.
- [x] Un fallo no reactiva la jornada, no altera conteos o inventario y no duplica auditoría, informe ni eliminaciones.
- [x] Los resultados históricos `INACTIVA` de cierres anteriores siguen siendo compatibles.
- [x] El cierre admite hasta 400 líneas mediante fases; la regresión de 271 líneas usa la distribución `76, 76, 76, 29, 14`.
- [x] Google Drive no se llama dentro de la transacción ni durante la captura.
- [x] El procesador del informe reclama el trabajo transaccionalmente y evita ejecuciones concurrentes.
- [x] Una falla del informe no reabre la jornada, no altera conteos ni inventario y queda como error sanitizado reintentable o permanente.
- [x] Reintentar conserva un único documento de informe y un único archivo de Drive por jornada y periodo.
- [x] El tamaño UTF-8 del trabajo se valida antes de escribir y un exceso rechaza todo el cierre sin truncar observaciones.

## Excel y Drive

- [x] El generador parte de la plantilla configurada y conserva el formato no relacionado con los datos sustituidos.
- [x] El resultado contiene únicamente `MODULO 1` a `MODULO 5`; `G3` y cualquier hoja inesperada se excluyen.
- [x] Cada fila se relaciona por módulo, cama y línea, y cualquier duplicado o ausencia impide la subida.
- [x] Antes de escribir, solo se limpian valores y fórmulas en celdas objetivo de filas de datos reconocidas.
- [x] Una fórmula histórica previa solo se permite cuando la celda será sobrescrita obligatoriamente; fórmulas no mapeadas, inesperadas o sobrevivientes se rechazan.
- [x] `MODULO 4!F8` y `MODULO 4!F28` quedan sustituidas por valores aprobados del sistema.
- [x] Se conservan exactamente las 17 fórmulas estructurales y de totales.
- [x] Las fórmulas no contienen `#REF!` y el libro solicita recálculo completo al abrirse.
- [x] El nombre sigue `INVENTARIO {MES} {AÑO}.xlsx` en español y no se genera PDF.
- [x] Drive busca por carpeta y `appProperties`; un reintento actualiza el mismo ID y nunca crea nombres “copia” o “(1)”.

## Clientes y seguridad

- [x] Campo conserva borradores, payload congelado, correcciones y reintentos por usuario, dispositivo, jornada y reserva.
- [x] Maestro permite configurar el informe antes de activar, muestra `CERRANDO` con progreso y ofrece recuperación manual solo cuando el backend la autoriza.
- [x] Campo deja de ofrecer una jornada `CERRANDO` para trabajo nuevo sin borrar silenciosamente su historial local.
- [x] Los clientes no escriben `informesInventario` ni reciben credenciales, carpeta, plantilla o identidad de servidor como datos confiables.
- [x] Emulator Suite y CI usan exclusivamente el adaptador `fake` y no realizan solicitudes al Drive real.
- [x] El adaptador `fake` usa un enlace bajo `.invalid`, que no puede abrir Google Drive real.
- [x] No se versionan plantillas reales, credenciales, tokens, archivos de servicio ni datos privados.

## Estado de salida

- [x] La matriz completa con Node.js 22 quedó consolidada sin reducir cobertura ni aumentar timeouts: `220/220` pruebas de Emulator Suite y `26/26` de Firestore Rules.
- [x] La copia temporal de la plantilla real quedó validada estructural y visualmente; el original conservó su hash y la copia de salida se eliminó después de la revisión.
- [x] Se mantiene `NO-GO`: no hay despliegue, escritura en Drive real, commit, push ni PR hasta nueva autorización.
