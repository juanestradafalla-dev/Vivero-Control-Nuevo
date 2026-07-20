# ETAPA 26 — Arquitectura del informe mensual de inventario

## Frontera funcional

La ETAPA 26 extiende el flujo existente; no crea un segundo inventario. Campo captura, `enviarConteo` crea versiones inmutables, Maestro revisa, `aprobarConteo` actualiza la fotografía oficial y `cerrarJornada` inicia un cierre durable. Solo las jornadas cuya `configuracionInformeInventario.habilitado` sea `true` crean un trabajo de informe al finalizar el cierre.

```text
BORRADOR configurado
  -> ACTIVA
  -> conteos y descartes dentro de Vivero Control
  -> todas las líneas APROBADA
  -> cerrarJornada
       ├─ jornada CERRANDO
       └─ trabajosCierreJornada/{jornadaId} PENDIENTE
            -> PROCESANDO
                 -> LINEAS por lotes de 100
                 -> OCUPACIONES por lotes de 100
                 -> AUTORIZACIONES por lotes de 100
                 -> FINALIZAR
            -> COMPLETADO
                 ├─ jornada INACTIVA
                 ├─ auditoría e idempotencia final
                 └─ informesInventario/{jornadaId} PENDIENTE
                      -> PROCESANDO
                      -> COMPLETADO | ERROR_REINTENTABLE | ERROR_PERMANENTE
```

Drive nunca participa en una transacción Firestore. La jornada queda cerrada cuando la fase final confirma `INACTIVA`; una falla posterior del informe no la reactiva.

## Cierre durable por fases

`cerrarJornada` vuelve a validar centralmente jornada, versión, propiedad, líneas aprobadas, reservas, correcciones, reasignaciones y descartes pendientes. Si todo coincide, congela una huella SHA-256 del alcance, cambia `ACTIVA` a `CERRANDO` y crea el trabajo determinista `trabajosCierreJornada/{jornadaId}`. La Callable devuelve `CERRANDO` con el ID del trabajo y su progreso inicial; no espera a que finalicen todos los lotes.

Mientras una jornada está `CERRANDO`, el backend rechaza reservas, conteos, correcciones, descartes y modificaciones vinculadas. Las líneas continúan lógicamente ocupadas en selección de borradores, activación y administración del catálogo aunque el lote de ocupaciones ya haya eliminado `ocupacionesLineasActivas/{lineaId}`. Esta protección usa el estado de la jornada y la membresía congelada, no solo la presencia temporal del bloqueo de ocupación.

El worker reclama el trabajo mediante transacción y lease de 15 minutos. Cada entrega procesa como máximo 100 elementos de la fase actual y guarda cursor, cantidades procesadas, intentos, actualización y error sanitizado. Los lotes son idempotentes: repetir un lote o reanudar después de cualquier interrupción no duplica cambios ni retrocede el progreso. Un trabajo en `ERROR`, o `PROCESANDO` con lease vencido, puede volver a `PENDIENTE` únicamente mediante `reintentarCierreJornada` y autorización central.

La transacción `FINALIZAR` comprueba de nuevo la huella y el progreso completo. Solo entonces cambia `CERRANDO` a `INACTIVA`, termina exactamente una auditoría y el resultado idempotente y crea exactamente un informe `PENDIENTE` cuando la configuración lo exige. Un fallo nunca vuelve a `ACTIVA`, no borra historia y no duplica auditoría, informe ni eliminaciones. Los resultados históricos de cierres anteriores que ya devolvían `INACTIVA` continúan siendo compatibles.

El límite funcional es 400 líneas por jornada. El límite no se consigue ampliando una transacción monolítica: se sostiene con fases y lotes de 100 dentro de límites seguros de Firestore.

La regresión dirigida aprobó `6/6` con exactamente 271 líneas distribuidas `76, 76, 76, 29, 14`. Se interrumpió el procesamiento después de cada lote y cada reanudación continuó desde el cursor persistido sin duplicar auditoría, idempotencia, informe ni eliminaciones.

## Configuración de jornada

```json
{
  "habilitado": true,
  "mes": 7,
  "anio": 2026,
  "fuentePlantasMuertas": "CONTEO_FISICO"
}
```

La configuración es opcional para mantener las jornadas anteriores. Cuando existe y está habilitada, el backend valida el periodo y una fuente del conjunto cerrado `CONTEO_FISICO | DESCARTES_APROBADOS`. Se guarda al crear el borrador y queda inmutable después de activar.

## Plantas muertas

### `CONTEO_FISICO`

`plantasMuertas` pertenece al conteo inmutable, al borrador Room y al payload congelado. Es obligatoria y no negativa. El total vivo continúa siendo exclusivamente `hembras + machos + patrones`; la aprobación no suma ni resta plantas muertas del inventario oficial.

### `DESCARTES_APROBADOS`

El cliente omite `plantasMuertas`. Al registrar un descarte, el backend consulta `ocupacionesLineasActivas/{lineaId}` y, si existe una jornada activa configurada, fotografía `jornadaId` y `jornadaLineaId` en el descarte. El informe suma `causas.muertos` solo cuando el descarte:

