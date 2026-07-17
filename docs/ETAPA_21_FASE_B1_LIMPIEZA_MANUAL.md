# ETAPA 21 — FASE B1: limpieza manual de datos de prueba

## Estado

`COMPLETADA_POR_EL_PROPIETARIO_CON_VERIFICACION_VISUAL`

El 17 de julio de 2026 el propietario confirmó que las 3 cuentas Firebase Authentication y los 41 documentos Firestore inventariados —38 de nivel superior y 3 anidados— eran exclusivamente datos de prueba. Autorizó su eliminación irreversible, renunció expresamente a realizar un backup de ese conjunto y ejecutó la limpieza manual desde Firebase Console.

## Alcance ejecutado

| Recurso | Antes | Después | Evidencia |
|---|---:|---:|---|
| cuentas Authentication | 3 | 0 visibles | consola Authentication: “Este proyecto todavía no tiene usuarios” |
| documentos Firestore | 41 | 0 visibles | consola Firestore: base sin colecciones y lista para agregar datos |
| documentos superiores | 38 | 0 visibles | confirmación del propietario y consola vacía |
| documentos anidados | 3 | 0 declarados | confirmación del propietario tras instrucción explícita de eliminarlos antes de sus padres |

Las capturas fueron revisadas durante la operación, pero no se versionan para evitar conservar metadatos de consola. No se realizó una segunda enumeración mediante API o Firebase CLI; por tanto, el cierre distingue la evidencia visual y la declaración del propietario de una verificación remota automatizada.

## Recursos preservados

La autorización no incluyó y la limpieza manual no reportó cambios sobre:

- proyecto `viverocontrol-3f83f`;
- base Firestore `(default)` y ubicación `nam5`;
- reglas e índices;
- Functions en `us-central1`;
- Storage y buckets técnicos;
- IAM, APIs, facturación y secretos;
- registros de aplicaciones Firebase.

## Efecto sobre los bloqueos

`BACKUP_PENDIENTE` queda resuelto únicamente para la eliminación de este conjunto de prueba por renuncia expresa del propietario. No elimina la decisión pendiente sobre backups, PITR, retención, RPO, RTO y restauración antes de operar datos reales.

La limpieza no autoriza por sí sola importación, despliegue, creación de cuentas definitivas, creación o eliminación de Apps, ni puesta en producción. Esas acciones conservan sus propias puertas y autorizaciones.

## Próxima puerta

Antes de cargar información real deben aprobarse, en privado:

1. estructura completa del vivero;
2. inventario inicial, fuente, responsable y fecha de corte;
3. usuarios y roles definitivos;
4. decisión sobre históricos;
5. dispositivos y conectividad.
