# Contratos compartidos

Los JSON Schema Draft 2020-12 son el lenguaje común de Campo, Maestro y backend.

La Etapa 5 añade solicitudes y resultados estrictos para `aprobarConteo` y `devolverConteo`, amplía los resultados idempotentes y formaliza decisiones separadas, inventario oficial y movimientos históricos.

Reglas de frontera:

- identidad, rol, jornada, línea, estado y hora central no se aceptan del cliente;
- aprobación recibe `conteoId`, clave y, solo en autorrevisión administrativa, `motivoExcepcion`;
- devolución siempre recibe motivo;
- un conteo aceptado permanece inmutable;
- aprobación reemplaza inventario y registra `nuevo - anterior`;
- devolución no modifica inventario;
- el inventario inicial nunca se supone cero;
- propiedades adicionales son inválidas.

Los ejemplos ficticios de revisión están en `examples/etapa-05/`.

```powershell
npm ci
npm run validate
npm test
```
