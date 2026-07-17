# Preflight de migración — ETAPA 18

## Frontera

`validarPaqueteMigracion` es una Callable de lectura exclusiva para un `ADMINISTRADOR` central activo. Conserva el bloqueo `FUNCTIONS_EMULATOR=true` y proyecto `demo-*`. Recibe directamente un objeto `paquete-migracion-catalogo-v1`; no acepta identidad, roles ni IDs internos de Firestore.

El formato contiene solo:

- metadatos ficticios del paquete;
- ubicaciones relacionadas por `claveExterna` y `ubicacionPadreClaveExterna`;
- líneas relacionadas por `ubicacionClaveExterna`;
- inventarios relacionados por `lineaClaveExterna`.

No admite usuarios, correos, contraseñas, cuentas Firebase Auth, datos personales, `total` ni campos centrales. El backend normaliza códigos con el mismo criterio del catálogo, calcula cada total y obtiene el hash SHA-256 de una representación normalizada con arreglos ordenados.

## Validaciones

El validador aplica estructura estricta, tamaño y cantidades máximas, claves y códigos únicos, referencias, ciclos, enteros seguros, suma segura, bloqueo de total cero, fuente trazable de al menos tres caracteres y detección defensiva de secretos. Toda línea activa debe incluir exactamente un inventario inicial.

Después lee el catálogo, inventario, ocupaciones, `jornadaLineas` y jornadas actuales. Clasifica elementos como nuevos, coincidentes o bloqueados y reporta códigos existentes, claves incompatibles, inventario previo y conflictos operativos.

## Garantía de cero escrituras

La implementación solo usa lecturas `get()`. No ejecuta `runTransaction`, `batch`, `create`, `set`, `update` ni `delete`; tampoco crea auditoría, idempotencia o documentos temporales. La prueba integrada recorre todas las colecciones y subcolecciones antes y después y exige una representación idéntica.

`aptoParaImportar` es un resumen informativo. No autoriza importación, no reserva IDs y no garantiza que el catálogo permanezca igual después de validar.

## Plantilla y privacidad

La plantilla `data/templates/paquete-migracion-catalogo-v1.example.json` contiene únicamente valores `PRUEBA`. No representa el vivero real. Maestro mantiene el archivo seleccionado solo en memoria y exporta exclusivamente el informe, nunca el paquete original.

Los paquetes reales o privados deben mantenerse fuera del repositorio. Importación, reversión, migración efectiva y Firebase productivo permanecen fuera de alcance.
