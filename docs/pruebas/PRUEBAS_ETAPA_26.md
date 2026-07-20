# ETAPA 26 — Pruebas

## Cobertura requerida

### Contratos y backend

- configuración opcional y periodo/fuente válidos;
- ambos modos de plantas muertas y total vivo sin alteración;
- asociación central de descartes y exclusión de históricos/devueltos;
- bloqueo de cierre por descartes pendientes;
- transición `ACTIVA -> CERRANDO` con huella congelada y trabajo determinista;
- procesamiento durable de `LINEAS`, `OCUPACIONES` y `AUTORIZACIONES` en lotes de 100;
- transacción final única `CERRANDO -> INACTIVA` con auditoría, idempotencia e informe único;
- jornada de exactamente 271 líneas con distribución `76, 76, 76, 29, 14` entre `MODULO 1` a `MODULO 5`;
- interrupción después de cada lote y reanudación por cursor sin duplicar progreso, auditoría, informe o eliminaciones;
- error sanitizado, lease de 15 minutos y recuperación manual autorizada de `ERROR` o lease vencido;
- rechazo de reservas, conteos, correcciones, descartes y modificaciones mientras la jornada está `CERRANDO`;
- líneas `CERRANDO` bloqueadas en catálogo, edición de borradores y activación aun después de eliminar su ocupación física;
- límite de 400 líneas sin aumentar una transacción monolítica;
- carrera registrar descarte contra cierre mediante el guard de ocupación;
- rechazo controlado del trabajo que supera el límite UTF-8 seguro;
- reclamación concurrente, error, reintento e idempotencia;
- recuperación cuando Drive confirmó antes de persistir su ID;
- búsqueda/actualización del mismo archivo mediante `appProperties`;
- permisos de listado/reintento y denegación de escritura directa;
- adaptador `fake` obligatorio en emulator/CI.
- enlace `.invalid` en el adaptador `fake`, sin destinos reales.

### XLSX ficticio

Las pruebas generan en memoria una plantilla totalmente ficticia. Deben comprobar hojas `MODULO 1` a `MODULO 5`, exclusión de `G3`, encabezados, mapeo módulo/cama/línea, fórmulas, totales, recálculo, nombre español y fallos por duplicados o filas ausentes. Deben demostrar además que:

- solo se limpian las celdas objetivo de filas reconocidas como datos;
- una fórmula histórica se acepta únicamente cuando esa celda será sobrescrita obligatoriamente;
- `MODULO 4!F8` y `MODULO 4!F28` terminan con valores aprobados, no con sus fórmulas históricas;
- una fórmula en una celda de datos no mapeada o inesperada continúa siendo rechazada;
- se conservan exactamente las 17 fórmulas estructurales y de totales;
- el resultado contiene cero `#REF!`.

La plantilla real y sus datos nunca se copian a fixtures ni logs.

### Campo

- visibilidad y obligatoriedad condicional;
- persistencia y migración Room 4→5;
- congelación y omisión exacta del payload;
- restauración, corrección y reintentos WorkManager;
- plantas muertas fuera del total vivo.

### Maestro

- configuración al crear borrador y resumen antes de activar;
- advertencia de inmutabilidad;
- detalle del informe al cerrar;
- estado `CERRANDO`, fase, cursor y progreso del trabajo;
- reintento manual solo cuando el backend lo autoriza por error o lease vencido;
- mensaje de inicio de cierre sin afirmar anticipadamente que las líneas ya fueron liberadas;
- listado, estados, enlace y reintento según rol;
- ausencia de acceso directo a Drive desde el renderer.

## Matriz local

```powershell
Set-Location contracts
npm ci
npm run validate
npm test

Set-Location ../apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug

Set-Location ../maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high

Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

Ningún comando anterior despliega Firebase. Emulator Suite debe usar proyecto `demo-*` y no puede contactar Google Drive.

## Resultado local consolidado

La verificación se ejecutó con Node.js `22.23.1`, npm `10.9.4` y JDK 21, sin reducir cobertura ni aumentar timeouts arbitrariamente:

| Componente | Resultado |
|---|---|
| Contratos | `validate`: 117 entidades, 1 esquema común y 6 enums; pruebas `73/73` |
| Vivero Campo | `assembleDebug`, `assembleRelease` y `lintDebug` correctos; `66/66` pruebas en 12 suites |
| Vivero Maestro | lint, typecheck y build correctos; `70/70` pruebas; auditoría de producción con 0 vulnerabilidades |
| Backend | lint, typecheck y build correctos; `64/64` pruebas unitarias y `21/21` pruebas de auditoría |
| Emulator Suite | `220/220` pruebas aprobadas con timeout de 30 segundos |
| Firestore Rules | `26/26` pruebas aprobadas |

La primera ejecución integral terminó `217/220` por tres timeouts de 30 segundos. Los logs demostraron que cada worker cargaba estáticamente `exceljs` y Google Drive aunque la Callable no generara informes, añadiendo aproximadamente 10 segundos por arranque frío. Se corrigió con carga dinámica limitada a las tres operaciones de informes; las tres regresiones aprobaron `37/37` y la repetición integral aprobó `220/220` sin cambiar el timeout ni la cobertura.

La auditoría de producción del backend conserva 10 vulnerabilidades moderadas transitivas y 0 altas o críticas; no se ejecutó `audit fix` ni `--force`. Vite conservó la advertencia de un chunk de Maestro de 901,14 kB minificado y 257,73 kB gzip.

La regresión dirigida del cierre por fases aprobó `6/6`: una jornada de exactamente 271 líneas distribuidas `76, 76, 76, 29, 14` se procesó con lotes máximos de 100. La interrupción posterior a cada lote se reanudó desde el cursor persistido sin duplicar progreso, auditoría, informe ni eliminaciones. Los bloqueos de `CERRANDO` permanecieron activos durante todo el recorrido.

El script `test:rules:emulator` debe levantar Auth y Firestore porque el seed necesita ambos servicios, aunque las pruebas ejerciten únicamente Firestore Rules. No deben aumentarse timeouts ni reducirse aserciones para producir un resultado verde.

## Validación manual de la plantilla real

La validación usó una copia temporal de `INVENTARIO JUNIO 2026.xlsx`, nunca alteró el original y no escribió en Drive. El original conservó SHA-256 `307572F85D812EED3EFCD15DBDE3C9F4FBA6367636C9C2D184B1262AAFE959CC`.

- resultado con nombre exacto `INVENTARIO JULIO 2026.xlsx`;
- únicamente hojas `MODULO 1` a `MODULO 5`, sin `G3`;
- 271 líneas con distribución `76, 76, 76, 29, 14`;
- estilos, celdas combinadas, bordes, dimensiones, configuración de impresión y mapeo cama/línea preservados;
- fórmulas y totales verificados para `CONTEO_FISICO` y `DESCARTES_APROBADOS`;
- `MODULO 4!F8 = 112` y `MODULO 4!F28 = 101`, ambas como valores sin fórmula;
- exactamente 17 fórmulas estructurales y de totales, con cero `#REF!`;
- 8 páginas renderizadas revisadas visualmente;
- copia temporal de salida eliminada al finalizar.

El estado sigue siendo `NO-GO`: no se configuró Drive, no se desplegó el trigger y no se escribió en la carpeta real.
