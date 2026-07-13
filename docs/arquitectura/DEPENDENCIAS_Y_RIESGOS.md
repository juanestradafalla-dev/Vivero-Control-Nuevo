# Dependencias y riesgos

## Alcance de la revisión

Registro obtenido el 13 de julio de 2026 con:

```powershell
npm audit --omit=dev
```

No se ejecutó `npm audit fix --force`. La comprobación
`npm audit fix --dry-run --omit=dev` no encontró una actualización compatible
del árbol productivo del backend (`changed: 0`).

## Vivero Maestro

`npm audit --omit=dev` informó 0 vulnerabilidades: 0 bajas, 0 moderadas, 0
altas y 0 críticas.

## Backend Functions

`npm audit --omit=dev` informó 8 vulnerabilidades moderadas, 0 altas y 0
críticas. Todas derivan del aviso de `uuid` sobre falta de comprobación de
límites al usar un búfer en UUID v3, v5 o v6.

| Paquete informado | Relación | Severidad | Componente | Corrección compatible actual |
|---|---|---|---|---|
| `firebase-admin` 13.10.0 | Directa | Moderada, por Firestore y Storage | Backend | No; Functions 7.2.5 declara compatibilidad con Admin 11, 12 o 13, no con 14. |
| `@google-cloud/firestore` | Transitiva | Moderada | Backend | No desde las dependencias directas actuales. |
| `@google-cloud/storage` | Transitiva | Moderada | Backend | No desde las dependencias directas actuales. |
| `google-gax` | Transitiva | Moderada | Backend | No desde las dependencias directas actuales. |
| `gaxios` | Transitiva | Moderada | Backend | El registro indica una versión corregida, pero el dry-run no pudo adoptarla sin alterar el árbol soportado. |
| `retry-request` | Transitiva | Moderada | Backend | No desde las dependencias directas actuales. |
| `teeny-request` | Transitiva | Moderada | Backend | No desde las dependencias directas actuales. |
| `uuid` menor que 11.1.1 | Transitiva | Moderada | Backend | No sin cambiar dependencias superiores; no se fuerza un override incompatible. |

Aviso raíz: `GHSA-w5hq-g745-h8pq`, “Missing buffer bounds check in v3/v5/v6
when buf is provided”.

## Exposición en la ETAPA 2

No existe exposición remota de estas dependencias en esta etapa porque:

- `backend/functions/src/index.ts` no exporta ninguna Function;
- ningún servicio Firebase real está configurado ni desplegado;
- las operaciones críticas devuelven explícitamente “no disponible”;
- Firestore mantiene denegación total para clientes;
- las pruebas usan exclusivamente el emulador y proyectos `demo-*`.

Esta ausencia de exposición no convierte el aviso en aceptado para producción.
Antes de desplegar cualquier Function es obligatorio actualizar a una cadena
compatible que elimine el aviso o registrar una aceptación formal del riesgo,
con responsable, alcance, controles compensatorios y fecha de revisión.

## Política de CI

Maestro y backend ejecutan:

```powershell
npm audit --omit=dev --audit-level=high
```

Las alertas moderadas siguen visibles y documentadas. Cualquier alerta alta o
crítica hace fallar CI. El umbral no autoriza a desplegar con alertas moderadas.
