# Criterios de aceptación — ETAPA 9

- [x] La base es `71717f44520d3282d75f0f1c19e43612908c86be`.
- [x] `listarJornadasActivas` usa `request.auth.uid` y una solicitud vacía.
- [x] Solo devuelve jornadas activas autorizadas con rol, permiso y cantidad de líneas.
- [x] El seed contiene dos jornadas activas autorizadas, una activa no autorizada y una inactiva.
- [x] Las jornadas activas usan líneas físicas distintas.
- [x] Campo selecciona automáticamente una opción o muestra selector cuando existen varias.
- [x] Campo bloquea el cambio con reserva, borrador, sincronización o corrección activa.
- [x] Maestro reemplaza limpiamente todas las suscripciones al cambiar de jornada.
- [x] Reserva, revisión, reasignación y liberación usan la jornada seleccionada.
- [x] No existe dependencia funcional del ID fijo en Campo, Maestro o dominio backend.
- [x] Las reglas continúan prohibiendo escrituras directas críticas.
- [x] El inventario oficial no se modifica por listar o seleccionar jornadas.
- [x] No se implementó gestión de jornadas, Firebase real ni despliegue.
