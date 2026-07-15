# Contratos compartidos

Los JSON Schema Draft 2020-12 son el lenguaje común de Campo, Maestro y backend.

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

Los ejemplos ficticios de liberación están en `examples/etapa-08/`.

```powershell
npm ci
npm run validate
npm test
```
