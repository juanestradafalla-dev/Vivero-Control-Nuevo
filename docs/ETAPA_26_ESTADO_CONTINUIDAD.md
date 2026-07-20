# ETAPA 26 — Estado exacto para continuidad

Fecha de actualización: 2026-07-19, zona horaria `America/Bogota`.

Este documento permite continuar la ETAPA 26 sin volver a analizar todo el repositorio. Describe lo implementado, lo verificado, lo que quedó a medias y las acciones pendientes. No afirma que la ETAPA 26 esté terminada.

## 1. Estado de Git

- Repositorio local: `C:\Users\Almacen\Documents\GitHub\Vivero Control\Vivero-Control-Nuevo`.
- Rama local: `feat/etapa-26-informe-inventario-drive`.
- Base/HEAD sin commits de la etapa: `fc2b9aaca3ce600cf742c8b006b272ba9ceac668`.
- La rama no tiene upstream.
- No se creó commit de ETAPA 26.
- No se hizo `push`.
- No se abrió PR.
- No se fusionó nada.
- No se desplegó Firebase.
- No se escribió ni subió ningún archivo a Google Drive.
- El árbol continúa deliberadamente modificado por la ETAPA 26. El recuento anterior de archivos dejó de ser válido después de incorporar el cierre por fases y las regresiones XLSX.
- El estado y `git diff --check` definitivos deben registrarse al consolidar la matriz completa.

No ejecutar `git clean`, `reset`, `checkout --`, `restore` ni otra operación destructiva: todos los cambios locales pertenecen a esta etapa y todavía no están guardados en un commit.

## 2. Recursos de Drive confirmados únicamente en lectura

- Carpeta de inventarios: identificada fuera del repositorio mediante
  `GOOGLE_DRIVE_INVENTORY_FOLDER_ID`.
- Plantilla: `INVENTARIO JUNIO 2026.xlsx`.
- ID de la plantilla: administrado fuera del repositorio mediante
  `GOOGLE_DRIVE_INVENTORY_TEMPLATE_FILE_ID`.
- El conector de Drive confirmó que el archivo existe como XLSX.
- No se descargó ni copió la plantilla real al repositorio.
- No se inspeccionaron ni reprodujeron datos privados de la plantilla.
- La copia temporal generada desde la plantilla real fue validada estructural y visualmente sin escritura en Drive. El original conservó SHA-256 `307572F85D812EED3EFCD15DBDE3C9F4FBA6367636C9C2D184B1262AAFE959CC`.

## 3. Implementación terminada a nivel de código

### 3.1 Contratos

Se añadieron o actualizaron contratos estrictos para:

- configuración mensual opcional del informe;
- fuentes `CONTEO_FISICO` y `DESCARTES_APROBADOS`;
- `plantasMuertas` en solicitud, resultado y documento inmutable de conteo;
- asociación central de descartes con jornada y jornada-línea;
- documento, resumen, listado y reintento de informes;
- estados `PENDIENTE`, `PROCESANDO`, `COMPLETADO`, `ERROR_REINTENTABLE` y `ERROR_PERMANENTE`;
- estado administrativo `CERRANDO` y trabajo durable de cierre;
- resultado inmediato `CERRANDO`, recuperación manual y compatibilidad con resultados históricos `INACTIVA`;
- fase, cursor, progreso, intentos, lease y error sanitizado;
- máximo de 400 líneas y catálogo bloqueado por `JORNADA_CERRANDO`;
- errores controlados y resultados idempotentes.

La configuración del informe exige exactamente:

```json
{
  "habilitado": true,
  "mes": 7,
  "anio": 2026,
  "fuentePlantasMuertas": "CONTEO_FISICO"
}
```

Se añadieron ejemplos ficticios en `contracts/examples/etapa-26/`. No contienen datos del vivero real.

### 3.2 Backend

Se implementó:

