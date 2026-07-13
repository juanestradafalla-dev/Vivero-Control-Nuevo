# Cómo completar las plantillas reales

Las plantillas de `data/templates/` están deliberadamente vacías. No contienen
nombres, correos, teléfonos, contraseñas ni ubicaciones reales. Su uso requiere
la aprobación previa del responsable de datos y pertenece a una etapa futura.

## Ubicaciones

Complete una fila por cada línea física en
[`ubicaciones.csv`](../../data/templates/ubicaciones.csv):

| Columna | Regla |
|---|---|
| `vivero_codigo` | Código estable y único del vivero. |
| `modulo_codigo` | Código estable dentro del vivero. |
| `cama_codigo` | Código estable dentro del módulo. |
| `linea_codigo` | Identificador global y no reutilizable de la línea. |
| `nombre_visible` | Nombre breve que el operario pueda confirmar en campo. |
| `orden` | Entero positivo para presentación. |
| `activa` | `true` o `false`. |

No deduzca la jerarquía ni invente códigos. Primero debe levantarse y validarse
la estructura real del vivero con el equipo operativo.

## Usuarios

Complete una fila por cuenta autorizada en
[`usuarios.csv`](../../data/templates/usuarios.csv):

| Columna | Regla |
|---|---|
| `identificador` | Identificador técnico acordado; no incluya contraseña. |
| `nombre_visible` | Nombre aprobado para mostrar en auditoría y supervisión. |
| `rol` | `AUXILIAR`, `SUPERVISOR` o `ADMINISTRADOR`. |
| `activo` | `true` o `false`. |

El correo de autenticación, el alta de la cuenta y la entrega de credenciales
se definirán por un procedimiento separado. Nunca agregue contraseñas, tokens ni
datos personales adicionales a estos CSV.

## Validación futura

Antes de importar información real se debe:

1. obtener aprobación del titular de los datos;
2. revisar duplicados y relaciones padre-hijo;
3. confirmar roles con el responsable del vivero;
4. ejecutar la importación primero en un ambiente de prueba autorizado;
5. generar un informe de errores sin exponer datos personales;
6. definir respaldo, reversión y auditoría de la carga.

La ETAPA 3 no incluye importador ni conexión a Firebase real.
