# Catálogo de ubicaciones y líneas — ETAPA 16

## Modelo central

`ubicaciones/{ubicacionId}` forma un árbol genérico mediante `ubicacionPadreId`. El backend genera todos los IDs y conserva código normalizado, tipo y padre como estructura inmutable. Nombre visible, orden y estado son los únicos datos editables y cada cambio incrementa `version`.

`lineas/{lineaId}` referencia una ubicación activa. Código y ubicación quedan inmutables; nombre, orden y estado son versionados. `bloqueosCodigosCatalogo/{hash}` garantiza código de ubicación único entre hermanos y código de línea único dentro de su ubicación, incluso ante creaciones concurrentes.

## Invariantes transaccionales

- Solo un perfil central `ADMINISTRADOR` activo usa las cinco Callables.
- Crear o reactivar una ubicación exige toda su cadena de padres activa y sin ciclos.
- Una ubicación con hijas o líneas activas no puede desactivarse.
- Una línea asociada a `ocupacionesLineasActivas/{lineaId}` no puede editarse ni desactivarse.
- Las selecciones preparatorias nunca se eliminan al desactivar una línea.
- Ninguna operación borra documentos, propaga estados en cascada, modifica jornadas operativas o toca inventario.
- Misma clave y payload recuperan el resultado; otro payload produce `IDEMPOTENCY_CONFLICT`.

## Compatibilidad y decisiones pendientes

La jerarquía real continúa pendiente. Los tipos `VIVERO`, `MODULO` y `CAMA` del seed son fixtures ficticios, no niveles aprobados para producción. Al activar una jornada se crea una fotografía visible compatible con Campo a partir de la ruta genérica; las fotografías ya materializadas nunca se reescriben.

No existe importación de datos reales, reestructuración masiva ni inicialización de inventario. Todo opera exclusivamente en Firebase Emulator Suite.
