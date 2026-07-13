import type {ReserveLineRequest} from "./contracts.js";
import {domainErrors} from "./errors.js";

const safeIdPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const idempotencyPattern = /^[A-Za-z0-9._:-]{8,160}$/;
const requestFields = new Set(["jornadaLineaId", "dispositivoId", "claveIdempotencia"]);

export function parseReserveLineRequest(value: unknown): ReserveLineRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !requestFields.has(field))) {
    throw domainErrors.invalidArgument();
  }
  if (
    typeof record.jornadaLineaId !== "string" ||
    typeof record.dispositivoId !== "string" ||
    typeof record.claveIdempotencia !== "string" ||
    !safeIdPattern.test(record.jornadaLineaId) ||
    !safeIdPattern.test(record.dispositivoId) ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  return {
    jornadaLineaId: record.jornadaLineaId,
    dispositivoId: record.dispositivoId,
    claveIdempotencia: record.claveIdempotencia
  };
}
