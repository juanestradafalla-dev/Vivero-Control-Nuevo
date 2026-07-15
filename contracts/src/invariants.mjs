const categories = ["hembras", "machos", "patrones"];

function hasIntegerCategories(value) {
  return (
    value &&
    categories.every((category) => Number.isInteger(value[category])) &&
    Number.isInteger(value.total)
  );
}

export function totalInvariantErrors(value, label) {
  if (!hasIntegerCategories(value)) {
    return [];
  }
  const expectedTotal = categories.reduce((sum, category) => sum + value[category], 0);
  return value.total === expectedTotal
    ? []
    : [`${label}.total debe ser ${expectedTotal} y se recibió ${value.total}`];
}

export function movementInvariantErrors(value) {
  if (!value?.valoresAnteriores || !value?.valoresNuevos || !value?.diferencias) {
    return [];
  }

  const errors = [
    ...totalInvariantErrors(value.valoresAnteriores, "valoresAnteriores"),
    ...totalInvariantErrors(value.valoresNuevos, "valoresNuevos"),
    ...totalInvariantErrors(value.diferencias, "diferencias")
  ];

  for (const field of [...categories, "total"]) {
    const previous = value.valoresAnteriores[field];
    const current = value.valoresNuevos[field];
    const difference = value.diferencias[field];
    if (![previous, current, difference].every(Number.isInteger)) {
      continue;
    }
    const expectedDifference = current - previous;
    if (difference !== expectedDifference) {
      errors.push(
        `diferencias.${field} debe ser ${expectedDifference} y se recibió ${difference}`
      );
    }
  }

  if (
    Number.isInteger(value.versionInventarioAnterior) &&
    Number.isInteger(value.versionInventarioNueva) &&
    value.versionInventarioNueva !== value.versionInventarioAnterior + 1
  ) {
    errors.push("versionInventarioNueva debe incrementar exactamente una vez la versión anterior");
  }

  return errors;
}

export function invariantErrorsFor(schemaFilename, value) {
  if (schemaFilename === "conteo.schema.json") {
    return totalInvariantErrors(value, "conteo");
  }
  if (schemaFilename === "inventario-oficial-linea.schema.json") {
    return totalInvariantErrors(value, "inventario");
  }
  if (schemaFilename === "movimiento-historico.schema.json") {
    return movementInvariantErrors(value);
  }
  if (schemaFilename === "approve-count-result.schema.json") {
    return movementInvariantErrors({
      valoresAnteriores: value?.inventarioAnterior,
      valoresNuevos: value?.inventarioNuevo,
      diferencias: value?.diferencias
    });
  }
  return [];
}
