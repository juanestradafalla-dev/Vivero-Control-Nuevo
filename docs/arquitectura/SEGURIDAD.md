# Seguridad

## Identidad y autorización

Firebase Authentication identificará al usuario, pero el token no bastará para
autorizar una acción. El backend comprobará rol, estado de jornada, titularidad
de la reserva y precondiciones de versión. Las decisiones administrativas
excepcionales exigirán motivo y auditoría.

## Firestore y operaciones críticas

Las reglas iniciales deniegan toda lectura y escritura. Las aperturas futuras se
harán por caso de uso y tendrán pruebas positivas y negativas. Reservar, enviar,
liberar, devolver y aprobar se ejecutarán en Functions con transacciones e
idempotencia. Los clientes no podrán modificar directamente el inventario
oficial ni sus movimientos históricos.

## Clientes

- Android no solicita permisos innecesarios y no contiene configuración de
  Google Services.
- Electron usa `contextIsolation`, desactiva `nodeIntegration`, activa sandbox,
  limita el preload a una operación de solo lectura y rechaza navegación,
  ventanas nuevas y permisos.
- Datos, parámetros y timestamps enviados por los clientes son no confiables.
- Los DTO del cliente no incluyen actor, rol efectivo, permisos ni timestamp
  del servidor. Authentication y las fuentes centrales construyen un contexto
  interno separado antes de invocar una operación crítica.
- La CSP de Maestro bloquea `object-src`, `base-uri` y `form-action`. Las
  conexiones locales de Vite son exclusivas de desarrollo y deben eliminarse
  de la política final de producción cuando no sean necesarias.

## Secretos y ambientes

No se rastrean `.env`, `.firebaserc`, `google-services.json`, certificados,
claves o tokens. Los ejemplos solo usan valores ficticios. Desarrollo opera con
proyectos `demo-*` y emuladores; producción tendrá proyecto, acceso y credenciales
separados. CI no recibe secretos y no contiene pasos de despliegue.

## Auditoría

El backend registrará actor, recurso, tipo de operación, instante del servidor y
clave de idempotencia. Una autorrevisión administrativa excepcional además
registrará advertencia y motivo obligatorio. La retención y consulta de estos
eventos siguen pendientes de política.

## Estado actual

No hay seguridad de producción implícita: no existe un backend funcional ni un
proyecto real. La denegación total evita que el esqueleto accidentalmente deje
datos abiertos mientras se implementan autenticación y permisos.

Las alertas conocidas y su condición previa al despliegue están registradas en
[Dependencias y riesgos](DEPENDENCIAS_Y_RIESGOS.md).
