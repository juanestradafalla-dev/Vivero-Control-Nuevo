# ETAPA 21 — Clasificación sanitizada de recursos

> **Estado posterior:** el 17 de julio de 2026 el propietario resolvió la clasificación de las 3 cuentas y los 41 documentos como datos de prueba y los eliminó manualmente. Este archivo conserva el inventario previo para trazabilidad. Véase `../ETAPA_21_FASE_B1_LIMPIEZA_MANUAL.md`.

## Alcance y fuente

Esta preparación no inicia la FASE B. El inventario identificable se generó el 17 de julio de 2026 mediante una ejecución local, manual y estrictamente de lectura contra el único proyecto autorizado, `viverocontrol-3f83f`. La hoja completa está bajo `.private/`, permanece ignorada y no se reproduce aquí.

La herramienta aborta en CI, restringe el Project ID y las rutas remotas, no contiene operaciones de mutación y no enumera, abre ni descarga objetos de Storage. La ejecución informó `REMOTE_MUTATIONS=0` y `STORAGE_OBJECTS_OPENED=0`.

## Resultado sanitizado

| Categoría | Cantidad | Clasificación inicial | Decisión pendiente del propietario |
|---|---:|---|---|
| aplicaciones con nombre Staging | 2 | `CANDIDATO_ELIMINACION_FUTURA` | confirmar `CONSERVAR` o mantener la candidatura futura |
| aplicación Android heredada | 1 | `REQUIERE_REVISION` | confirmar consumidor y destino |
| cuentas Authentication | 3 | `REQUIERE_REVISION` | clasificar una por una como real, prueba futura o revisión |
| perfiles `usuarios/{uid}` existentes | 3 | protegidos | confirmar rol, estado y correspondencia con la cuenta |
| cuentas con referencias operativas | 3 | protegidas | revisar dependencias antes de cualquier decisión futura |
| grupos Firestore de nivel superior | 11 | `REQUIERE_REVISION` | clasificar por grupo y luego por documento exacto |
| grupos Firestore anidados | 1 | `REQUIERE_REVISION` | clasificar junto con su documento padre |
| documentos de nivel superior | 38 | `REQUIERE_REVISION` | no inferir que son datos de prueba |
| documentos anidados | 3 | `REQUIERE_REVISION` | no inferir que son datos de prueba |
| principales IAM administrativos | 5 | `REQUIERE_REVISION` | identificar responsables autorizados o retiros futuros |
| Functions desplegadas | 11 | `CONSERVAR_HASTA_REEMPLAZO_CONTROLADO` | ninguna es objetivo de limpieza ahora |
| buckets técnicos de Functions | 2 | `CONSERVAR` | no eliminar ni modificar |
| objetos técnicos | no reenumerados en esta preparación | `CONSERVAR` | no abrir, descargar ni eliminar |

Veinte de los 41 documentos presentan uno o más marcadores textuales de prueba. Ese indicio solo ayuda al propietario a reconocerlos: los 41 siguen `REQUIERE_REVISION` y ninguno pasa automáticamente a `ELIMINAR_DESPUES`.

## Opciones registradas en la hoja privada

- aplicaciones: `CONSERVAR`, `CANDIDATO_ELIMINACION_FUTURA` o `REQUIERE_REVISION`;
- cuentas: `CUENTA_REAL_CONSERVAR`, `CUENTA_PRUEBA_ELIMINAR_DESPUES` o `REQUIERE_REVISION`;
- grupos y documentos Firestore: `CONSERVAR`, `ELIMINAR_DESPUES` o `REQUIERE_REVISION`;
- principales IAM: `RESPONSABLE_AUTORIZADO`, `RETIRAR_DESPUES` o `REQUIERE_REVISION`.

La hoja privada muestra correos solo localmente, enmascara UID, relaciona perfiles y referencias operativas, y presenta los principales IAM de forma reconocible. Para Firestore conserva rutas navegables y solo extractos de identificación, relaciones, estados y marcadores; los campos con apariencia de token, contraseña, secreto o credencial se omiten.

## Bloqueo de limpieza

El estado obligatorio es:

```text
BACKUP_PENDIENTE
```

La decisión del propietario aplaza backups, PITR, protección contra borrado y restauración. Esa decisión no elimina la puerta previa: mientras `BACKUP_PENDIENTE` exista, ninguna cuenta, aplicación, documento, Function, bucket, objeto o principal IAM está autorizado para borrado o reemplazo. La preparación solo produce información y no incluye una herramienta de limpieza.
