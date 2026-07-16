# Dependencias y riesgos

## Revisión

Registro actualizado el 13 de julio de 2026 con:

```powershell
npm audit --omit=dev
npm audit fix --dry-run --omit=dev
```

No se ejecutó `npm audit fix` ni `npm audit fix --force`.

## Vivero Maestro

`npm audit --omit=dev` informó 0 vulnerabilidades: 0 bajas, 0 moderadas, 0
altas y 0 críticas.

## Backend Functions

`npm audit --omit=dev` informó 9 vulnerabilidades moderadas, 0 altas y 0
críticas. El aviso raíz es `GHSA-w5hq-g745-h8pq`, una falta de comprobación de
límites en `uuid` menor que 11.1.1 al usar un búfer con UUID v3, v5 o v6.

| Paquete informado | Relación | Severidad |
|---|---|---|
| `firebase-admin` 13.10.0 | Directa | Moderada |
| `firebase-functions` 7.2.5 | Directa | Moderada |
| `@google-cloud/firestore` | Transitiva | Moderada |
| `@google-cloud/storage` | Transitiva | Moderada |
| `google-gax` | Transitiva | Moderada |
| `gaxios` | Transitiva | Moderada |
| `retry-request` | Transitiva | Moderada |
| `teeny-request` | Transitiva | Moderada |
| `uuid` | Transitiva, aviso raíz | Moderada |

El dry-run solo ofrece resolver todo mediante `--force`, instalando versiones
anteriores y con cambios mayores de las dependencias directas. Ese cambio no se
aplica porque podría romper compatibilidad y no constituye una actualización
segura del árbol aprobado.

## Android en la ETAPA 4

Se incorporan WorkManager 2.11.2 para trabajo persistente con restricción de red y pruebas locales con Room/Robolectric. El token de reserva usa AES-GCM y una clave no exportable de Android Keystore. Los riesgos pendientes son compatibilidad con modelos reales, pérdida o invalidación de claves por condiciones del dispositivo, retención local y calidad de señal; no se inventan políticas para ellos.

La migración Room 1 a 2 conserva reservas anteriores, pero no puede reconstruir tokens que la Etapa 3 nunca persistió. El entorno ficticio debe reiniciar el escenario; queda prohibido resolverlo guardando un token plano.

## Exposición en la ETAPA 4

Las Functions `reservarLinea` y `enviarConteo` existen, pero el riesgo permanece contenido en el
entorno local porque:

- la Function exige `FUNCTIONS_EMULATOR=true` y un proyecto `demo-*`;
- no existe proyecto Firebase real, credencial ni despliegue;
- CI solo ejecuta Emulator Suite y no contiene pasos de despliegue;
- el código de negocio genera UUID con `node:crypto.randomUUID`, no invoca las
  variantes v3, v5 o v6 afectadas de la dependencia transitiva;
- las operaciones persisten únicamente el hash central y el token local cifrado;
- `enviarConteo` no escribe inventario oficial y todas sus escrituras son transaccionales.

Estos controles no aceptan el riesgo para producción. Antes de desplegar
cualquier Function se debe actualizar a una cadena compatible sin el aviso o
registrar una aceptación formal con responsable, alcance, controles y fecha de
revisión.

## Política de CI

Maestro y backend ejecutan:

```powershell
npm audit --omit=dev --audit-level=high
```

Las alertas moderadas permanecen visibles y documentadas. Cualquier alerta alta
o crítica hace fallar CI. El umbral no autoriza despliegues y el workflow no
contiene ninguno.

## Actualización de la ETAPA 5

La revisión agrega dos Callables y lecturas de inventario en Maestro sin incorporar dependencias nuevas. Se mantienen las versiones bloqueadas y el mismo perfil de auditoría.

Riesgos vigentes:

- las 9 alertas moderadas del backend continúan sin altas ni críticas;
- ningún control local equivale a autorización para producción;
- la calidad de red, compatibilidad con dispositivos reales y tolerancia del reloj siguen sin validación de campo;
- el seed de inventario es completamente ficticio y no puede interpretarse como dato migrable;
- la corrección versionada existe solo para el autor original y no incluye reasignación ni liberación;
- una aprobación requiere inventario inicial; la ausencia produce rollback y necesita intervención operativa futura, no un cero automático.