- pertenece a la misma jornada y línea;
- está `APROBADO`;
- fue registrado entre `activadaEn` y `cerradaEn`.

No se infieren relaciones para documentos históricos. Un descarte `PENDIENTE_REVISION` bloquea el cierre; uno devuelto no participa.

La captura asociada incrementa un guard dentro de `ocupacionesLineasActivas/{lineaId}`. El inicio del cierre lee ese guard y congela el alcance en la misma transacción que cambia a `CERRANDO`: si gana el descarte, el cierre vuelve a verlo y se bloquea; si gana el cierre, una captura posterior encuentra `CERRANDO` y se rechaza. La eliminación física posterior de la ocupación no abre una ventana para nuevo trabajo.

## Documento central

`trabajosCierreJornada/{jornadaId}` e `informesInventario/{jornadaId}` usan IDs deterministas. El trabajo de cierre conserva la huella congelada, listas de IDs, fase, cursor, progreso, intentos, lease y error sanitizado. El informe conserva periodo, fuente, estado, intentos, error sanitizado, actor de cierre, fechas, nombre del archivo, ID y enlace de Drive, y huella canónica del contenido. Ningún cliente crea o actualiza directamente estos documentos.

Antes de escribir el trabajo, el backend limita su representación UTF-8 a 750 KiB como margen defensivo frente al límite de 1 MiB de Firestore. No trunca observaciones: si se supera, todo el cierre se rechaza con un error controlado y cero escrituras parciales.

El procesador del informe reclama `PENDIENTE` mediante transacción. Solo la reclamación ganadora puede completar o registrar el error. Una reclamación `PROCESANDO` usa un arrendamiento de 15 minutos: una entrega repetida espera mientras siga vigente y puede recuperarla cuando quede obsoleta. La huella SHA-256 del informe se calcula sobre los bytes del XLSX efectivamente generado, no sobre datos confiados al cliente.

## Generación XLSX

El adaptador de Excel carga una copia en memoria de la plantilla. Conserva estilos, combinaciones, anchos, alturas, fórmulas y configuración de impresión; elimina de la copia final toda hoja distinta de `MODULO 1` a `MODULO 5`.

Las columnas se descubren por sus encabezados normalizados: `FECHA`, `CAMA`, `LINEA`, `PLANTAS PATRON`, `PLANTAS HEMBRAS`, `PLANTAS MACHOS`, `PLANTAS MUERTAS` y `OBSERVACIONES`. Cada línea aprobada debe encontrar exactamente una fila con el mismo módulo, cama y línea. Duplicados, módulos inesperados, filas sin conteo o líneas sin fila producen un error permanente antes de subir.

Antes de rellenar, el generador limpia valores y fórmulas exclusivamente en las celdas objetivo de filas reconocidas como datos. Una fórmula histórica previa se admite solo si la celda pertenece a una línea mapeada y será sobrescrita obligatoriamente por el valor aprobado del sistema. Cuando existe la columna `TOTAL VIVAS`, también se reemplaza obligatoriamente con el total central congelado y nunca conserva una fórmula de fila. Una fórmula en una fila no mapeada, en una columna inesperada o con posibilidad de sobrevivir en el resultado se rechaza. Esta política cubre expresamente las fórmulas históricas observadas en `MODULO 4!F8` y `MODULO 4!F28`.

Las 17 fórmulas estructurales y de totales permanecen intactas. El libro se marca para recálculo completo al abrirse y el resultado debe contener cero referencias `#REF!` y ninguna fórmula hacia hojas eliminadas.

El encabezado escribe módulo, fecha de activación y fecha de cierre en los espacios identificados, preservando sus combinaciones. El nombre visible del responsable se escribe solo cuando la plantilla contiene una etiqueta y un espacio para ello; no se fabrica una firma.

Las fechas de conteo se presentan en `America/Bogota`. El nombre se deriva del periodo, por ejemplo `INVENTARIO JULIO 2026.xlsx`.

La plantilla real se verificó mediante una copia temporal: conservó hojas `MODULO 1` a `MODULO 5`, estilos, combinaciones, bordes, dimensiones, configuración de impresión y mapeo cama/línea; excluyó `G3`; sustituyó `MODULO 4!F8` por `112` y `MODULO 4!F28` por `101` como valores; preservó exactamente 17 fórmulas y produjo cero `#REF!`. Se comprobaron ambas fuentes de plantas muertas y se revisaron visualmente 8 páginas. El original conservó SHA-256 `307572F85D812EED3EFCD15DBDE3C9F4FBA6367636C9C2D184B1262AAFE959CC`.

## Reintentos

`reintentarInformeInventario` solo acepta `ERROR_REINTENTABLE`, vuelve a validar actor y propiedad de la jornada y restablece `PENDIENTE` de forma idempotente. Los fallos corregibles de configuración, permisos, MIME o consistencia de Drive quedan en ese estado; los defectos intrínsecos de mapeo de la plantilla quedan como `ERROR_PERMANENTE`. El procesador busca primero el archivo por carpeta y `appProperties` de jornada/periodo; si una subida anterior ocurrió antes de guardar su ID en Firestore, el reintento encuentra y actualiza el mismo archivo.
