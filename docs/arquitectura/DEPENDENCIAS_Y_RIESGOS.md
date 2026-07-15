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

`npm audit --omit=dev` informó 8 vulnerabilidades moderadas, 0 altas y 0
críticas. El aviso raíz es `GHSA-w5hq-g745-h8pq`, una falta de comprobación de
límites en `uuid` menor que 11.1.1 al usar un búfer con UUID v3, v5 o v6.

| Paquete informado | Relación | Severidad |
|---|---|---|
| `firebase-admin` 13.10.0 | Directa | Moderada |
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

- las 8 alertas moderadas transitivas del backend continúan sin altas ni críticas;
- ningún control local equivale a autorización para producción;
- la calidad de red, compatibilidad con dispositivos reales y tolerancia del reloj siguen sin validación de campo;
- el seed de inventario es completamente ficticio y no puede interpretarse como dato migrable;
- la corrección versionada existe solo para el autor original y no incluye reasignación ni liberación;
- una aprobación requiere inventario inicial; la ausencia produce rollback y necesita intervención operativa futura, no un cero automático.

Las operaciones de revisión conservan el bloqueo `FUNCTIONS_EMULATOR=true` más proyecto `demo-*`. CI continúa sin pasos de despliegue.

## Actualización de la ETAPA 6

No se agregan dependencias externas. Room migra de 2 a 3 para conservar metadatos de la reserva de corrección; el token continúa cifrado con Android Keystore y se elimina tras la confirmación central.

Persisten los riesgos de compatibilidad con dispositivos reales, pérdida de claves del Keystore, señal real, retención local y alertas moderadas transitivas del backend. La corrección por un usuario distinto, la reasignación y la liberación permanecen fuera de alcance. Firebase real sigue sin configurarse ni desplegarse.
