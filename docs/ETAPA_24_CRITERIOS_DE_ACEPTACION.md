# ETAPA 24 - Criterios de aceptacion

## Objetivo cerrado

Vivero Campo restaura una sesion existente sin confundir la ausencia de Firebase Auth con errores transitorios. El alcance funcional queda congelado antes de preparar produccion. Solo existen los ambientes `EMULATOR` y `PRODUCTION`; cualquier otra combinacion de ambiente o proyecto continua bloqueada.

## Restauracion de sesion

- `NoSession` se produce exclusivamente cuando no existe `FirebaseAuth.currentUser`.
- `RestoredVerified` requiere un perfil activo obtenido desde el servidor.
- `RestoredCached` requiere un perfil activo disponible en la cache local de Firestore cuando la lectura central falla.
- `VerificationPending` conserva la sesion Auth cuando no hay red ni perfil util en cache.
- `Revoked` solo se produce ante confirmacion autoritativa de perfil inexistente o inactivo.
- Un timeout, falta de red o error transitorio nunca cierra Firebase Auth.
- El formulario de acceso no se muestra durante `RESTORING` ni `VERIFICATION_PENDING`.
- La accion `Reintentar verificacion` es idempotente y permite completar la verificacion sin reiniciar la aplicacion.
- `Salir` conserva su cierre explicito de Auth sin eliminar borradores locales.
- No se almacena correo ni contrasena.

## Trabajo local

- Una sesion verificada o recuperada desde cache carga las jornadas disponibles cuando existe conexion.
- La reserva se recupera solo para el mismo usuario y dispositivo.
- Los borradores Room de conteo y descarte se recuperan solo para el mismo usuario y dispositivo.
- Los observadores anteriores se cancelan antes de reactivarlos.
- WorkManager se programa una sola vez por recurso y clave de idempotencia durante cada intento pendiente.
- Reintentos consecutivos no duplican observadores, sincronizaciones ni envios.
- Una revocacion posterior bloquea sincronizacion, cierra Auth y conserva el contenido local.

## Limites preservados

- El codigo actual contiene 34 Callables.
- La ultima auditoria remota encontro 11 de las 30 Callables existentes en ese momento; ambas cifras pertenecen a momentos distintos y no se contradicen.
- No cambian contratos, estados centrales, permisos, reglas de conteo, descartes, inventario o correcciones.
- No se modifica Vivero Maestro funcionalmente.
- No se reescribe evidencia historica de las etapas 21, 22 o 23.

## Garantias de entrega

- No hubo conexion a Firebase real ni despliegue.
- No hubo importacion, creacion de cuentas o acceso a datos reales.
- No se leyo ni modifico `.private/`, configuracion local, archivos `.env` o llaves.
- No se genero APK firmado ni instalador definitivo.
- `main` no se modifica directamente y el Pull Request permanece sin fusionar.
