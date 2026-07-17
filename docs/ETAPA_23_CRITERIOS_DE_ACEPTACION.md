# ETAPA 23 — Criterios de aceptación

## Registro en Campo

- [x] Auxiliar, supervisor y administrador activos pueden abrir el módulo de descartes.
- [x] La línea se selecciona desde el catálogo central y muestra inventario y versión observada.
- [x] La captura registra hembras, machos, patrones y las cinco causas aprobadas.
- [x] El total único es la suma por categoría de planta; las causas pueden superponerse.
- [x] Se exige al menos una planta y una causa, y ninguna causa individual puede superar el total único.
- [x] Room conserva catálogo y borrador por cuenta y dispositivo.
- [x] Una sesión previamente iniciada, el catálogo en caché y el borrador se restauran sin cobertura.
- [x] WorkManager sincroniza al recuperar conexión con una clave idempotente estable.

## Revisión en Maestro

- [x] Administrador y supervisor ven una bandeja de descartes pendientes en tiempo real.
- [x] Aprobar y devolver son decisiones explícitas; Maestro no edita la captura.
- [x] Devolver exige motivo y no modifica inventario.
- [x] Un supervisor no puede aprobar su propio descarte.
- [x] La autorrevisión administrativa exige un motivo de excepción auditado.

## Inventario y concurrencia

- [x] Registrar un descarte no modifica el inventario oficial.
- [x] Aprobar descuenta una sola vez las tres categorías y el total único.
- [x] La transacción impide cantidades negativas y comprueba la versión observada.
- [x] Si dos descartes pendientes parten de la misma versión, la primera aprobación vuelve obsoleta la segunda.
- [x] Registro, decisión, movimiento, auditoría e idempotencia se conservan por separado.
- [x] Los clientes no pueden escribir directamente esas colecciones.

## Fronteras

- [x] Se agregaron contratos Draft 2020-12 para las cuatro operaciones.
- [x] No se incluyeron datos personales, cantidades reales, secretos ni archivos privados.
- [x] No se desplegó Firebase, no se importaron datos y no se crearon cuentas.
- [x] La matriz completa de CI quedó verde antes de solicitar la fusión.
