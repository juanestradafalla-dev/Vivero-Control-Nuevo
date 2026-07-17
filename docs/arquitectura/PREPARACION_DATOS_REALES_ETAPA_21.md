# ETAPA 21 — Preparación local de datos reales

## Estado

La captura y validación están preparadas, pero el propietario todavía no ha suministrado datos reales en esta tarea. Los cinco bloques permanecen `INCOMPLETO`; no se inventó ningún valor y no existe un paquete preliminar de esta preparación.

Los archivos editables viven exclusivamente en:

```text
.private/etapa-21/fase-b/
```

Esa ruta está ignorada. El repositorio solo conserva el formato vacío, validadores, fixtures ficticios y este procedimiento sanitizado.

## Captura por bloques

El propietario debe completar un bloque y validarlo antes de continuar al siguiente:

1. **Estructura:** nombre del vivero, ubicaciones, módulos, camas, líneas, códigos, tipo, padre, orden, estado y responsable de validación.
2. **Inventario inicial:** por línea, hembras, machos, patrones, total calculado, fecha de corte, fuente, responsable y observación opcional.
3. **Usuarios:** nombre visible, correo, rol, estado, capacidad de contar/revisar, jornadas o zonas iniciales y responsables de creación y entrega. No se solicita ni admite contraseña.
4. **Históricos:** fuente, formato, rango, responsable y calidad, o la decisión literal `SIN_HISTORICOS_A_MIGRAR`.
5. **Dispositivos y conectividad:** modelos, Android, cantidades, uso compartido/personal, zonas y duración de interrupciones, y computador de Maestro.

La copia Markdown privada facilita la conversación por bloques. El JSON privado es la fuente que consumen los validadores locales.

## Validaciones locales

El núcleo comprueba:

- claves externas y códigos únicos dentro del alcance que usa el contrato;
- padres existentes y ausencia de ciclos;
- líneas asociadas a ubicaciones existentes;
- cantidades enteras no negativas y total exacto;
- inventario para cada línea activa;
- correos no duplicados;
- roles `ADMINISTRADOR`, `SUPERVISOR` o `AUXILIAR`;
- estados y capacidades explícitas;
- ausencia de campos o valores con apariencia de contraseña, token, llave o credencial;
- rutas de entrada y salida obligatoriamente bajo `.private/`.

Un conjunto puede ser `valid: true` e `INCOMPLETO`: significa que lo aportado no es contradictorio, no que esté listo para migrar.

Comandos locales desde `backend/functions`:

```powershell
npm run prepare:etapa21:init
npm run validate:etapa21:private
```

La inicialización no sobrescribe archivos privados existentes. La validación imprime únicamente estado y cantidades de errores o pendientes; el detalle permanece en el informe privado.

## Paquete preliminar

`npm run package:etapa21:private` solo puede producir un paquete si estructura e inventario están completos y el conjunto no contiene errores. Usuarios, históricos y dispositivos continúan siendo puertas de preparación del corte, pero no forman parte del contrato de catálogo. El resultado:

- usa `paquete-migracion-catalogo-v1`;
- queda bajo `.private/`;
- tiene SHA-256 determinista compatible con la normalización del backend;
- comprueba claves externas y el límite contractual de 512.000 bytes;
- incluye un resumen sanitizado de cantidades y totales;
- rechaza sobreescribir un paquete ya existente;
- no llama `validarPaqueteMigracion`, no importa, no revierte y no se conecta a Firebase.

Si falta cualquier campo, la operación termina con `DATOS_REALES_INCOMPLETOS` antes de escribir el paquete. Un archivo parcial nunca se presenta como definitivo.

## Datos que no entran al paquete de catálogo

Usuarios, correos, decisiones IAM, históricos, dispositivos y conectividad se validan para la preparación operativa, pero no forman parte del contrato `paquete-migracion-catalogo-v1`. Cualquier futura alta de cuentas o carga histórica exige autorización y procedimiento separados después de resolver `BACKUP_PENDIENTE`.