Las operaciones de revisión conservan el bloqueo `FUNCTIONS_EMULATOR=true` más proyecto `demo-*`. CI continúa sin pasos de despliegue.

## Actualización de la ETAPA 6

No se agregan dependencias externas. Room migra de 2 a 3 para conservar metadatos de la reserva de corrección; el token continúa cifrado con Android Keystore y se elimina tras la confirmación central.

Persisten los riesgos de compatibilidad con dispositivos reales, pérdida de claves del Keystore, señal real, retención local y alertas moderadas transitivas del backend. La corrección por un usuario distinto, la reasignación y la liberación permanecen fuera de alcance. Firebase real sigue sin configurarse ni desplegarse.

## Actualización de la ETAPA 7

No se agregan dependencias externas ni migraciones Room. La reasignación reutiliza Functions, transacciones, Auth y contratos existentes. Maestro construye candidatos desde autorizaciones de jornada con nombre, rol y actividad denormalizados por el seed; el backend vuelve a validar el perfil vigente antes de escribir.

Persisten los riesgos de señal y dispositivos reales, retención local, pérdida de claves Keystore y alertas moderadas transitivas del backend. Un usuario seleccionado puede adquirir otra reserva antes de iniciar la corrección; en ese caso el backend rechaza el inicio con `ACTIVE_RESERVATION_EXISTS` y la reasignación permanece visible para decisión supervisada posterior. No se implementa liberación. Firebase real continúa sin configurarse ni desplegarse.

## Actualización de la ETAPA 8

No se agregan dependencias externas ni migraciones Room. La liberación reutiliza Auth, Functions, transacciones, auditoría, idempotencia, snapshots y WorkManager existentes. La reserva consumida guarda `conteoId` para resolver la carrera liberar/enviar mediante la misma disputa documental y devolver siempre un resultado o error controlado.

La operación es exclusivamente manual: no hay temporizadores, vencimiento ni inferencia de abandono. Un borrador liberado y su token cifrado permanecen en el dispositivo hasta que exista una política posterior; esto evita pérdida silenciosa, pero mantiene pendiente la retención local definitiva. También persisten los riesgos de señal y dispositivos reales, pérdida de claves Keystore y alertas moderadas transitivas del backend. Firebase real continúa sin configurarse ni desplegarse.

## Actualización de la ETAPA 9

No se agregan dependencias externas, migraciones Room ni índices de producción. La selección dinámica reutiliza Auth, Functions y snapshots existentes; cada cambio de Maestro cancela todas las suscripciones anteriores antes de abrir las nuevas.

Persisten los riesgos de señal y dispositivos reales, retención local, pérdida de claves Keystore y alertas moderadas transitivas del backend. La fecha central ordena la lista, pero la política operativa para nombrar, crear, activar y cerrar jornadas continúa fuera de alcance. Firebase real sigue sin configurarse ni desplegarse.

## Actualización de la ETAPA 10

No se agregan dependencias externas, migraciones Room ni índices de producción. La gestión de borradores reutiliza Auth, Functions, transacciones, auditoría e idempotencia. La selección se conserva en una colección de preparación separada y no materializa líneas operativas ni inventario.

Persisten como decisiones futuras la activación, el cierre, la cancelación, la eliminación y la autorización de usuarios. Una línea puede dejar de ser seleccionable entre la lectura del catálogo y la confirmación; el backend vuelve a validar todo dentro de la operación y rechaza la escritura completa. También continúan pendientes la estructura real del vivero, los datos reales, la señal y dispositivos reales, la retención local y las alertas moderadas transitivas del backend. Firebase real sigue sin configurarse ni desplegarse.

## Actualización de la ETAPA 11

No se agregan dependencias externas, migraciones Room ni índices de producción. La preparación de participantes reutiliza Auth, Functions, transacciones, auditoría e idempotencia y permanece en una colección separada de las autorizaciones operativas.

Un perfil seleccionado puede quedar inactivo o cambiar de rol antes de una futura activación; esta etapa valida el estado al guardar, pero la operación de activación deberá volver a validar todos los perfiles y definir el rol efectivo definitivo. Activación, creación de cuentas y edición de roles o perfiles continúan fuera de alcance. Persisten además los riesgos de datos, señal y dispositivos reales, retención local y alertas moderadas transitivas del backend. Firebase real sigue sin configurarse ni desplegarse.