- persistencia de la configuración en el borrador y su materialización en la jornada activa;
- validación central de `plantasMuertas` según la fuente configurada;
- exclusión de plantas muertas del total vivo, que continúa siendo `hembras + machos + patrones`;
- conservación de `plantasMuertas` en conteos inmutables y correcciones;
- asociación de descartes con jornada y jornada-línea a partir de `ocupacionesLineasActivas`, nunca desde el cliente;
- guard compartido `versionDescartesAsociados` para hacer competir registro de descarte y cierre;
- inclusión exclusiva de `causas.muertos` de descartes `APROBADO` de la misma jornada/línea y dentro de activación-cierre;
- bloqueo del cierre ante descartes pendientes;
- transición inicial `ACTIVA -> CERRANDO` con huella congelada y `trabajosCierreJornada/{jornadaId}` determinista;
- procesamiento reanudable de líneas, ocupaciones y autorizaciones en lotes de 100;
- cursor, progreso, intentos, lease de 15 minutos y error sanitizado persistentes;
- recuperación manual autorizada de trabajos en error o con lease vencido;
- bloqueo de reservas, conteos, correcciones, descartes y modificaciones durante `CERRANDO`;
- bloqueo lógico de líneas `CERRANDO` en catálogo, edición de borradores y activación aunque una ocupación ya haya sido eliminada;
- transacción final única `CERRANDO -> INACTIVA` con una auditoría, un resultado idempotente y un informe `PENDIENTE`;
- compatibilidad con cierres históricos que ya persistieron resultado `INACTIVA`;
- límite real de 400 líneas sin ampliar una transacción monolítica;
- margen defensivo de 750 KiB UTF-8 antes de guardar el trabajo, sin truncar observaciones;
- clasificación entre errores reintentables y permanentes con mensajes sanitizados;
- búsqueda/actualización idempotente del mismo archivo por carpeta y `appProperties`;
- recuperación si Drive recibió el archivo pero Firestore todavía no guardó su ID;
- descarga binaria de XLSX o exportación cuando la plantilla sea Google Sheets;
- adaptador `fake` obligatorio en Emulator Suite y CI, con enlaces bajo `.invalid`;
- adaptador Google exclusivo para producción exacta y Application Default Credentials;
- denegación de lectura y escritura directa sobre `trabajosCierreJornada` e `informesInventario` en Firestore Rules.

Nuevas Callables:

- `listarInformesInventario`;
- `reintentarInformeInventario`;
- `reintentarCierreJornada`.

Nuevos triggers Firestore Gen 2:

- `procesarInformeInventario`, sobre `informesInventario/{informeId}` en `us-central1`;
- `procesarCierreJornada`, sobre `trabajosCierreJornada/{trabajoId}` en `us-central1`.

Al cerrar la ETAPA 26, `CALLABLE_NAMES` quedó en 38 Callables; la ETAPA 27B agrega cuatro operaciones OAuth y eleva el registro vigente a 42. Los triggers no forman parte de esa lista.

### 3.3 Generación Excel

El generador con `exceljs`:

- conserva únicamente `MODULO 1` a `MODULO 5`;
- elimina `G3` y hojas inesperadas de la copia;
- localiza las columnas requeridas;
- mapea por módulo, cama y línea;
- rechaza duplicados, filas parciales, filas ausentes y módulos inesperados;
- limpia valores y fórmulas solo dentro de celdas objetivo de filas de datos reconocidas;
- permite una fórmula histórica únicamente cuando esa misma celda será sobrescrita obligatoriamente;
- rechaza fórmulas no mapeadas, inesperadas o que puedan sobrevivir en el resultado;
- cubre como regresiones específicas `MODULO 4!F8` y `MODULO 4!F28`;
- rechaza referencias `#REF!` o fórmulas que dependan de hojas eliminadas;
- conserva las 17 fórmulas estructurales y de totales y solicita recálculo al abrir;
- usa fecha `America/Bogota`;
- genera nombres `INVENTARIO {MES} {AÑO}.xlsx`;
- no genera PDF.

