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

function discardRequestInvariantErrors(value) {
  if (!value || !categories.every((category) => Number.isInteger(value[category]))) {
    return [];
  }
  const total = categories.reduce((sum, category) => sum + value[category], 0);
  const causes = value.causas;
  if (!causes || typeof causes !== "object") return [];
  const causeFields = ["muertos", "nematodos", "cuelloGanso", "raicesBifurcadas", "dobleInjertacion"];
  const errors = [];
  if (total <= 0) errors.push("El total único del descarte debe ser mayor que cero");
  for (const field of causeFields) {
    if (Number.isInteger(causes[field]) && causes[field] > total) {
      errors.push(`causas.${field} no puede superar el total único ${total}`);
    }
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
  if (schemaFilename === "register-discard-request.schema.json") {
    return discardRequestInvariantErrors(value);
  }
  if (schemaFilename === "register-discard-result.schema.json") {
    if (!value) return [];
    const expected = Number.isInteger(value.hembras) && Number.isInteger(value.machos) && Number.isInteger(value.patrones)
      ? value.hembras + value.machos + value.patrones
      : undefined;
    return expected === undefined || value.totalUnico === expected
      ? []
      : [`totalUnico debe ser ${expected} y se recibió ${value.totalUnico}`];
  }
  if (schemaFilename === "list-discard-lines-result.schema.json") {
    return Array.isArray(value?.lineas)
      ? value.lineas.flatMap((line, index) => totalInvariantErrors(line?.inventario, `lineas[${index}].inventario`))
      : [];
  }
  if (schemaFilename === "approve-discard-result.schema.json") {
    return [
      ...totalInvariantErrors(value?.inventarioAnterior, "inventarioAnterior"),
      ...totalInvariantErrors(value?.inventarioNuevo, "inventarioNuevo")
    ];
  }
  return [];
}