## Actualización de la ETAPA 12

No se agregan dependencias externas, migraciones Room ni índices de producción. La activación reutiliza Auth, Functions, transacciones, auditoría e idempotencia. La revalidación central resuelve el riesgo de perfiles o líneas que cambian después de preparar el borrador; las tres versiones esperadas evitan confirmar un resumen obsoleto.

El bloqueo determinista por `lineaId` evita dos jornadas activas simultáneas. Su ciclo de liberación queda pendiente porque cierre, cancelación y reapertura no existen aún. El límite combinado de 200 mantiene el peor caso en 402 escrituras dentro de una única transacción, pero deberá revisarse con la estructura real del vivero antes de producción.

Persisten los riesgos de estructura y datos reales, calidad de señal, dispositivos Android reales, retención local, pérdida de claves Keystore y 8 alertas moderadas transitivas del backend, sin alertas altas ni críticas en la auditoría actual. No se inicializa inventario: una jornada activa puede tener líneas sin fotografía oficial y una aprobación futura continuará rechazándose hasta contar con inventario inicial válido. Firebase real sigue sin configurarse ni desplegarse.

## Actualización de la ETAPA 13

No se agregan dependencias externas, migraciones Room ni índices de producción. El cierre reutiliza Auth, Functions, transacciones, auditoría, idempotencia y el bloqueo determinista de líneas. El máximo combinado de 200 limita el peor caso a 403 escrituras y evita cualquier cierre por lotes.

La liberación de ocupaciones permite reutilizar líneas físicas en nuevos borradores, pero no autoriza reapertura ni edición histórica. Una ocupación faltante o perteneciente a otra jornada bloquea el cierre para evitar ocultar inconsistencias. Campo conserva los datos locales ante revocación; la política definitiva de retención local sigue pendiente.

Persisten los riesgos de estructura y datos reales, calidad de señal, dispositivos Android reales, pérdida de claves Keystore y 9 alertas moderadas transitivas del backend, sin alertas altas ni críticas. No existe cierre forzado para resolver trabajo pendiente: debe completarse por los flujos normales. Firebase real sigue sin configurarse ni desplegarse.

## Actualización de la ETAPA 14

No se agregan dependencias externas, migraciones Room ni índices de producción. Cancelación y reapertura reutilizan Auth, Functions, transacciones, auditoría e idempotencia. La cancelación verifica que el borrador nunca haya materializado datos operativos; la reapertura exige la marca central `CANCELACION_BORRADOR` y ausencia de cualquier activación o cierre normal.

Las selecciones conservadas pueden quedar obsoletas mientras la jornada permanece cancelada. Esto es intencional: no se revalidan al reabrir y deben volver a validarse al editar o activar. El historial inmutable de cancelaciones crece con cada nuevo ciclo y requerirá una política de retención antes de producción.

Persisten los riesgos de estructura y datos reales, calidad de señal, dispositivos Android reales, pérdida de claves Keystore y 9 alertas moderadas transitivas del backend, sin alertas altas ni críticas. No se implementan cancelación de jornadas activas, reapertura de jornadas activadas o cerradas, eliminación definitiva ni cierre forzado. Firebase real sigue sin configurarse ni desplegarse.

## Actualización de la ETAPA 15

No se agregan dependencias externas ni migraciones Room. La administración de perfiles reutiliza Auth Emulator, Functions, Firestore, transacciones, auditoría e idempotencia. Firebase Auth permanece fuera de las escrituras: desactivar un perfil central bloquea operaciones sin deshabilitar ni eliminar la cuenta técnica del emulador.

Una desactivación con trabajo activo conserva deliberadamente reservas, correcciones y autorizaciones. Esto evita cambios silenciosos, pero exige una decisión posterior de liberación, reasignación o reactivación. El listener del perfil propio permite invalidar la sesión en línea; sin conectividad, cualquier intento central se rechazará cuando alcance el backend y el borrador local continuará protegido.

Persisten los riesgos de estructura y datos reales, calidad de señal, dispositivos Android reales, pérdida de claves Keystore, retención local y alertas moderadas transitivas del backend. No se crean ni eliminan cuentas, no se cambian credenciales y no se editan autorizaciones activas. Firebase real sigue sin configurarse ni desplegarse.
