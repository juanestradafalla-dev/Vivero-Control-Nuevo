# Dependencias y riesgos — ETAPA 21 FASE A

## Estado vigente

Este documento sustituye las conclusiones operativas de etapas anteriores. La arquitectura de código sigue descrita en `PRODUCCION_ETAPA_20.md`; el estado remoto comprobado está en `AUDITORIA_FIREBASE_ETAPA_21.md`.

Vivero Maestro ya usa Electron, React y TypeScript. Los estados de jornada, inventario inicial, validación, importación y reversión controlada ya están implementados. La ETAPA 20 habilita su código en `PRODUCTION` sin desplegarlo ni usar datos reales.

Solo existen dos ambientes funcionales: `EMULATOR` sobre `demo-*` y `PRODUCTION` sobre `viverocontrol-3f83f`. No existe staging funcional, aunque Firebase conserva dos registros de aplicación llamados Staging que deben revisarse antes de una limpieza.

## Evidencia remota de FASE A

- Firestore `(default)` está en `nam5`; PITR y protección de borrado están deshabilitados.
- No se listaron schedules o backups Firestore.
- Reglas e índices coinciden con el repositorio.
- Solo 11/30 Functions están activas; todas son Gen 2, Node 22 y `us-central1`.
- No existe el registro Android `com.arles.viverocampo` ni un registro Web productivo de Maestro.
- Authentication tiene 3 cuentas ambiguas y solo Email/Password habilitado.
- Firestore contiene 38 documentos ambiguos de nivel superior en 11 colecciones; la ejecución original detectó `autorizaciones` sin cuantificar sus documentos y 10 colecciones contractuales aún no se materializan.
- Storage contiene dos buckets técnicos de Functions, 13 objetos y aproximadamente 5,62 MiB.
- Hay 5 principales con roles administrativos que requieren revisión de mínimo privilegio.
- Logging, Monitoring y facturación están habilitados; Secret Manager, Billing Budgets y cuotas no fueron completamente consultables.

No se ejecutaron escrituras ni se infiere que un recurso ambiguo sea eliminable.

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

## Auditorías npm del 17 de julio de 2026

Se ejecutó `npm audit --omit=dev --audit-level=high`:

| Componente | Resultado |
|---|---|
| Contratos | 0 vulnerabilidades |
| Vivero Maestro | 0 vulnerabilidades |
| Backend Functions | CI con Node 22: 9 moderadas de producción y 11 en el árbol instalado; revalidación local con Node 24: 8 de producción y 12 en el árbol completo; 0 altas y 0 críticas en ambos entornos |

Las alertas de producción del backend corresponden a paquetes de la cadena del advisory `uuid <11.1.1`, a través de dependencias de Firebase/Google (`gaxios`, `google-gax`, Firestore, Storage, `retry-request` y `teeny-request`); CI las contó como 9 y el host local como 8. El árbol local completo añadió el advisory de OpenTelemetry. La corrección automática completa exige `--force` y propone cambios mayores de dependencias; no se aplica sin una actualización compatible y pruebas completas. El código del proyecto usa `node:crypto.randomUUID` y no llama UUID v3, v5 o v6 con búfer, pero esto no elimina la necesidad de actualizar la cadena.

CI falla ante vulnerabilidades altas o críticas y mantiene visibles las moderadas. Este criterio no autoriza un despliegue.

## Riesgos que bloquean FASE B

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

- crear y verificar un backup restaurable antes de cualquier limpieza;
- aprobar el tratamiento de 3 cuentas, 38 documentos de nivel superior, todos los documentos anidados aún no cuantificados, 5 principales administrativos y registros heredados;
- crear localmente la configuración de Functions con `APP_ENV=production` y verificar su valor mediante un procedimiento autorizado;
- completar las 19 Functions ausentes y crear los registros productivos de Android/Maestro solo durante el corte aprobado;
- resolver acceso/herramientas para cuotas, secretos, presupuesto y alertas sin activar servicios fuera del cambio autorizado;
- desplegar en orden controlado y conservar `nam5` / `us-central1`;
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
