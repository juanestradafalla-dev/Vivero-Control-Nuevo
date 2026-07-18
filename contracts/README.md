# Contratos compartidos

La Etapa 25 agrega contratos estrictos para `crearUsuarioAdministrable`. La solicitud acepta exclusivamente nombre visible, correo, password, rol y clave idempotente. El resultado permite incorporar el perfil al listado administrativo sin recargar, pero nunca devuelve correo, password ni material derivado de la credencial. Los ejemplos son completamente ficticios y estan en `examples/etapa-25/`.

Los JSON Schema Draft 2020-12 son el lenguaje común de Campo, Maestro y backend.

La Etapa 23 agrega contratos estrictos para listar líneas disponibles, registrar, aprobar y devolver descartes. El total único se calcula exclusivamente por categorías de planta; las causas pueden superponerse, pero cada causa individual queda limitada por ese total. Solo la aprobación central descuenta inventario y una devolución nunca lo modifica. Los ejemplos ficticios están en `examples/etapa-23/`.

La Etapa 16 agrega contratos estrictos para listar, crear y actualizar ubicaciones y líneas. El árbol usa `ubicacionPadreId` sin fijar niveles productivos; códigos normalizados y campos estructurales solo aparecen en solicitudes de creación. Actualizar acepta exclusivamente nombre visible, orden, estado, versión, motivo y clave. Los ejemplos ficticios están en `examples/etapa-16/`.

La Etapa 14 agrega contratos estrictos para `cancelarJornadaBorrador`, `reabrirJornadaCancelada`, el resumen administrativo de cancelados y la cancelación inmutable. Cancelar solo acepta jornada, versión, motivo y clave; reabrir solo jornada, versión y clave. `INACTIVA` por `CANCELACION_BORRADOR` no equivale a cierre normal y conserva las selecciones preparatorias. Los ejemplos están en `examples/etapa-14/`.

La Etapa 15 agrega contratos estrictos para `listarUsuariosAdministrables`, `actualizarEstadoUsuario` y `actualizarRolUsuario`. El listado excluye Firebase Auth y expone solo el perfil central versionado y un resumen de trabajo activo. Las actualizaciones aceptan ID, versión observada, estado o rol, motivo y clave idempotente. Los ejemplos están en `examples/etapa-15/`.

La Etapa 13 agrega contratos estrictos para `cerrarJornada` y su resultado idempotente. La solicitud contiene solo jornada, versión observada y clave; el resultado central declara `INACTIVA`, nueva versión, cantidades conservadas y ocupaciones liberadas. `listarJornadasActivas` incluye la versión y el permiso de cierre calculado centralmente, sin exponer la identidad del creador a Campo. Los ejemplos están en `examples/etapa-13/`.

La Etapa 12 agrega contratos para `activarJornada`, su resultado y el bloqueo determinista `ocupacionesLineasActivas/{lineaId}`. La solicitud solo contiene jornada, las tres versiones observadas y clave idempotente. El límite técnico combinado de líneas y participantes es 200; su exceso rechaza toda la activación y nunca habilita lotes parciales. Los ejemplos están en `examples/etapa-12/`.

La Etapa 11 agrega contratos para listar el catálogo central activo y actualizar participantes de un borrador. Las solicitudes solo aceptan `usuarioId`, `puedeContar` y la clave idempotente; nombre y rol aparecen únicamente en resultados centrales. La selección preparatoria permanece separada de las autorizaciones operativas. Los ejemplos están en `examples/etapa-11/`.

La Etapa 10 agrega contratos estrictos para crear borradores, actualizar su selección separada y listar jornadas administrables con el catálogo validado. `BORRADOR` es un estado administrativo: no crea `jornadaLineas`, estados `DISPONIBLE` ni inventario. Los ejemplos están en `examples/etapa-10/`.

La Etapa 9 agrega una solicitud vacía para `listarJornadasActivas`: la identidad procede de Auth y el resultado solo contiene jornadas activas autorizadas. Los ejemplos están en `examples/etapa-09/`.

La Etapa 8 añade contratos estrictos para `liberarReservaLinea`, la liberación inmutable y su resultado idempotente, manteniendo los de reasignación, reservas `CORRECCION` y versiones.

Reglas de frontera:

- identidad, rol, jornada, línea, estado y hora central no se aceptan del cliente;
- aprobación recibe `conteoId`, clave y, solo en autorrevisión administrativa, `motivoExcepcion`;
- devolución siempre recibe motivo;
- un conteo aceptado permanece inmutable;
- aprobación reemplaza inventario y registra `nuevo - anterior`;
- devolución no modifica inventario;
- el inventario inicial nunca se supone cero;
- propiedades adicionales son inválidas.
- una versión 1 usa `conteoAnteriorId = null`; toda versión posterior apunta a su antecesora;
- iniciar una corrección solo recibe conteo, dispositivo y clave idempotente;
- reenviar una corrección sigue sin modificar inventario oficial.
- reasignar solo recibe conteo, nuevo usuario, motivo y clave; identidad y rol del actor proceden de Authentication y datos centrales;
- la reasignación no edita el conteo original ni cambia su autor.
- liberar solo recibe reserva, motivo y clave; identidad, rol, jornada, línea y hora proceden de fuentes centrales;
- una reserva `LIBERADA` se conserva, una reserva inicial vuelve a `DISPONIBLE` y una corrección vuelve a `DEVUELTA`;
- una liberación no borra conteos ni modifica inventario oficial.
- crear un borrador solo recibe nombre visible y clave; creador, estado, versión y hora proceden del backend;
- actualizar la selección solo recibe jornada, IDs únicos y clave; las líneas se validan contra el catálogo y las jornadas activas;
- listar borradores usa una solicitud vacía y nunca acepta identidad o rol del cliente;
- una selección de preparación no equivale a una línea operativa y no modifica inventario.
- un participante solicitado solo contiene ID y `puedeContar`; nombre y rol nunca proceden del cliente;
- IDs repetidos y propiedades adicionales son inválidos;
- la selección preparatoria de participantes no autoriza cuentas ni expone la jornada en Campo.
- activar usa versiones esperadas de jornada y ambas selecciones para detectar resúmenes obsoletos;
- nombre, actividad y rol de cada participante se revalidan centralmente antes de crear autorizaciones;
- `ACTIVA` y `DISPONIBLE` solo aparecen como resultado de la transacción central;
- `ACTIVAR_JORNADA` no crea inventario ni movimientos y conserva intactas las selecciones preparatorias.
- cerrar usa la versión esperada de la jornada y no acepta identidad, rol, estados ni horas del cliente;
- `CERRAR_JORNADA` conserva historia, desactiva datos operativos y libera solo bloqueos de líneas de esa jornada;
- un cierre normal nunca modifica inventario, movimientos, conteos, decisiones, reservas o selecciones preparatorias.
- cancelar un borrador exige motivo, versión observada y ausencia total de datos operativos;
- reabrir solo acepta `INACTIVA` por `CANCELACION_BORRADOR` que nunca fue activada o cerrada;
- cancelación y reapertura conservan selecciones y no crean `jornadaLineas`, autorizaciones, reservas u ocupaciones.
- listar perfiles no acepta identidad del cliente y nunca devuelve correo, contraseña, token o datos internos de Firebase Auth;
- cambiar estado o rol exige versión y motivo, conserva la historia y genera auditoría e idempotencia centrales;
- desactivar no libera reservas ni reasigna correcciones; cambiar rol se bloquea con trabajo o autorizaciones activas;
- los únicos roles válidos continúan siendo `AUXILIAR`, `SUPERVISOR` y `ADMINISTRADOR`.

Los ejemplos ficticios de liberación están en `examples/etapa-08/`.

Reglas del catálogo de la Etapa 16:

- código, tipo y padre de una ubicación son inmutables después de crear;
- código y ubicación de una línea son inmutables después de crear;
- una selección de borrador puede conservar una línea inactiva, pero activar vuelve a validar el catálogo;
- los tipos de ubicación actuales son fixtures ficticios y no fijan la jerarquía real.

Reglas del inventario inicial de la Etapa 17:

- `registrarInventarioInicial` acepta únicamente línea, versión observada, tres cantidades, referencia ficticia y clave idempotente;
- identidad, rol, total, origen y hora proceden exclusivamente del backend;
- `total`, campos centrales y propiedades adicionales enviados por el cliente son inválidos;
- la primera fotografía usa versión 1 y `conteoAprobadoId = null`;
- la carga inmutable se conserva aunque una aprobación posterior lleve el inventario oficial a versión 2;
- no se crea movimiento durante la inicialización y nunca se supone inventario cero.

Reglas del preflight de migración de la Etapa 18:

- `migration-catalog-package-v1.schema.json` solo admite metadatos, ubicaciones, líneas e inventarios iniciales;
- las relaciones usan `claveExterna`; IDs internos de Firestore, usuarios y datos personales no pertenecen al formato;
- el cliente no puede enviar `total`: el validador lo calcula y verifica dentro del rango seguro;
- `migration-validation-result.schema.json` separa errores bloqueantes, advertencias y resumen de conflictos;
- el hash SHA-256 se calcula sobre una representación normalizada y ordenada de forma determinista;
- `aptoParaImportar` es informativo: no autoriza ni ejecuta escrituras;
- la plantilla oficial está en `data/templates/paquete-migracion-catalogo-v1.example.json` y contiene solo datos `PRUEBA`.

Reglas de importación y reversión de la Etapa 19:

- la solicitud incluye el paquete completo, dos confirmaciones del SHA-256 y una clave idempotente, sin identidad del cliente;
- `import-migration-package-result` contiene únicamente hash, cantidades, mapa de claves externas, IDs centrales y trazabilidad;
- `escriturasRealizadas` no puede superar 450 y no existen resultados parciales;
- el origen nuevo de inventario migrado es `MIGRACION_CONTROLADA`; los valores históricos `*_EMULADOR` continúan admitidos para lectura y reversión, y no se crea movimiento inicial;
- el historial distingue `APLICADA` y `REVERTIDA`, informa elegibilidad y nunca contiene el paquete original;
- la reversión exige versión observada, motivo e idempotencia y conserva para siempre el registro histórico y el bloqueo de hash.

```powershell
npm ci
npm run validate
npm test
```