La copia temporal `INVENTARIO JULIO 2026.xlsx` derivada de la plantilla real se validó sin alterar el original: hojas `MODULO 1` a `MODULO 5`, ausencia de `G3`, distribución `76, 76, 76, 29, 14` para 271 líneas, estilos, combinaciones, bordes, dimensiones, impresión y mapeo cama/línea preservados. Ambas fuentes de plantas muertas produjeron fórmulas y totales coherentes. `MODULO 4!F8` quedó en `112` y `MODULO 4!F28` en `101`, como valores sin fórmula; permanecieron exactamente 17 fórmulas estructurales y de totales y cero `#REF!`. Se revisaron visualmente 8 páginas renderizadas y la copia temporal de salida fue eliminada.

### 3.4 Vivero Campo Android

Se implementó:

- modelo y parser de la configuración mensual;
- campo condicional `Plantas muertas` para `CONTEO_FISICO`;
- aviso para `DESCARTES_APROBADOS`;
- validación entera no negativa;
- aclaración de que plantas muertas no forma parte del total vivo;
- persistencia en Room;
- migración explícita Room 4 a 5;
- borrador, payload congelado, WorkManager, correcciones e historial;
- snapshot de configuración del informe en la reserva confirmada;
- restauración offline usando ese snapshot si falla `listarJornadasActivas`;
- compatibilidad con filas Room v4, que permanecen sin configuración inventada;
- aislamiento por usuario, dispositivo, jornada y reserva;
- rechazo defensivo de cualquier jornada distinta de `ACTIVA`, incluida `CERRANDO`, sin borrar historial local.

### 3.5 Vivero Maestro

Se implementó:

- casilla para generar informe al cerrar;
- mes, año y fuente de plantas muertas;
- resumen antes de activar y aviso de inmutabilidad;
- datos del informe y descartes pendientes en el cierre;
- bloqueo visual del cierre cuando corresponda;
- confirmación de inicio `CERRANDO` sin afirmar anticipadamente que las líneas ya fueron liberadas;
- listado de cierres con fase, cursor, progreso, intentos y error sanitizado;
- recuperación manual autorizada de error o lease vencido, conservando la misma huella;
- líneas con motivo `JORNADA_CERRANDO` visibles como no seleccionables;
- panel de informes con filtros, estado, periodo, fuente, intentos, error y reintento autorizado;
- apertura externa solo mediante IPC para `drive.google.com` y `docs.google.com`;
- conservación de `sandbox`, `contextIsolation` y `webSecurity`;
- visualización de plantas muertas en el monitor e historial cuando existen.

## 4. Endurecimientos ya aplicados después de la auditoría

La auditoría encontró varios riesgos P1; ya se corrigieron en el árbol local:

- carrera entre descarte y cierre mediante guard compartido;
- riesgo de documento Firestore de 1 MiB mediante límite de 750 KiB;
- errores de configuración/permisos/MIME de Drive como reintentables;
- fórmulas históricas en celdas mapeadas limpiadas y sustituidas, con rechazo de cualquier fórmula que pueda sobrevivir;
- preservación explícita de las 17 fórmulas estructurales y de totales;
- filas con cama o línea parcial rechazadas;
- recuperación tras subir antes de guardar el ID;
- actualización del mismo archivo en reintentos;
- URL del adaptador falso bajo `.invalid`;
- texto explícito de plantas muertas en Campo;
- aislamiento de datos locales aun sin conectividad.
- normalización estricta de módulo: acepta únicamente los alias numéricos documentados y rechaza valores ambiguos como `MODULO NORTE 1`.
- eliminación del límite monolítico del cierre mediante `CERRANDO`, lotes de 100 y máximo de 400 líneas;
- conservación del bloqueo lógico de una línea durante todos los lotes del cierre.

No se detectaron P0, secretos, credenciales, binarios ni artefactos prohibidos.

## 5. Resultados de pruebas consolidados

La matriz se ejecutó con Node.js `22.23.1`, npm `10.9.4` y JDK 21:

