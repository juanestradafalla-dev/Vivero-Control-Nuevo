# Importación controlada y reversión segura — ETAPA 19

## Frontera de seguridad

`importarPaqueteMigracion`, `listarImportacionesMigracion` y `revertirImportacionMigracion` aceptan únicamente un `ADMINISTRADOR` central activo. Las tres Callables ejecutan el bloqueo `FUNCTIONS_EMULATOR=true` y proyecto `demo-*`; no existe ruta productiva ni comando de despliegue.

La importación recibe el paquete v1, `hashEsperado`, `confirmacionHash` y `claveIdempotencia`. Reutiliza exactamente `validateMigrationPackage`, normaliza nuevamente el JSON, recalcula SHA-256 y vuelve a leer el catálogo dentro de la transacción. Un elemento coincidente también se rechaza: esta etapa no mezcla ni actualiza registros existentes.

## Transacción de importación

La proyección es `2 × (ubicaciones + líneas + inventarios) + 4`: cada entidad crea su documento y trazabilidad asociada; las cuatro escrituras finales corresponden al registro histórico, bloqueo permanente de hash, auditoría e idempotencia. El máximo seguro es 450. Si se supera o falla cualquier lectura, hash, permiso o validación, no se confirma ninguna escritura.

El backend genera todos los IDs. Crea ubicaciones en orden de padres, líneas, bloqueos deterministas de códigos, inventarios versión 1 y cargas iniciales `MIGRACION_CONTROLADA`. No crea movimientos porque no existe fotografía anterior. `importacionesMigracion` conserva solo hash, cantidades, mapa, actor, fecha, versión y estado `APLICADA`; nunca almacena el paquete original. La reversión mantiene compatibilidad con el origen histórico `MIGRACION_CONTROLADA_EMULADOR`.

`bloqueosHashesMigracion` proporciona exclusión concurrente y permanece aunque la importación sea revertida. La misma clave y payload recuperan el resultado; otra solicitud con la misma clave produce `IDEMPOTENCY_CONFLICT`, y otra clave con el mismo hash produce `MIGRATION_HASH_ALREADY_IMPORTED`.

## Reversión

Antes de borrar, la transacción exige recursos versión 1, origen migrado, bloqueos intactos y ausencia de selección en borrador, ocupación, `jornadaLinea`, reserva, conteo, decisión, corrección, movimiento, línea externa o hijo externo. Cualquier uso o modificación bloquea toda la reversión.

Una reversión elegible elimina únicamente ubicaciones, líneas, bloqueos de códigos, inventarios y cargas creados por esa importación. Actualiza el registro a `REVERTIDA` y conserva mapa, hash, auditorías, idempotencia y bloqueo de hash. No existe borrado del registro histórico ni reversión forzada.

## Alcance

La plantilla y todas las pruebas son ficticias. Esta etapa no constituye una migración real ni autorización productiva. Datos reales, importación fuera del límite, mezcla, actualización, reversión excepcional, usuarios, Firebase Auth, Firebase real y despliegues permanecen fuera de alcance.
