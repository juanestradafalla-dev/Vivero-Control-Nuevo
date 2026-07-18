# ETAPA 24 - Pruebas

## Casos deterministas de Campo

La suite cubre:

1. ausencia de `currentUser` y presentacion posterior del formulario de acceso;
2. perfil activo verificado y restauracion completa;
3. arranque sin red con perfil activo en cache;
4. arranque sin red y sin perfil en cache, conservando Auth;
5. reintento posterior exitoso sin reiniciar;
6. perfil inexistente confirmado por el servidor;
7. perfil inactivo confirmado por el servidor;
8. restauracion de reserva y borrador Room de conteo;
9. restauracion del borrador Room de descarte;
10. programacion unica por clave de idempotencia;
11. reintentos sin observadores o sincronizaciones duplicadas;
12. aislamiento entre dos cuentas en un mismo dispositivo;
13. salida explicita conservando borradores locales;
14. paridad de capacidades entre `EMULATOR` y `PRODUCTION`;
15. bloqueo de ambientes o proyectos no autorizados.

Las pruebas de politica separan respuestas autoritativas de lecturas de cache. Una ausencia o inactividad observada solo en cache nunca revoca la sesion.

## Matriz local obligatoria

Se usa Node 22 y JDK 21. Los identificadores de la compilacion Android release son ficticios y coinciden con CI.

```powershell
# Contratos
Set-Location contracts
npm ci
npm run validate
npm test

# Vivero Campo
Set-Location ../apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat assembleRelease --no-configuration-cache `
  -PproductionFirebaseProjectId=viverocontrol-3f83f `
  -PproductionFirebaseApiKey=API_KEY_FICTICIA_SOLO_COMPILACION `
  -PproductionFirebaseAppId=1:000000000000:android:app-ficticia
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug

# Vivero Maestro
Set-Location ../maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high

# Backend y emuladores
Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

## Seguridad de la verificacion

- Emulator Suite usa exclusivamente `demo-*` y datos ficticios.
- No se ejecuta `firebase deploy` ni se conecta a Firebase real.
- No se aumentan timeouts ni se desactiva cobertura.
- No se usa `npm audit fix --force`.
- Las vulnerabilidades altas o criticas bloquean la entrega; las moderadas documentadas permanecen visibles.
- La revision final rechaza secretos, contenido de `.private/`, APK, ejecutables y directorios generados.

## Resultado local

La matriz se ejecuto con Node `22.23.1` y JDK `21.0.10`:

| Bloque | Resultado |
|---|---|
| Contratos | 102 esquemas compilados y 59 pruebas aprobadas |
| Vivero Campo | `assembleDebug`, `assembleRelease` sin firma, 53 pruebas unitarias y `lintDebug` aprobados |
| Vivero Maestro | lint, typecheck, 55 pruebas y build aprobados |
| Backend | lint, typecheck, build, 32 pruebas unitarias y 21 pruebas de auditoria aprobados |
| Emulator Suite | 187 pruebas integradas y de concurrencia aprobadas en 18 archivos |
| Firestore Rules | 24 pruebas aprobadas |
| Repositorio | 512 archivos versionables revisados; sin secretos, privados, binarios ni comandos de despliegue ejecutables |
| Auditorias npm de produccion | contratos y Maestro sin vulnerabilidades; backend con 9 moderadas transitivas y ninguna alta o critica |

La compilacion de Maestro conserva el aviso conocido por un chunk minificado mayor a 500 kB. Firebase Functions conserva el aviso de dependencia desactualizada. Ambos quedan visibles como riesgo tecnico; no autorizan una refactorizacion ni una actualizacion mayor automatica en esta etapa.