- contratos: validación de 117 entidades, 1 esquema común y 6 enums; `73/73` pruebas;
- Android: `assembleDebug`, `assembleRelease` y `lintDebug`; `66/66` pruebas en 12 suites;
- Maestro: lint, typecheck, build y `70/70` pruebas; auditoría de producción con 0 vulnerabilidades; advertencia de chunk de 901,12 kB minificado y 257,68 kB gzip;
- backend: lint, typecheck, build, `64/64` pruebas unitarias y `21/21` pruebas de auditoría; 10 vulnerabilidades moderadas de producción y 0 altas o críticas;
- cierre dirigido: `6/6`, incluida la jornada de 271 líneas con distribución `76, 76, 76, 29, 14`, lotes máximos de 100 e interrupción/reanudación después de cada lote sin duplicados;
- plantilla real: verificación estructural y visual aprobada, 8 páginas revisadas, `F8`/`F28` sustituidas, 17 fórmulas preservadas y cero `#REF!`.

La matriz integral con Node.js 22 aprobó `220/220` pruebas de Emulator Suite y `26/26` pruebas de Firestore Rules, conservando el timeout de 30 segundos.

## 6. Verificación obligatoria antes de salir de NO-GO

La matriz completa obligatoria con Node.js 22 incluye:

```powershell
cd "C:\Users\Almacen\Documents\GitHub\Vivero Control\Vivero-Control-Nuevo\backend\functions"
npm run test:emulators
```

No aumentar timeouts arbitrariamente, no reducir cobertura y no sustituir la matriz por pruebas dirigidas. La prueba dirigida `6/6` demuestra el recorrido de 271 líneas y la reanudación; la matriz integral adicional aprobó `220/220` pruebas de Emulator Suite y `26/26` de Firestore Rules. Después deben comprobarse ausencia de procesos huérfanos y eliminación exclusiva de copias temporales creadas por la verificación.

## 7. Pendientes exactos antes de considerar terminada la etapa

1. Revisar el `git diff` completo, especialmente `package-lock.json`, reglas, contratos, migración Room, ambos triggers e IPC externo.
2. Repetir búsquedas de secretos y artefactos prohibidos.
4. Ejecutar `git diff --check`, revisar procesos y eliminar únicamente archivos temporales creados durante QA.
5. Decidir con el propietario si se crea uno o varios commits. No hacer push, PR, merge ni deploy sin nueva autorización expresa.

## 8. Riesgos conocidos que deben mantenerse en el informe final

- Drive API, permisos de carpeta/plantilla y variables productivas no están configurados ni probados.
- El documento congelado conserva límite defensivo de 750 KiB; el máximo funcional es 400 líneas y los lotes procesan 100 elementos.
- Una jornada puede permanecer `CERRANDO` tras una interrupción; exige monitoreo de lease, progreso y error, y recuperación manual autorizada.
- Las líneas deben permanecer lógicamente bloqueadas durante todo `CERRANDO`, incluso después de borrar su ocupación por lote.
- `npm audit` del backend reportó 10 vulnerabilidades moderadas transitivas relacionadas con `uuid`; la corrección sugerida implicaría un downgrade mayor de `exceljs`, por lo que no se aplicó `audit fix` ni `--force`.
- La evidencia local procede de Node.js `22.23.1`, igual que el runtime objetivo de Cloud Functions; la matriz integral aprobó `220/220` pruebas de Emulator Suite y `26/26` de Firestore Rules.
- Maestro mantiene la advertencia de chunk grande: 901,12 kB minificado y 257,68 kB gzip.
- Faltan validación productiva, monitoreo, rollback y prueba de humo autorizada.
- El estado continúa `NO-GO`; esta documentación no autoriza configuración de Drive ni despliegue.

## 9. Configuración productiva todavía pendiente

Esta sección quedó reemplazada por la ETAPA 27B. Los IDs de plantilla y carpeta ya no se guardan como variables ni se autoriza Drive con la cuenta de servicio. La arquitectura vigente usa OAuth de usuario, `drive.file`, Google Picker, Secret Manager y dos identidades dedicadas sin permisos de Drive ni llaves JSON.

