# ETAPA 21 — Información real requerida al propietario

## Uso seguro

Esta copia versionada define campos y permanece vacía. La versión editable se crea bajo `.private/etapa-21/fase-b/`; allí puede contener información real y nunca debe añadirse a Git.

Complete un bloque por vez. Un campo vacío significa pendiente y no debe reemplazarse con supuestos. No entregue contraseñas, códigos de recuperación, tokens, API keys, cuentas de servicio, llaves de firma ni credenciales.

## Bloque A — Estructura

| Campo general | Valor privado aprobado |
|---|---|
| nombre del vivero | `[pendiente]` |
| responsable de validar la estructura | `[pendiente]` |

Para cada ubicación, módulo o cama:

| clave externa | código | tipo | nombre visible | clave del padre o raíz | orden | activa/inactiva |
|---|---|---|---|---|---:|---|
| `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` |

Para cada línea:

| clave externa | código | nombre visible | ubicación asociada | orden | activa/inactiva |
|---|---|---|---|---:|---|
| `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` |

No combine una cama y una línea como si fueran la misma entidad. Declare explícitamente la relación padre/hijo y los elementos inactivos.

## Bloque B — Inventario inicial

Una fila por línea. El total debe ser `hembras + machos + patrones`; no lo estime ni lo complete con cero si la fuente no está disponible. Una línea realmente vacía puede usar total cero únicamente con fuente, responsable, observación y la confirmación explícita `lineaVaciaConfirmada: true`.

| línea | hembras | machos | patrones | total calculado | fecha de corte | fuente | responsable | observación |
|---|---:|---:|---:|---:|---|---|---|---|
| `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[opcional]` |

Antes de aprobar este bloque registre cantidad de líneas, sumas por categoría, zona horaria, conciliador independiente y aprobador final.

## Bloque C — Usuarios

| nombre visible | correo | rol | estado | puede contar | puede revisar | jornadas iniciales | zonas iniciales | responsable de creación | responsable de entrega |
|---|---|---|---|---|---|---|---|---|---|
| `[pendiente]` | `[privado]` | `[ADMINISTRADOR/SUPERVISOR/AUXILIAR]` | `[ACTIVO/INACTIVO]` | `[sí/no]` | `[sí/no]` | `[lista o ninguna]` | `[lista o ninguna]` | `[pendiente]` | `[pendiente]` |

No registre contraseñas. Defina por separado quién habilita, deshabilita, revisa y recupera cuentas y cómo se verifica la identidad del titular.

## Bloque D — Históricos

Elija exactamente una opción:

- `CONSERVAR_HISTORICOS`, y complete al menos una fuente; o
- `SIN_HISTORICOS_A_MIGRAR`.

| fuente | formato | rango de fechas | responsable | calidad conocida |
|---|---|---|---|---|
| `[pendiente si se conservan]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` |

Indique si la decisión comprende usuarios, jornadas, conteos, inventario, movimientos, auditoría, archivos y configuraciones. Un grupo no decidido permanece `REQUIERE_REVISION`.

## Bloque E — Dispositivos y conectividad

### Celulares

| modelo | versión Android | cantidad | compartido/personal |
|---|---|---:|---|
| `[pendiente]` | `[pendiente]` | `[pendiente]` | `[COMPARTIDO/PERSONAL]` |

### Cobertura

| zona | señal | interrupción habitual en minutos | interrupción máxima en minutos |
|---|---|---:|---:|
| `[pendiente]` | `[BUENA/INTERMITENTE/SIN_SENAL]` | `[pendiente]` | `[pendiente]` |

### Computador de Maestro

| sistema operativo | versión | responsable |
|---|---|---|
| `[pendiente]` | `[pendiente]` | `[pendiente]` |

Registre además disponibilidad de Wi-Fi/datos, dispositivos compartidos, pérdida o reemplazo, almacenamiento, batería y política de bloqueo.

## Validación y aprobación

| Bloque | Responsable | Fecha | Evidencia privada | Estado |
|---|---|---|---|---|
| estructura | `[pendiente]` | `[pendiente]` | `[pendiente]` | `INCOMPLETO` |
| inventario inicial | `[pendiente]` | `[pendiente]` | `[pendiente]` | `INCOMPLETO` |
| usuarios | `[pendiente]` | `[pendiente]` | `[pendiente]` | `INCOMPLETO` |
| históricos | `[pendiente]` | `[pendiente]` | `[pendiente]` | `INCOMPLETO` |
| dispositivos y conectividad | `[pendiente]` | `[pendiente]` | `[pendiente]` | `INCOMPLETO` |

El paquete privado de catálogo no puede generarse mientras estructura o inventario estén incompletos, ni cuando el conjunto contenga errores. Los cinco bloques deben completarse antes del corte. La validación local y un paquete válido tampoco autorizan importación, despliegue o limpieza.
