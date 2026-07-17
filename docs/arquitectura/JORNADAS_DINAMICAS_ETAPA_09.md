# Jornadas activas dinámicas — ETAPA 9

> Documento histórico de implementación. Desde la ETAPA 20, la misma Callable
> también está disponible en `PRODUCTION` mediante la frontera central y conserva
> las validaciones descritas aquí.

## Consulta central

`listarJornadasActivas` es una Callable de solo lectura. Acepta únicamente una solicitud vacía: la identidad procede de `request.auth.uid`.

La operación valida el perfil activo, consulta las autorizaciones centrales del usuario autenticado, descarta autorizaciones inactivas y jornadas que no estén `ACTIVA`, y devuelve:

- `jornadaId` y `nombreVisible`;
- estado `ACTIVA`;
- rol efectivo y permiso de conteo de esa autorización;
- cantidad de líneas activas de la jornada.

Los resultados se ordenan por `creadaEn` del servidor, de la más reciente a la anterior, y por nombre visible cuando la fecha coincide. No se devuelven autorizaciones ni identidades de otras cuentas.

## Datos ficticios

El seed conserva la jornada histórica como fixture y agrega `JORNADA-PRUEBA-ETAPA-9-B`. `auxiliar1@prueba.local`, supervisor y administrador tienen acceso a ambas; `auxiliar2@prueba.local` tiene una sola jornada activa. También existen una jornada activa no autorizada y una inactiva autorizada para comprobar exclusiones.

Cada jornada del seed usa líneas físicas distintas. Ningún dato representa el vivero real.

## Vivero Campo

Después de autenticar, Campo llama a `listarJornadasActivas`. Una única opción se selecciona automáticamente; varias muestran la pantalla de selección. Las líneas y correcciones se observan usando el `jornadaId` elegido.

No se permite cambiar mientras exista selección en curso, reserva, borrador pendiente o con error, sincronización, o corrección activa. La respuesta de reserva y corrección incluye ahora el `jornadaId` calculado por el backend, por lo que Campo no lo infiere del identificador de línea.

## Vivero Maestro

Maestro muestra un selector de jornadas autorizadas. Cada cambio cancela todas las suscripciones anteriores, limpia el snapshot visible y crea consultas nuevas para líneas, reservas, conteos, decisiones, reasignaciones, autorizaciones e inventario de una sola jornada.

Las acciones de revisión, reasignación y liberación siguen validándose centralmente y los diálogos abiertos se descartan al cambiar de jornada.

## Límites

La etapa no crea, edita, activa ni cierra jornadas. No autoriza usuarios y no añade Firebase real, despliegues o datos reales.