Consulte [GOOGLE_DRIVE_OAUTH_ETAPA_27.md](arquitectura/GOOGLE_DRIVE_OAUTH_ETAPA_27.md) para las variables con marcadores, APIs, IAM mínimo, despliegue enumerado, conexión, revocación y rollback actuales.

## 10. Archivos principales de la etapa

### Nuevos

- `apps/campo-android/app/src/test/java/com/arles/viverocampo/data/ActiveJourneySummaryParserTest.kt`
- `apps/campo-android/app/src/test/java/com/arles/viverocampo/data/local/ViveroCampoDatabaseMigrationTest.kt`
- `apps/maestro-desktop/src/presentation/InventoryReportsSection.tsx`
- `backend/functions/src/domain/inventoryReportDrive.ts`
- `backend/functions/src/domain/inventoryReports.ts`
- `backend/functions/tests/closeJourneyPhases.integration.test.ts`
- `backend/functions/tests/inventoryReports.integration.test.ts`
- `backend/functions/tests/inventoryReports.unit.test.ts`
- `contracts/enums/estados-informe-inventario.json`
- `contracts/examples/etapa-26/` con fixtures ficticios
- `contracts/schemas/descarte.schema.json`
- `contracts/schemas/close-journey-work.schema.json`
- `contracts/schemas/closing-journey-summary.schema.json`
- `contracts/schemas/inventory-report-configuration.schema.json`
- `contracts/schemas/inventory-report-line.schema.json`
- `contracts/schemas/inventory-report-summary.schema.json`
- `contracts/schemas/inventory-report.schema.json`
- `contracts/schemas/list-inventory-reports-request.schema.json`
- `contracts/schemas/list-inventory-reports-result.schema.json`
- `contracts/schemas/retry-inventory-report-request.schema.json`
- `contracts/schemas/retry-inventory-report-result.schema.json`
- `contracts/schemas/retry-close-journey-request.schema.json`
- `contracts/schemas/retry-close-journey-result.schema.json`
- `docs/ETAPA_26_CRITERIOS_DE_ACEPTACION.md`
- `docs/arquitectura/GOOGLE_DRIVE_INVENTARIO_ETAPA_26.md`
- `docs/arquitectura/INFORMES_INVENTARIO_ETAPA_26.md`
- `docs/pruebas/PRUEBAS_ETAPA_26.md`
- este documento de continuidad.

### Modificados por área

- Android: `AppContainer.kt`, repositorios, entidades Room, base de datos, modelos, pantalla, ViewModel y pruebas.
- Maestro: proceso Electron/preload, repositorio, modelos, `App`, jornadas, participantes, estilos y pruebas.
- Backend: reglas, dependencias, seed, cierre, descartes, jornadas, conteos, validación, errores, entorno, exportaciones y pruebas.
- Contratos: schemas existentes, registro, ejemplos y pruebas.
- Documentación: `README.md` y `DEPENDENCIAS_Y_RIESGOS.md`.
- `.gitignore`: ignora `**/.kotlin/`.

## 11. Qué no debe hacer la siguiente cuenta

- No volver a empezar la ETAPA 26 desde cero.
- No copiar el repositorio anterior.
- No usar datos reales en fixtures.
- No descargar ni versionar la plantilla real.
- No escribir en Drive durante captura, pruebas o CI.
- No desplegar Firebase ni habilitar APIs sin autorización expresa.
- No guardar cuentas de servicio, tokens o JSON privados.
- No sumar `CONTEO_FISICO` y `DESCARTES_APROBADOS`.
- No modificar el inventario oficial al registrar plantas muertas.
- No abrir la jornada si falla Drive.
- No convertir un error de cierre en `ACTIVA`; debe permanecer `CERRANDO` y reanudarse sobre la huella congelada.
- No aumentar el máximo o el tamaño de lote para ocultar límites de Firestore.
- No permitir que una línea `CERRANDO` vuelva al catálogo antes de confirmar `INACTIVA`.
- No limpiar o descartar el árbol de trabajo local.
