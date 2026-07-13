# Contratos compartidos

Los archivos JSON de esta carpeta describen el lenguaje común entre Vivero
Campo, Vivero Maestro y el backend. Son independientes de las interfaces de
usuario y todavía no representan una API desplegada.

- `enums/` contiene los valores cerrados aprobados.
- `schemas/` contiene JSON Schema Draft 2020-12 para las entidades base.
- `validate.mjs` comprueba sintaxis, presencia y valores críticos sin instalar
  dependencias.

Los identificadores son cadenas globales generadas fuera de secuencias locales.
Los campos temporales marcados como timestamps del servidor solo podrán ser
asignados por el backend. Las relaciones y límites operativos pendientes no se
inventan en estos contratos.

```powershell
node contracts/validate.mjs
```
