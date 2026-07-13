# Configuración de emuladores y clientes

## Puertos locales

| Servicio | Puerto |
|---|---:|
| Emulator UI | 4000 |
| Functions | 5001 |
| Firestore | 8180 |
| Authentication | 9099 |

Todos usan el proyecto `demo-vivero-control-etapa3`.

## Iniciar Emulator Suite

```powershell
Set-Location backend/functions
npm ci
npm run build
npm run emulators:start
```

En otra terminal:

```powershell
Set-Location backend/functions
npm run emulator:seed
```

No use `firebase deploy` ni seleccione un proyecto real.

## Vivero Campo en Android Emulator

La compilación `debug` usa `10.0.2.2`, que desde el Android Emulator representa
el equipo anfitrión:

```powershell
Set-Location apps/campo-android
./gradlew.bat installDebug
```

La pantalla muestra permanentemente `MODO DE PRUEBA — EMULADOR`. No se requiere
ni se admite un `google-services.json` real.

### Celular físico de desarrollo

Determine la IPv4 privada del equipo que ejecuta Emulator Suite y compile:

```powershell
./gradlew.bat installDebug -PemulatorHost=192.168.1.25
```

Además, para una prueba controlada en la misma red, use una copia local de la
configuración de Firebase que haga escuchar Auth, Firestore, Functions y UI en
`0.0.0.0`, habilite solo esos puertos en el firewall privado y cierre la
exposición al terminar. No confirme esa copia ni exponga los emuladores a
Internet. Esta opción debe validarse después de conocer la red y los celulares
reales.

## Vivero Maestro

La configuración de ejemplo ya apunta a `127.0.0.1`:

```powershell
Set-Location apps/maestro-desktop
npm ci
npm run dev
```

Las variables admitidas son:

```dotenv
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_PROJECT_ID=demo-vivero-control-etapa3
VITE_EMULATOR_HOST=127.0.0.1
```

Maestro falla de forma segura si se desactivan los emuladores o si el proyecto
no empieza por `demo-`. Su monitor solo lee jornada, líneas y las reservas
permitidas por rol; no ofrece acciones de escritura.

## Compilaciones release

Android `release` tiene `EMULATOR_ENABLED=false` y valores Firebase vacíos. La
interfaz informa `FIREBASE DESHABILITADO — SIN PRODUCCIÓN`. No existe
configuración de producción para Maestro ni backend desplegado. La ETAPA 3 no
produce instaladores, APK ni ejecutables versionados.
