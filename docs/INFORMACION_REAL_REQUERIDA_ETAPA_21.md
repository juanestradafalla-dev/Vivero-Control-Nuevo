# ETAPA 21 — Información real requerida al propietario

## Instrucciones

Esta plantilla debe completarse fuera del repositorio si contiene información personal, inventario real o datos operativos sensibles. En Git solo permanece vacía. No adjuntar contraseñas, tokens, API keys, cuentas de servicio, llaves de firma o credenciales.

Cada bloque requiere responsable, fuente, fecha de corte y aprobación. Un campo vacío significa “no decidido”; no debe completarse con supuestos.

## 1. Jerarquía exacta del vivero

| Campo | Valor aprobado |
|---|---|
| nombre operativo | `[pendiente]` |
| ubicaciones principales | `[pendiente]` |
| módulos por ubicación | `[pendiente]` |
| camas por módulo | `[pendiente]` |
| líneas por cama | `[pendiente]` |
| relación padre/hijo | `[pendiente]` |
| responsable de validar estructura | `[pendiente]` |

Adjuntar fuera de Git una tabla con códigos, nombres visibles, orden, estado y relación exacta de cada elemento.

## 2. Códigos y reglas de identidad

| Decisión | Valor aprobado |
|---|---|
| formato de código de ubicación | `[pendiente]` |
| formato de código de línea | `[pendiente]` |
| unicidad | `[pendiente]` |
| tratamiento de códigos heredados | `[pendiente]` |
| tratamiento de inactivos/reorganizados | `[pendiente]` |
| responsable de aprobar correspondencias | `[pendiente]` |

## 3. Inventario inicial

| Campo | Valor aprobado |
|---|---|
| fuente oficial | `[pendiente]` |
| propietario de la fuente | `[pendiente]` |
| fecha y hora de corte | `[pendiente]` |
| zona horaria | `[pendiente]` |
| cantidad total de líneas | `[pendiente]` |
| suma de hembras | `[pendiente]` |
| suma de machos | `[pendiente]` |
| suma de patrones | `[pendiente]` |
| conciliación independiente | `[pendiente]` |
| aprobador final | `[pendiente]` |

La entrega privada debe indicar cantidades por línea, checksum del archivo, versión del contrato y resultado del preflight. No copiar datos reales a ejemplos versionados.

## 4. Usuarios iniciales y roles

| Identificador interno | Rol requerido | Alcance | Estado de aprobación |
|---|---|---|---|
| `[pendiente]` | `[administrador/supervisor/auxiliar]` | `[pendiente]` | `[pendiente]` |

Los correos de acceso se entregan por un canal privado aprobado. El repositorio solo debe registrar cantidades y roles agregados.

Definir además:

- quién crea, habilita, deshabilita y revisa cuentas;
- quién entrega el acceso inicial;
- recuperación de contraseña y verificación de identidad;
- tratamiento de retiro, ausencia o cambio de rol;
- revisión periódica de cuentas y mínimo privilegio.

## 5. Datos históricos a conservar

| Fuente | Periodo | Tipo de dato | Motivo de conservación | Responsable |
|---|---|---|---|---|
| `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` |

Indicar si deben conservarse usuarios, auditoría, jornadas, conteos, inventario, movimientos, archivos o configuraciones heredadas. Cualquier dato no decidido queda `REQUIERE_REVISION` y no se elimina.

## 6. Dispositivos Android y conectividad

| Modelo | Versión Android | Cantidad | Restricciones | Responsable |
|---|---|---:|---|---|
| `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` | `[pendiente]` |

Medir y entregar:

- zonas con señal buena, intermitente y sin señal;
- duración típica y máxima de interrupciones;
- red móvil/Wi-Fi disponible;
- almacenamiento libre, batería y políticas de bloqueo;
- uso compartido o individual de equipos;
- procedimiento de pérdida, reemplazo y recuperación de Keystore.

## 7. Retención local, auditoría y privacidad

| Política | Valor aprobado |
|---|---|
| retención de borradores locales | `[pendiente]` |
| retención de conteos enviados | `[pendiente]` |
| limpieza al cerrar sesión | `[pendiente]` |
| retención central de auditoría | `[pendiente]` |
| acceso a auditoría | `[pendiente]` |
| datos personales visibles entre usuarios | `[pendiente]` |
| exportación y eliminación legal | `[pendiente]` |

## 8. Backups, despliegues y rollback

| Responsabilidad | Persona/rol aprobado |
|---|---|
| propietario del servicio | `[pendiente]` |
| operador de backup | `[pendiente]` |
| revisor de restauración | `[pendiente]` |
| operador de despliegue | `[pendiente]` |
| aprobador del corte | `[pendiente]` |
| responsable de rollback | `[pendiente]` |
| responsable de costos/alertas | `[pendiente]` |

Definir frecuencia y retención de backups, RPO, RTO, bucket autorizado, cifrado, prueba de restauración, ventana de corte, umbrales de humo y canal de incidente.

## 9. Aprobación final

| Control | Responsable | Fecha | Evidencia |
|---|---|---|---|
| estructura validada | `[pendiente]` | `[pendiente]` | `[pendiente]` |
| inventario conciliado | `[pendiente]` | `[pendiente]` | `[pendiente]` |
| usuarios/roles aprobados | `[pendiente]` | `[pendiente]` | `[pendiente]` |
| históricos definidos | `[pendiente]` | `[pendiente]` | `[pendiente]` |
| dispositivos/señal medidos | `[pendiente]` | `[pendiente]` | `[pendiente]` |
| backup/restore aprobados | `[pendiente]` | `[pendiente]` | `[pendiente]` |
| corte y rollback aprobados | `[pendiente]` | `[pendiente]` | `[pendiente]` |

FASE B no comienza mientras exista un campo obligatorio pendiente.
