# Jornadas en borrador y selección de líneas — ETAPA 10

## Modelo administrativo

Una jornada nueva nace con `estadoAdministrativo = BORRADOR`. Su identificador es global, el creador y la hora proceden del backend, y cada cambio incrementa su versión. El borrador todavía no es visible en Campo y no puede contener estados operativos.

La selección se guarda en `seleccionesLineasJornada/{jornadaId}` como dato de preparación. No se crean documentos en `jornadaLineas`, reservas, inventarios o movimientos. Activar la jornada permanece fuera de alcance.

## Operaciones centrales

`crearJornadaBorrador` acepta exclusivamente `nombreVisible` y `claveIdempotencia`. Valida Auth, perfil activo y rol `SUPERVISOR` o `ADMINISTRADOR`; después crea jornada, auditoría y resultado idempotente en una transacción.

`actualizarLineasJornadaBorrador` acepta `jornadaId`, `lineaIds` únicos y clave. El supervisor solo modifica un borrador propio y el administrador puede modificar cualquiera. Cada línea debe existir, estar activa y no pertenecer a una jornada `ACTIVA`. La operación vuelve a comprobar estado, propiedad y catálogo antes de confirmar la selección, versión, auditoría y resultado idempotente.

`listarJornadasAdministrables` usa exclusivamente `request.auth.uid`. Devuelve los borradores permitidos y un catálogo de líneas con ubicación visible y disponibilidad. No expone borradores a auxiliares.

## Vivero Maestro

La sección `Jornadas` permite crear y abrir borradores, buscar y filtrar el catálogo, agrupar por vivero, módulo y cama, seleccionar sin duplicados y revisar un resumen antes de guardar. Las líneas asociadas a una jornada activa aparecen bloqueadas.

La interfaz muestra de forma permanente `BORRADOR — AÚN NO DISPONIBLE EN CAMPO`. No ofrece activar, cerrar, cancelar, eliminar ni editar jornadas activas. Todas las escrituras pasan por Callables.

## Seguridad y aislamiento

Firestore Rules niega escrituras directas en jornadas, selección, auditoría e idempotencia. La colección de preparación tampoco puede leerse directamente desde clientes; el backend entrega solo la proyección autorizada. `listarJornadasActivas` conserva su filtro estricto por estado `ACTIVA`, por lo que Campo ignora los borradores.
