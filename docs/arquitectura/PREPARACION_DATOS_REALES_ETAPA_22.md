# ETAPA 22 — Preparación privada de datos reales

## Resultado

Los cinco bloques requeridos quedaron completos y sin errores en el conjunto local ignorado por Git: estructura, inventario inicial, usuarios, históricos y dispositivos/conectividad. El repositorio no contiene nombres, correos, cantidades, fuentes identificables, modelos reales ni el paquete generado.

La fuente tabular se procesó en modo de solo lectura. Se incluyeron únicamente las hojas visibles declaradas como módulos; la hoja excluida por el propietario y cualquier hoja oculta quedaron fuera. Los valores ausentes no se convirtieron automáticamente en cero.

## Líneas vacías confirmadas

La fuente y la confirmación posterior del propietario identificaron líneas activas realmente vacías. El formato de migración admite esos ceros solo con `lineaVaciaConfirmada: true` y una referencia trazable. Un cero sin la marca continúa bloqueado; una cantidad positiva marcada como vacía también se rechaza.

El preflight emite `LINEA_VACIA_CONFIRMADA` como advertencia no bloqueante. La importación conserva la marca tanto en el inventario oficial como en el registro inmutable de carga inicial. Este tratamiento se limita a la migración controlada y no modifica la política pendiente para conteos operativos en cero.

## Operación sin cobertura

La matriz privada diferencia zonas con cobertura y zonas físicamente fuera del alcance de la red. Vivero Campo debe capturar sin conexión en estas últimas y sincronizar al regresar a cobertura, usando las garantías offline e idempotentes existentes. No se inventaron duraciones para una ausencia de cobertura que depende de la ubicación.

## Paquete y frontera

El paquete `paquete-migracion-catalogo-v1` se construyó localmente después de completar estructura e inventario y de validar el conjunto completo. El hash, el paquete y su resumen permanecen bajo `.private/`.

No se ejecutaron lecturas o escrituras remotas, preflight contra producción, importación, creación de usuarios, despliegue, backup, restauración ni cambios en Firebase. El siguiente corte sigue condicionado a respaldo restaurable, validación remota, resolución de conflictos, secretos productivos, ventana y autorización expresa.
