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
| `firebase-functions` 7.2.5 | Directa, afectada por Admin | Moderada |
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

## Exposición en la ETAPA 3

La Function `reservarLinea` ya existe, pero el riesgo permanece contenido en el
entorno local porque:

- la Function exige `FUNCTIONS_EMULATOR=true` y un proyecto `demo-*`;
- no existe proyecto Firebase real, credencial ni despliegue;
- CI solo ejecuta Emulator Suite y no contiene pasos de despliegue;
- el código de negocio genera UUID con `node:crypto.randomUUID`, no invoca las
  variantes v3, v5 o v6 afectadas de la dependencia transitiva;
- la operación persiste únicamente el hash del token opaco.

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
