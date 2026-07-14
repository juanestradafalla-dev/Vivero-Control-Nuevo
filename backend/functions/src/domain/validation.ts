import type {ReserveLineRequest, SendCountRequest} from "./contracts.js";
import {domainErrors} from "./errors.js";

const safeIdPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const idempotencyPattern = /^[A-Za-z0-9._:-]{8,160}$/;
const requestFields = new Set(["jornadaLineaId", "dispositivoId", "claveIdempotencia"]);
const sendCountFields = new Set([
  "reservaId",
  "tokenReserva",
  "dispositivoId",
  "hembras",
  "machos",
  "patrones",
  "observaciones",
  "timestampDispositivo",
  "claveIdempotencia"
]);
const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

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

export function parseSendCountRequest(value: unknown): SendCountRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !sendCountFields.has(field))) {
    throw domainErrors.invalidArgument();
  }
  if (
    typeof record.reservaId !== "string" ||
    typeof record.tokenReserva !== "string" ||
    typeof record.dispositivoId !== "string" ||
    typeof record.timestampDispositivo !== "string" ||
    typeof record.claveIdempotencia !== "string" ||
    !safeIdPattern.test(record.reservaId) ||
    !tokenPattern.test(record.tokenReserva) ||
    !safeIdPattern.test(record.dispositivoId) ||
    !timestampPattern.test(record.timestampDispositivo) ||
    !Number.isFinite(Date.parse(record.timestampDispositivo)) ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }

  const quantities = [record.hembras, record.machos, record.patrones];
  if (quantities.some((quantity) => !Number.isSafeInteger(quantity) || (quantity as number) < 0)) {
    throw domainErrors.invalidArgument();
  }
  const total = (record.hembras as number) + (record.machos as number) + (record.patrones as number);
  if (!Number.isSafeInteger(total)) throw domainErrors.invalidArgument();
  if (
    record.observaciones !== undefined &&
    (typeof record.observaciones !== "string" || record.observaciones.length > 4000)
  ) {
    throw domainErrors.invalidArgument();
  }

  return {
    reservaId: record.reservaId,
    tokenReserva: record.tokenReserva,
    dispositivoId: record.dispositivoId,
    hembras: record.hembras as number,
    machos: record.machos as number,
    patrones: record.patrones as number,
    ...(record.observaciones === undefined ? {} : {observaciones: record.observaciones as string}),
    timestampDispositivo: record.timestampDispositivo,
    claveIdempotencia: record.claveIdempotencia
  };
}
