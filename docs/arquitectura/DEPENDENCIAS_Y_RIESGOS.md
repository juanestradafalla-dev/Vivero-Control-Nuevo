# Dependencias y riesgos — ETAPA 20

## Estado vigente

Este documento sustituye las conclusiones operativas de etapas anteriores. Los documentos numerados de ETAPA 1 a 19 explican la evolución histórica, pero la arquitectura vigente es la descrita en `PRODUCCION_ETAPA_20.md`.

Vivero Maestro ya usa Electron, React y TypeScript. Los estados de jornada, inventario inicial, validación, importación y reversión controlada ya están implementados. La ETAPA 20 habilita su código en `PRODUCTION` sin desplegarlo ni usar datos reales.

Solo existen dos ambientes funcionales: `EMULATOR` sobre `demo-*` y `PRODUCTION` sobre `viverocontrol-3f83f`. No existe staging funcional.

## Dependencias principales

### Android

- Android Gradle Plugin 9.2.1, Kotlin/Compose 2.3.21 y Java 17 para compilación.
- Compose, Lifecycle, Firebase Android BoM, Room 2.8.4 y WorkManager 2.11.2.
- Android Keystore con AES-GCM para tokens de reserva.
- SDK de compilación Android 36.1 y JDK 21 en CI.

### Maestro

- Node.js 22.
- Electron 43, React 19, Vite 8, TypeScript 5.9 y Firebase Web SDK 12.
- Electron Builder 26 queda configurado, pero no se ejecuta para producir el instalador definitivo.

### Backend

- Node.js 22.
- Firebase Functions 7.2.5 y Firebase Admin 13.10.0.
- Firebase Emulator Suite mediante Firebase Tools 15.23.0.
- Firestore Rules Unit Testing y Vitest.

## Auditorías npm del 16 de julio de 2026

Se ejecutó `npm audit --omit=dev --audit-level=high`:

| Componente | Resultado |
|---|---|
| Contratos | 0 vulnerabilidades |
| Vivero Maestro | 0 vulnerabilidades |
| Backend Functions | 8 moderadas; 0 altas y 0 críticas |

Las ocho alertas del backend provienen de `uuid <11.1.1` a través de dependencias transitivas de Firebase/Google (`gaxios`, `google-gax`, Firestore, Storage, `retry-request` y `teeny-request`). La corrección automática disponible exige `--force` y propone una regresión mayor de `firebase-admin`; no se aplica sin una actualización compatible y pruebas completas. El código del proyecto usa `node:crypto.randomUUID` y no llama UUID v3, v5 o v6 con búfer, pero esto no elimina la necesidad de actualizar la cadena.

CI falla ante vulnerabilidades altas o críticas y mantiene visibles las moderadas. Este criterio no autoriza un despliegue.

## Riesgos pendientes para ETAPA 21

### Corte y datos

- aprobar la jerarquía real, fuentes, fecha de corte e inventario inicial;
- limpiar o respaldar el proyecto antes de cargar información real;
- definir propietario, doble revisión y recuperación para importaciones;
- probar restauración y reversión operacional, no solo la reversión técnica de un paquete intacto;
- conservar fuera de Git cualquier paquete real de migración.

### Identidad y acceso

- crear y validar cuentas reales y perfiles centrales sin modificar usuarios existentes por accidente;
- definir alta, recuperación, baja y responsables de credenciales;
- revisar autorizaciones iniciales de jornadas y el principio de mínimo privilegio;
- decidir App Check y controles de dispositivos antes de operación abierta.

### Firebase

- crear localmente la configuración de Functions con `APP_ENV=production`;
- revisar reglas, índices, regiones, límites, cuotas, presupuesto y alertas antes del despliegue;
- desplegar en orden controlado y verificar `nam5` / `us-central1`;
- ejecutar pruebas de humo con cuentas y datos específicamente aprobados, nunca desde CI;
- definir rollback de código y datos para cada paso.

### Clientes

- probar Campo en modelos Android y condiciones de señal reales;
- definir retención local, pérdida o invalidación de Keystore y reemplazo de dispositivos;
- generar y custodiar una llave de firma Android real;
- definir certificados, firma, distribución y actualizaciones de Vivero Maestro;
- dividir el bundle de Maestro si las mediciones de arranque confirman impacto; Vite advierte actualmente un chunk minificado de 867,39 kB;
- producir APK e instalador únicamente después de validar Firebase y el plan de soporte.

### Operación

- establecer monitoreo de Functions, sincronización, reservas, correcciones y costos;
- definir responsables y tiempos de respuesta;
- fijar retención de auditoría, backups y pruebas periódicas de restauración;
- confirmar en la ejecución remota de CI la matriz con Node 22; la verificación local se ejecutó con Node 24.15.0 y JDK 21;
- resolver la cadena transitiva moderada del backend o documentar una aceptación formal con fecha de vencimiento.

## Controles que no deben retirarse

- frontera exacta de proyecto y ambiente;
- autenticación y perfil activo;
- autorización por rol y jornada;
- validación central, versiones, idempotencia y transacciones;
- auditoría y trazabilidad inmutable;
- Firestore Rules con denegación final;
- aislamiento local entre emulator y production;
- prohibición de secretos, despliegues y artefactos definitivos en CI.
