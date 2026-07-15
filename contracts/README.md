# Contratos compartidos

Los JSON Schema Draft 2020-12 son el lenguaje común de Campo, Maestro y backend.

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

Los ejemplos ficticios de liberación están en `examples/etapa-08/`.

```powershell
npm ci
npm run validate
npm test
```
