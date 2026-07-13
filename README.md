# Vivero Control

Vivero Control será un sistema nuevo para administrar el inventario del vivero mediante dos aplicaciones conectadas a una única fuente central de datos. Este repositorio no es una modificación ni una copia del proyecto anterior `Vivero-Control`; aquel sistema se considera únicamente una referencia funcional y visual.

## Aplicaciones previstas

- **Vivero Campo:** aplicación Android minimalista para reservar líneas, contar plantas y sincronizar conteos. Podrán usarla auxiliares y la cuenta maestra con rol de administrador; todos seguirán el mismo procedimiento de reserva y conteo.
- **Vivero Maestro:** aplicación administrativa para Windows destinada a crear jornadas, supervisar el avance, revisar conteos y mantener el inventario oficial. La tecnología de implementación sigue pendiente de decisión.

Ambas aplicaciones compartirán una sola fuente central del inventario oficial y deberán usar Firebase Authentication. La arquitectura, los modelos y las reglas de acceso se diseñarán antes de implementar o configurar Firebase.

## Alcance de la Etapa 1

Esta etapa contiene exclusivamente:

- definición funcional del primer MVP;
- roles y permisos;
- flujo completo de jornadas de inventario;
- propuesta de entidades y campos;
- validaciones y casos límite;
- decisiones todavía pendientes;
- criterios verificables de aceptación;
- estructura inicial vacía para el trabajo futuro.

## Estado actual

**Todavía no existe una implementación funcional.** No se ha creado código Android, Electron, React, backend ni pruebas ejecutables; tampoco se ha configurado Firebase, se han copiado dependencias o artefactos del proyecto anterior, ni se han definido datos operativos no suministrados.

## Documentación

- [Definición funcional de la Etapa 1](docs/ETAPA_01_DEFINICION_FUNCIONAL.md)
- [Roles y permisos](docs/ROLES_Y_PERMISOS.md)
- [Flujo de jornada de inventario](docs/FLUJO_JORNADA_INVENTARIO.md)
- [Diccionario de datos](docs/DICCIONARIO_DE_DATOS.md)
- [Validaciones y casos límite](docs/VALIDACIONES_Y_CASOS_LIMITE.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)
- [Criterios de aceptación del MVP](docs/CRITERIOS_DE_ACEPTACION_MVP.md)

## Estructura futura propuesta

```text
Vivero-Control-Nuevo/
|-- apps/
|   |-- campo-android/       # futura aplicación Vivero Campo
|   `-- maestro-desktop/     # futura aplicación Vivero Maestro
|-- backend/                 # futuras reglas, índices y servicios centrales
|-- docs/                    # especificación y decisiones del sistema
|-- tests/                   # futuras pruebas compartidas y de aceptación
`-- README.md
```

Las carpetas de aplicaciones, backend y pruebas permanecen deliberadamente vacías en esta etapa.

## Principios obligatorios

- Una sola fuente central para el inventario oficial.
- Identificadores globales y catálogos controlados para ubicaciones.
- Reserva y aprobación mediante operaciones atómicas.
- Inventario oficial por línea, actualizado únicamente mediante conteos aprobados.
- Cada aprobación reemplaza la fotografía actual de la línea y registra la diferencia como movimiento histórico.
- Historial de versiones y auditoría sin eliminaciones silenciosas.
- Idempotencia para impedir efectos duplicados.
- Trabajo temporal sin conexión después de obtener una reserva válida.
- Separación estricta de los ambientes de desarrollo y producción.
