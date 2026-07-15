# Pruebas — ETAPA 14

## Contratos

- solicitudes estrictas de cancelación y reapertura;
- motivo obligatorio con máximo técnico de 2.000 caracteres;
- rechazo de identidad y campos adicionales;
- resumen administrativo separado para cancelados;
- resultados idempotentes de ambas operaciones;
- cancelación inmutable con actor, motivo, versiones y hora central.

## Backend y emuladores

La integración usa Auth, Functions y Firestore Emulator reales y cubre:

- cancelación y reapertura válidas;
- supervisor propietario, supervisor ajeno, administrador y auxiliar;
- motivo vacío, excesivo, campos adicionales y versión obsoleta;
- jornada activa, cierre normal, doble cancelación y reapertura inválida;
- conservación exacta de líneas y participantes;
- rechazo individual de `jornadaLineas`, autorizaciones, reservas u ocupaciones existentes;
- idempotencia, conflicto y una sola auditoría por operación lógica;
- carrera cancelar/activar y carreras contra ambas ediciones preparatorias;
- un único ganador y ausencia de materialización parcial;
- inventario, movimientos, conteos e historial intactos.

Las reglas prueban que ningún cliente puede leer o escribir directamente jornadas en borrador, selecciones, cancelaciones, auditoría, idempotencia u ocupaciones.

## Maestro y Campo

Maestro prueba resumen de cancelación, motivo, confirmación explícita, sección separada, datos conservados de solo lectura y retorno a la lista editable después de reabrir. Acciones para jornadas activas, cierres normales o borradores ajenos no se construyen desde esta vista.

Campo no se modifica. La matriz Android existente confirma que continúa compilando y que solo consume jornadas `ACTIVA` autorizadas.

## Matriz

Se ejecutan contratos, Android (`assembleDebug`, pruebas y lint), Maestro (lint, typecheck, pruebas, build y audit), backend (lint, typecheck, unitarias, build, Emulator Suite, reglas y audit) y revisión de secretos/artefactos. No existe `firebase deploy`.
