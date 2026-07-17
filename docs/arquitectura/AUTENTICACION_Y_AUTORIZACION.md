# Autenticación y autorización

## Límite del entorno

Los clientes se conectan a Firebase Emulator Suite en `EMULATOR` y a los servicios
oficiales de Firebase en `PRODUCTION`. Cada Callable aplica antes de autenticar la
frontera central de la ETAPA 20:

- `EMULATOR`: `FUNCTIONS_EMULATOR=true` y Project ID `demo-*`;
- `PRODUCTION`: sin Functions Emulator, Project ID exacto `viverocontrol-3f83f` y
  `APP_ENV=production`;
- cualquier otra combinación devuelve `ENVIRONMENT_NOT_ALLOWED` sin ejecutar la
  operación.

## Fuentes de identidad y permisos

| Fuente | Información |
|---|---|
| Firebase Authentication | `uid` y credencial del ambiente autorizado; el Emulator usa únicamente cuentas ficticias del seed. |
| `usuarios/{uid}` | Estado activo, nombre visible y lista central de roles. |
| `jornadas/{jornadaId}/autorizaciones/{uid}` | Acceso a la jornada, rol efectivo y permiso `puedeContar`. |
| Callable context | `request.auth.uid`, construido por Firebase; es el único actor aceptado. |

Los roles no se autorizan desde custom claims. Así, una desactivación o cambio
de rol en Firestore se aplica en la siguiente operación sin esperar a renovar el
token de Authentication. El rol efectivo debe existir tanto en el perfil como
en la autorización de la jornada.

## Inicio de sesión

No existe registro público. En Emulator, Campo y Maestro aceptan únicamente las
credenciales ficticias creadas por el seed. Las cuentas reales de Production se
crearán y aprobarán de forma controlada en la ETAPA 21. Después de autenticar:

1. el cliente lee su propio perfil;
2. exige `activo == true`;
3. obtiene el rol central;
4. solo consulta jornadas y líneas amparadas por una autorización activa.

Supervisor y administrador pueden usar Campo con el mismo flujo de reserva. El
cliente nunca envía `usuarioId`, actor, rol, permiso ni hora como autoridad.

## Dispositivo

Campo genera un UUID por instalación y envía un identificador aislado por ambiente
con prefijo `ANDROID-EMULATOR-INSTALACION-` o
`ANDROID-PRODUCTION-INSTALACION-`. Sirve para trazabilidad en reserva y auditoría,
pero no concede permisos. No usa IMEI, Android ID ni otro identificador de
hardware. La aprobación y bloqueo central de dispositivos continúa pendiente.

## Lecturas autorizadas

| Recurso | Auxiliar | Supervisor | Administrador |
|---|---:|---:|---:|
| Perfil propio | Sí | Sí | Sí |
| Otro perfil | No | No | Sí |
| Jornada y líneas autorizadas | Sí | Sí | Sí |
| Catálogo visible | Sí | Sí | Sí |
| Reserva propia | Sí | Sí | Sí |
| Reservas de una jornada administrada | No | Sí | Sí |
| Autorizaciones, idempotencia y auditoría | No | No | No desde cliente |

Ningún rol cliente puede escribir perfiles, catálogos, jornadas, líneas,
reservas, idempotencia o auditoría. Las escrituras críticas se realizan mediante
Admin SDK dentro de Functions.

## Fallo seguro

- Android `debug` contiene solo valores `demo-*` y conecta a emuladores.
- Android `release` exige el Project ID y applicationId exactos, identificadores
  Firebase locales completos y ausencia de host de emulador; cualquier fallo deja
  el repositorio desconectado.
- Maestro admite solo la combinación Emulator `demo-*` o Production exacta sin
  emuladores; una configuración incompleta crea un repositorio desconectado.
- No se incluye `google-services.json`, cuenta de servicio ni secreto real.
