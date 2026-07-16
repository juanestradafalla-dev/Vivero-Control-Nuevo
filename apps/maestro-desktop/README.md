# Vivero Maestro

Aplicación Electron/React de la Etapa 11 para revisar conteos y preparar jornadas en borrador dentro de Firebase Emulator Suite.

Admite dos modos explícitos mediante un archivo local `.env.local` ignorado por Git:

- `emulator`: exige `VITE_USE_FIREBASE_EMULATORS=true` y un proyecto `demo-*`;
- `staging`: exige `VITE_USE_FIREBASE_EMULATORS=false`, `VITE_APP_ENV=staging` y el proyecto exacto `viverocontrol-3f83f`.

La configuración Web se proporciona únicamente con las seis variables documentadas en `.env.example`. El ejemplo contiene solo valores ficticios; no se usa `google-services.json` ni se versionan valores de staging.

- Consulta jornadas activas autorizadas y permite seleccionar una.
- Al cambiar cancela todas las suscripciones anteriores y limpia el snapshot para no mezclar jornadas.

- Observa líneas, conteos e inventarios ficticios mediante snapshots.
- Presenta ubicación, autor, rol, dispositivo, cantidades, observaciones, horas, versión, inventario actual y diferencia.
- Muestra un resumen no editable antes de aprobar.
- Exige motivo antes de devolver.
- Bloquea la aprobación propia del supervisor.
- Advierte y exige motivo al administrador que aprueba excepcionalmente su conteo.
- Solicita acciones mediante Callables; no escribe documentos críticos directamente.
- Auxiliares no leen detalle ajeno ni ven acciones.
- Presenta todas las versiones por línea, marca la vigente y conserva visible el motivo de devolución.
- Las versiones anteriores son solo lectura; las acciones apuntan a la versión vigente y el backend vuelve a validarla.
- En líneas `DEVUELTA` muestra autor original, responsable actual, asignador y motivos.
- Supervisor y administrador seleccionan exclusivamente usuarios activos y autorizados, revisan un resumen y solicitan la reasignación mediante Callable.
- En líneas `EN_CONTEO` muestra titular, tipo, dispositivo, hora y versión de línea.
- Supervisor y administrador deben escribir un motivo, revisar la advertencia y el estado de retorno, y confirmar `liberarReservaLinea` con una única clave.
- La sección `Jornadas` lista los borradores administrables, permite crearlos y abrirlos sin exponerlos a auxiliares.
- El catálogo se agrupa por vivero, módulo y cama, admite búsqueda y filtro, evita duplicados y marca las líneas usadas en jornadas activas.
- La selección se revisa y guarda únicamente mediante Callables; no se crean líneas operativas ni se ofrece activación, cierre o eliminación.
- Dentro de cada borrador muestra los usuarios centrales activos con nombre y rol, búsqueda y filtro.
- Permite seleccionar participantes, definir únicamente `puede contar` y revisar un resumen antes de confirmar mediante Callable.
- La interfaz advierte que la jornada continúa en `BORRADOR` y que todavía no existen autorizaciones operativas.

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

## Instalador Windows Staging

El empaquetado requiere el archivo local `.env.local` con el entorno staging validado. El comando no muestra sus valores, ejecuta lint, verificación de tipos, pruebas y build antes de generar el instalador:

```powershell
npm run package:win:staging
```

El resultado local es `release/Vivero-Maestro-Staging-Setup-0.1.1.exe`. Se instala por usuario mediante NSIS, crea accesos directos en Escritorio y menú Inicio, no exige elevación, no se firma digitalmente y no publica artefactos ni configura actualizaciones automáticas. `release/`, los ejecutables y `.env.local` permanecen ignorados por Git.

No incluye edición de versiones, liberación automática, temporizadores, activación, cierre, cancelación o eliminación de jornadas fuera de las operaciones ya habilitadas para staging.
