import {invariantErrorsFor} from "./invariants.mjs";

export function validateContract(registry, schemaFilename, value) {
  const validator = registry.validators.get(`schemas/${schemaFilename}`);
  if (!validator) {
    throw new Error(`No existe validador para schemas/${schemaFilename}`);
  }

  const schemaValid = validator(value);
  const schemaErrors = schemaValid ? [] : structuredClone(validator.errors ?? []);
  const invariantErrors = invariantErrorsFor(schemaFilename, value);

  return {
    valid: schemaValid && invariantErrors.length === 0,
    schemaErrors,
    invariantErrors
  };
}
