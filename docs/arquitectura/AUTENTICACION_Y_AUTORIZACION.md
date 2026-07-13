# Autenticación y autorización local

## Límite del entorno

Authentication, Firestore y Functions se conectan exclusivamente a emuladores.
La Function además exige `FUNCTIONS_EMULATOR=true` y un proyecto cuyo ID empiece
por `demo-`. Si alguna condición falla, devuelve `EMULATOR_ONLY` sin ejecutar la
operación.

## Fuentes de identidad y permisos

| Fuente | Información |
|---|---|
| Firebase Auth Emulator | `uid`, correo ficticio, contraseña de prueba, nombre visible y claim `entorno=EMULADOR`. |
| `usuarios/{uid}` | Estado activo, nombre visible y lista central de roles. |
| `jornadas/{jornadaId}/autorizaciones/{uid}` | Acceso a la jornada, rol efectivo y permiso `puedeContar`. |
| Callable context | `request.auth.uid`, construido por Firebase; es el único actor aceptado. |

Los roles no se autorizan desde custom claims. Así, una desactivación o cambio
de rol en Firestore se aplica en la siguiente operación sin esperar a renovar el
token de Authentication. El rol efectivo debe existir tanto en el perfil como
en la autorización de la jornada.

## Inicio de sesión

No existe registro público. Campo y Maestro aceptan únicamente credenciales
ficticias ya creadas por el script de carga. Después de autenticar:

1. el cliente lee su propio perfil;
2. exige `activo == true`;
3. obtiene el rol central;
4. solo consulta jornadas y líneas amparadas por una autorización activa.

Supervisor y administrador pueden usar Campo con el mismo flujo de reserva. El
cliente nunca envía `usuarioId`, actor, rol, permiso ni hora como autoridad.

## Dispositivo

Campo genera un UUID por instalación y envía un identificador con prefijo
`ANDROID-INSTALACION-`. Sirve para trazabilidad en reserva y auditoría, pero no
concede permisos. No usa IMEI, Android ID ni otro identificador de hardware. La
aprobación y bloqueo central de dispositivos continúa pendiente.

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
- Android `release` deja Firebase vacío y muestra que producción está
  deshabilitada.
- Maestro rechaza configuración sin `VITE_USE_FIREBASE_EMULATORS=true` o con un
  proyecto que no empiece por `demo-`.
- No se incluye `google-services.json`, cuenta de servicio ni secreto real.
