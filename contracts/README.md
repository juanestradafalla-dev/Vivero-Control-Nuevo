# Contratos compartidos

Los archivos JSON de esta carpeta describen el lenguaje común entre Vivero
Campo, Vivero Maestro y el backend. Son independientes de las interfaces de
usuario y todavía no representan una API desplegada.

- `enums/` contiene los valores cerrados aprobados.
- `schemas/` contiene JSON Schema Draft 2020-12 para las entidades base.
- `validate.mjs` compila todos los esquemas Draft 2020-12 con Ajv 2020 y
  resuelve referencias entre archivos.
- `examples/` contiene casos ficticios válidos e inválidos.
- `tests/` comprueba JSON Schema e invariantes aritméticas que el estándar no
  puede expresar por sí solo.

Los identificadores son cadenas globales generadas fuera de secuencias locales.
Los campos temporales marcados como timestamps del servidor solo podrán ser
asignados por el backend. Las relaciones y límites operativos pendientes no se
inventan en estos contratos.

```powershell
Set-Location contracts
npm ci
npm run validate
npm test
```

Una validación exitosa requiere tanto la compilación de esquemas como las
pruebas de `total = hembras + machos + patrones` y de diferencias históricas.
