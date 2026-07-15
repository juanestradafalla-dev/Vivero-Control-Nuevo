# Activación transaccional de jornadas — ETAPA 12

## Alcance

`activarJornada` convierte una jornada preparada de `BORRADOR` a `ACTIVA` exclusivamente dentro de Firebase Emulator Suite. La operación recibe el ID, las versiones observadas de la jornada y de ambas selecciones, y una clave idempotente. La identidad, el rol y la hora proceden del backend.

Un supervisor solo activa un borrador propio. Un administrador puede activar cualquier borrador. Un auxiliar no puede ejecutar la operación.

## Resumen obsoleto

Maestro envía:

- `versionJornadaEsperada`;
- `versionSeleccionLineasEsperada`;
- `versionSeleccionParticipantesEsperada`.

La transacción vuelve a leer `jornadas`, `seleccionesLineasJornada` y `seleccionesParticipantesJornada`. Cualquier diferencia devuelve `ACTIVATION_STALE_SUMMARY` sin escritura parcial. Las selecciones no se modifican al activar y quedan como trazabilidad preparatoria inmutable.

## Validaciones centrales

Antes de escribir se exige:

- jornada todavía `BORRADOR` y propiedad administrativa válida;
- al menos una línea;
- al menos un participante con `puedeContar=true`;
- al menos un supervisor o administrador activo para revisión;
- perfiles existentes, activos y con el mismo rol central guardado en la preparación;
- líneas existentes, activas y libres de otra jornada `ACTIVA`;
- máximo técnico combinado de 200 elementos entre líneas y participantes.

El máximo combinado mantiene la transacción bajo el límite de Firestore. Con `N` líneas y `P` participantes, la activación realiza `2N + P + 3` escrituras: dos por línea, una por participante y tres para jornada, auditoría e idempotencia. Como ambos conjuntos deben ser no vacíos y `N + P <= 200`, el peor caso es 402 escrituras. Superar 200 devuelve `ACTIVATION_LIMIT_EXCEEDED` y no inicia lotes parciales.

## Transacción única

Después de completar todas las lecturas y validaciones, la misma transacción:

1. crea `jornadaLineas/{jornadaId}__{lineaId}` en `DISPONIBLE`, con `reservaActivaId=null`, versión operativa 0 y fotografía de vivero, módulo, cama y línea;
2. crea `ocupacionesLineasActivas/{lineaId}`;
3. crea `jornadas/{jornadaId}/autorizaciones/{usuarioId}` con nombre y rol releídos de `usuarios`;
4. cambia la jornada a `ACTIVA`, incrementa su versión y registra actor y hora central;
5. crea auditoría `JORNADA_ACTIVADA`;
6. crea el resultado idempotente `ACTIVAR_JORNADA`.

No se crean reservas, conteos, fotografías de inventario ni movimientos.

## Exclusión mutua e idempotencia

El documento determinista `ocupacionesLineasActivas/{lineaId}` es el bloqueo de la línea física. El seed crea estos bloqueos para todas las jornadas activas ficticias existentes. Dos transacciones que compiten por una línea solo pueden crear el mismo documento una vez: Firestore reintenta la transacción perdedora, que luego recibe `ACTIVATION_LINE_OCCUPIED`.

La idempotencia se separa por actor, operación y clave. El hash cubre el ID y las tres versiones esperadas. La misma clave y el mismo payload recuperan el resultado ya confirmado, incluso cuando la jornada ya está `ACTIVA`; cambiar cualquier parte del payload devuelve `IDEMPOTENCY_CONFLICT`.

## Seguridad y cliente

Las reglas niegan toda lectura o escritura directa de selecciones, bloqueos, auditoría e idempotencia. También permanecen prohibidas las escrituras directas de jornadas, autorizaciones y `jornadaLineas`.

Maestro bloquea la acción si faltan líneas, contador o revisor, o si existen cambios locales sin guardar. Antes de confirmar muestra líneas, participantes, permisos y las advertencias de visibilidad en Campo e inmutabilidad durante esta etapa. Tras el éxito retira el borrador y refresca las jornadas activas.

Campo no fue modificado funcionalmente: su operación existente `listarJornadasActivas` descubre la jornada recién materializada solo para participantes autorizados.
