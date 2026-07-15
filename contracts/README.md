# Contratos compartidos

Los JSON Schema Draft 2020-12 son el lenguaje común de Campo, Maestro y backend.

La Etapa 6 añade contratos estrictos para `iniciarCorreccionConteo`, reservas `CORRECCION` y cadenas inmutables de versiones.

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

Los ejemplos ficticios de corrección están en `examples/etapa-06/`.

```powershell
npm ci
npm run validate
npm test
```
