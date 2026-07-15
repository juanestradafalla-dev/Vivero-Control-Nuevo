import type {
  ApproveCountRequest,
  InitiateCountCorrectionRequest,
  ReassignCountCorrectionRequest,
  ReleaseReservationRequest,
  ReserveLineRequest,
  ReturnCountRequest,
  SendCountRequest
} from "./contracts.js";
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
const approveCountFields = new Set(["conteoId", "claveIdempotencia", "motivoExcepcion"]);
const returnCountFields = new Set(["conteoId", "motivo", "claveIdempotencia"]);
const initiateCorrectionFields = new Set(["conteoId", "dispositivoId", "claveIdempotencia"]);
const reassignCorrectionFields = new Set(["conteoId", "nuevoUsuarioId", "motivo", "claveIdempotencia"]);
const releaseReservationFields = new Set(["reservaId", "motivo", "claveIdempotencia"]);
const REVIEW_REASON_LIMIT = 2000;

export function parseListActiveJourneysRequest(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length > 0) {
    throw domainErrors.invalidArgument();
  }
}

function parseReviewBase(
  value: unknown,
  allowedFields: ReadonlySet<string>
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !allowedFields.has(field))) {
    throw domainErrors.invalidArgument();
  }
  if (
    typeof record.conteoId !== "string" ||
    typeof record.claveIdempotencia !== "string" ||
    !safeIdPattern.test(record.conteoId) ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  return record;
}

function validReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= REVIEW_REASON_LIMIT;
}

export function parseApproveCountRequest(value: unknown): ApproveCountRequest {
  const record = parseReviewBase(value, approveCountFields);
  if (record.motivoExcepcion !== undefined && !validReason(record.motivoExcepcion)) {
    throw domainErrors.invalidArgument();
  }
  return {
    conteoId: record.conteoId as string,
    claveIdempotencia: record.claveIdempotencia as string,
    ...(record.motivoExcepcion === undefined
      ? {}
      : {motivoExcepcion: (record.motivoExcepcion as string).trim()})
  };
}

export function parseReturnCountRequest(value: unknown): ReturnCountRequest {
  const record = parseReviewBase(value, returnCountFields);
  if (!validReason(record.motivo)) throw domainErrors.returnReasonRequired();
  return {
    conteoId: record.conteoId as string,
    motivo: (record.motivo as string).trim(),
    claveIdempotencia: record.claveIdempotencia as string
  };
}

export function parseInitiateCountCorrectionRequest(value: unknown): InitiateCountCorrectionRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !initiateCorrectionFields.has(field))) {
    throw domainErrors.invalidArgument();
  }
  if (
    typeof record.conteoId !== "string" ||
    typeof record.dispositivoId !== "string" ||
    typeof record.claveIdempotencia !== "string" ||
    !safeIdPattern.test(record.conteoId) ||
    !safeIdPattern.test(record.dispositivoId) ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  return {
    conteoId: record.conteoId,
    dispositivoId: record.dispositivoId,
    claveIdempotencia: record.claveIdempotencia
  };
}

export function parseReassignCountCorrectionRequest(value: unknown): ReassignCountCorrectionRequest {
  const record = parseReviewBase(value, reassignCorrectionFields);
  if (
    typeof record.nuevoUsuarioId !== "string" ||
    !safeIdPattern.test(record.nuevoUsuarioId)
  ) {
    throw domainErrors.invalidArgument();
  }
  if (!validReason(record.motivo)) throw domainErrors.correctionReassignmentReasonRequired();
  return {
    conteoId: record.conteoId as string,
    nuevoUsuarioId: record.nuevoUsuarioId,
    motivo: (record.motivo as string).trim(),
    claveIdempotencia: record.claveIdempotencia as string
  };
}

export function parseReleaseReservationRequest(value: unknown): ReleaseReservationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !releaseReservationFields.has(field))) {
    throw domainErrors.invalidArgument();
  }
  if (
    typeof record.reservaId !== "string" ||
    typeof record.claveIdempotencia !== "string" ||
    !safeIdPattern.test(record.reservaId) ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  if (!validReason(record.motivo)) throw domainErrors.reservationReleaseReasonRequired();
  return {
    reservaId: record.reservaId,
    motivo: (record.motivo as string).trim(),
    claveIdempotencia: record.claveIdempotencia
  };
}

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
