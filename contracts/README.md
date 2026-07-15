# Contratos compartidos

Los JSON Schema Draft 2020-12 son el lenguaje común de Campo, Maestro y backend.

La Etapa 14 agrega contratos estrictos para `cancelarJornadaBorrador`, `reabrirJornadaCancelada`, el resumen administrativo de cancelados y la cancelación inmutable. Cancelar solo acepta jornada, versión, motivo y clave; reabrir solo jornada, versión y clave. `INACTIVA` por `CANCELACION_BORRADOR` no equivale a cierre normal y conserva las selecciones preparatorias. Los ejemplos están en `examples/etapa-14/`.

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

Los ejemplos ficticios de liberación están en `examples/etapa-08/`.

```powershell
npm ci
npm run validate
npm test
```
