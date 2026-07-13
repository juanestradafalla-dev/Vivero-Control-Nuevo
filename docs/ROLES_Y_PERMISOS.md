# Roles y permisos

## 1. Reglas generales

- El permiso se valida en el servidor y en las reglas de acceso, no solamente en la interfaz.
- Los roles forman una jerarquía: administrador incluye supervisor; supervisor incluye auxiliar.
- La cuenta maestra tendrá rol de administrador y usará Vivero Campo cuando colabore en un conteo.
- Tener un rol no sustituye la autorización para una jornada concreta.
- Cuando un supervisor o administrador cuenta desde Vivero Campo, usa el mismo flujo de reserva y envío que un auxiliar.
- Ningún rol puede editar o eliminar silenciosamente un conteo enviado, su historial o la auditoría.
- Las cuentas desactivadas no pueden realizar operaciones, aunque conserven una sesión o datos locales.

## 2. Matriz de permisos

Leyenda: **Sí** = permitido; **No** = prohibido; **Condicionado** = permitido únicamente bajo la condición indicada.

| Acción | Auxiliar | Supervisor | Administrador | Condición o alcance |
|---|---:|---:|---:|---|
| Iniciar sesión | Sí | Sí | Sí | Cuenta activa en el ambiente correcto. |
| Usar Vivero Campo | Sí | Sí | Sí | Jornada autorizada; todos reservan igual. |
| Ver jornadas activas | Condicionado | Condicionado | Condicionado | Solo jornadas para las que tenga autorización. |
| Ver líneas disponibles de una jornada | Condicionado | Condicionado | Condicionado | Debe poder acceder a la jornada. |
| Reservar una línea disponible | Condicionado | Condicionado | Condicionado | Con conexión, autorización y transacción exitosa. |
| Contar una línea reservada | Condicionado | Condicionado | Condicionado | Debe poseer la reserva vigente. |
| Guardar un borrador local | Condicionado | Condicionado | Condicionado | Solo en su dispositivo y para su propia reserva. |
| Enviar un conteo | Condicionado | Condicionado | Condicionado | Reserva válida, datos válidos y operación idempotente. |
| Ver sus propios conteos | Sí | Sí | Sí | Incluye estado e historial que corresponda mostrar al autor. |
| Ver conteos de otros usuarios | No | Sí | Sí | Dentro de jornadas administrables. |
| Crear la corrección de un conteo devuelto | Condicionado | Condicionado | Condicionado | Solo el autor o el usuario formalmente reasignado, si está `DEVUELTA` y sin alterar versiones anteriores. |
| Corregir directamente el conteo de otro usuario | No | No | No | Nunca se modifica el original ni se suplanta su autoría. |
| Reasignar una corrección por ausencia del autor | No | Sí | Sí | Solo sobre un conteo `DEVUELTA`, a un usuario autorizado y con auditoría. |
| Crear una jornada | No | Sí | Sí | Con líneas tomadas del catálogo central. |
| Editar una jornada antes de activarla | No | Sí | Sí | Reglas detalladas del estado de jornada pendientes. |
| Gestionar una jornada activa | No | Sí | Sí | Sin invalidar conteos o reservas silenciosamente. |
| Ver el avance completo | No | Sí | Sí | Incluye estados, reservas y conteos. |
| Liberar una línea abandonada | No | Sí | Sí | Motivo obligatorio y evento de auditoría. |
| Revisar un conteo | No | Sí | Sí | Conteo pendiente y jornada administrable. |
| Solicitar verificación adicional en el MVP | No | No | No | Función expresamente fuera del primer MVP. |
| Devolver un conteo | No | Sí | Sí | Motivo obligatorio; conserva el original. |
| Aprobar un conteo | No | Sí | Sí | Transacción autorizada e idempotente. |
| Aprobar su propio conteo | No | No | Condicionado | Excepción administrativa: advertencia visible, motivo obligatorio y auditoría. |
| Cerrar una jornada | No | Sí | Sí | Solo cuando cumpla la política de cierre todavía por confirmar. |
| Consultar inventario oficial | No | Sí | Sí | Lectura según alcance autorizado. |
| Modificar directamente el inventario oficial | No | No | No | Solo cambia por operaciones de negocio transaccionales y auditadas. |
| Administrar usuarios | No | No | Sí | Alta, desactivación y atributos permitidos; método pendiente. |
| Asignar o cambiar roles y permisos | No | No | Sí | Debe quedar auditado y validado centralmente. |
| Administrar autorizaciones de jornadas | No | Condicionado | Sí | Alcance exacto del supervisor pendiente. |
| Administrar módulos, camas y líneas | No | No | Sí | Mediante catálogos controlados. |
| Administrar configuración | No | No | Sí | Solo parámetros aprobados, nunca secretos expuestos al cliente. |
| Consultar auditoría completa | No | No | Sí | Los supervisores ven la trazabilidad operativa necesaria, no la auditoría global. |
| Gestionar copias de seguridad y mantenimiento | No | No | Sí | Política y herramientas pendientes. |
| Cambiar datos de desarrollo en producción o viceversa | No | No | No | Los ambientes deben permanecer separados. |

## 3. Alcance de datos por rol

### Auxiliar

Puede leer el catálogo mínimo necesario, jornadas autorizadas, disponibilidad y sus propios conteos. No puede listar todos los usuarios, consultar el inventario oficial, ver conteos ajenos ni ejecutar acciones de revisión.

### Supervisor

Puede operar jornadas, consultar su avance, revisar conteos e inventario oficial y liberar reservas. Solo ve datos administrativos estrictamente necesarios. No administra roles, catálogo global, configuración, copias de seguridad ni auditoría global.

### Administrador

Posee las capacidades del supervisor y administra identidades, permisos, ubicaciones y configuración. Sus acciones críticas también requieren transacciones, validación y auditoría; el rol no permite alterar historia ni inventario por fuera de los flujos definidos.

## 4. Permisos todavía por decidir

- quién autoriza a un usuario para una jornada y si esa autorización puede delegarse al supervisor;
- qué parte de la auditoría operativa puede consultar un supervisor;
- si existen restricciones adicionales por ubicación además de la jornada;
- método de autenticación y proceso de recuperación de cuenta.
