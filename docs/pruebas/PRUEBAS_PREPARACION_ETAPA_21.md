# Pruebas de preparación de la ETAPA 21

## Frontera de seguridad

CI usa únicamente fixtures `PRUEBA` y proyectos `demo-*`. No ejecuta `prepare:etapa21:classify`, no recibe credenciales reales y no abre `.private/`. La herramienta real aborta cuando existe `CI`.

La ejecución manual autorizada del 17 de julio de 2026 generó la hoja privada con estos únicos datos compartibles:

| Control | Resultado |
|---|---:|
| aplicaciones | 3 |
| cuentas Authentication | 3 |
| grupos Firestore | 12 |
| documentos Firestore | 41: 38 superiores y 3 anidados |
| principales IAM administrativos | 5 |
| Functions | 11 |
| buckets técnicos | 2 |
| mutaciones remotas | 0 |
| objetos Storage abiertos/descargados | 0 / 0 |

## Pruebas puras añadidas

`npm run test:audit` incluye 11 casos nuevos y conserva los 9 de FASE A, para un total de 20:

1. bloqueo incondicional `BACKUP_PENDIENTE`;
2. plantilla incompleta sin paquete parcial;
3. datos ficticios completos, paquete v1 determinista y frontera exacta de sus bloques A+B;
4. ciclos, padres, líneas, duplicados y totales inválidos;
5. correos duplicados, roles y secretos prohibidos;
6. resumen mínimo de documentos con redacción de campos sensibles;
7. localización y enmascaramiento de referencias de UID;
8. lista blanca de lecturas y rechazo de objetos Storage o verbos de mutación;
9. rutas obligatorias bajo `.private/`;
10. guardia de CI y análisis estático de ausencia de mutaciones;
11. candidatura inicial limitada a registros cuyo nombre contiene Staging.

Los casos usan vivero, ubicaciones, inventarios, usuarios, correos, UID, dispositivos y fechas manifiestamente ficticios.

## Matriz obligatoria

```powershell
# Contratos
Set-Location contracts
npm ci
npm run validate
npm test

# Android
Set-Location ../apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat assembleRelease --no-configuration-cache `
  -PproductionFirebaseProjectId=viverocontrol-3f83f `
  -PproductionFirebaseApiKey=API_KEY_FICTICIA_SOLO_COMPILACION `
  -PproductionFirebaseAppId=1:000000000000:android:app-ficticia
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug

# Maestro
Set-Location ../maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high

# Backend, reglas y Emulator Suite
Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

La compilación Android usa identificadores ficticios y no firma. Maestro no se empaqueta ni se inicia con configuración real. Backend y Rules usan exclusivamente Firebase Emulator Suite.

## Resultado final

La matriz se repitió localmente el 17 de julio de 2026 sin reducir suites ni ampliar timeouts:

| Componente | Resultado |
|---|---|
| Contratos | validación de 94 esquemas, 1 esquema común y 5 enums; 57/57 pruebas aprobadas; auditoría de producción con 0 vulnerabilidades |
| Vivero Campo | `assembleDebug`, `assembleRelease`, 35/35 pruebas unitarias y `lintDebug` aprobados; release compilado con identificadores ficticios y sin firma |
| Vivero Maestro | lint, typecheck, 54/54 pruebas, build y auditoría aprobados; 0 vulnerabilidades |
| Backend unitario | lint, typecheck, build, 24/24 pruebas de dominio y 20/20 pruebas de auditoría/preparación aprobados |
| Emulator Suite | 179/179 pruebas de integración y 22/22 pruebas de Firestore Rules aprobadas con las 30 Callables cargadas en `demo-vivero-control-etapa3` |
| Datos privados | validación local `incomplete`, 0 errores estructurales, 12 campos o decisiones pendientes y 0 operaciones remotas |
| Paquete preliminar | prueba negativa aprobada: `DATOS_REALES_INCOMPLETOS`; no se creó paquete ni resumen parcial |
| Seguridad del repositorio | escaneo de secretos, datos privados, comandos destructivos y artefactos aprobado; `.private/` ignorado y no versionado |

Advertencias conservadas:

- la ejecución local usó Node.js 24.15.0, mientras Functions está destinado a Node.js 22; el emulador mostró esa diferencia y la recomendación de actualizar `firebase-functions`;
- Vite informó un chunk minificado de Maestro de 867,39 kB, 250,80 kB comprimido con gzip;
- Backend conserva 9 vulnerabilidades moderadas de producción y 12 en el árbol completo, 0 altas y 0 críticas; la corrección automática propuesta requiere cambios mayores;
- Gradle conserva advertencias de bibliotecas Android obsoletas sin fallos de compilación, pruebas o lint.

La lectura real fue manual y estrictamente de solo lectura. CI no se conectó a Firebase real, no abrió objetos Storage y todos los flujos remotos de pruebas usaron emuladores.
