import type {
  ActivateJourneyRequest,
  ApproveCountRequest,
  CreateDraftJourneyRequest,
  InitiateCountCorrectionRequest,
  ListDraftJourneyParticipantsRequest,
  ReassignCountCorrectionRequest,
  ReleaseReservationRequest,
  ReserveLineRequest,
  ReturnCountRequest,
  SendCountRequest,
  UpdateDraftJourneyLinesRequest,
  UpdateDraftJourneyParticipantsRequest
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
const createDraftJourneyFields = new Set(["nombreVisible", "claveIdempotencia"]);
const updateDraftJourneyLinesFields = new Set(["jornadaId", "lineaIds", "claveIdempotencia"]);
const listDraftJourneyParticipantsFields = new Set(["jornadaId"]);
const updateDraftJourneyParticipantsFields = new Set(["jornadaId", "participantes", "claveIdempotencia"]);
const draftParticipantFields = new Set(["usuarioId", "puedeContar"]);
const activateJourneyFields = new Set([
  "jornadaId",
  "versionJornadaEsperada",
  "versionSeleccionLineasEsperada",
  "versionSeleccionParticipantesEsperada",
  "claveIdempotencia"
]);
const REVIEW_REASON_LIMIT = 2000;
const JOURNEY_NAME_LIMIT = 200;
const DRAFT_LINE_LIMIT = 400;
const DRAFT_PARTICIPANT_LIMIT = 200;

export function parseListActiveJourneysRequest(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length > 0) {
    throw domainErrors.invalidArgument();
  }
}

export const parseListManageableJourneysRequest = parseListActiveJourneysRequest;

export function parseCreateDraftJourneyRequest(value: unknown): CreateDraftJourneyRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !createDraftJourneyFields.has(field))) {
    throw domainErrors.invalidArgument();
  }
  if (typeof record.nombreVisible !== "string" || record.nombreVisible.trim().length === 0) {
    throw domainErrors.journeyNameRequired();
  }
  if (
    record.nombreVisible.length > JOURNEY_NAME_LIMIT ||
    typeof record.claveIdempotencia !== "string" ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  return {
    nombreVisible: record.nombreVisible.trim(),
    claveIdempotencia: record.claveIdempotencia
  };
}

export function parseUpdateDraftJourneyLinesRequest(value: unknown): UpdateDraftJourneyLinesRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((field) => !updateDraftJourneyLinesFields.has(field))) {
    throw domainErrors.invalidArgument();
  }
  if (
    typeof record.jornadaId !== "string" ||
    !safeIdPattern.test(record.jornadaId) ||
    !Array.isArray(record.lineaIds) ||
    record.lineaIds.length > DRAFT_LINE_LIMIT ||
    record.lineaIds.some((lineId) => typeof lineId !== "string" || !safeIdPattern.test(lineId)) ||
    typeof record.claveIdempotencia !== "string" ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  const lineIds = record.lineaIds as string[];
  if (new Set(lineIds).size !== lineIds.length) throw domainErrors.duplicateLineIds();
  return {
    jornadaId: record.jornadaId,
    lineaIds: [...lineIds].sort((left, right) => left.localeCompare(right)),
    claveIdempotencia: record.claveIdempotencia
  };
}

export function parseListDraftJourneyParticipantsRequest(value: unknown): ListDraftJourneyParticipantsRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((field) => !listDraftJourneyParticipantsFields.has(field)) ||
    typeof record.jornadaId !== "string" ||
    !safeIdPattern.test(record.jornadaId)
  ) {
    throw domainErrors.invalidArgument();
  }
  return {jornadaId: record.jornadaId};
}

export function parseUpdateDraftJourneyParticipantsRequest(
  value: unknown
): UpdateDraftJourneyParticipantsRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((field) => !updateDraftJourneyParticipantsFields.has(field)) ||
    typeof record.jornadaId !== "string" ||
    !safeIdPattern.test(record.jornadaId) ||
    !Array.isArray(record.participantes) ||
    record.participantes.length > DRAFT_PARTICIPANT_LIMIT ||
    typeof record.claveIdempotencia !== "string" ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  const participants = record.participantes.map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw domainErrors.invalidArgument();
    }
    const participant = value as Record<string, unknown>;
    if (
      Object.keys(participant).some((field) => !draftParticipantFields.has(field)) ||
      typeof participant.usuarioId !== "string" ||
      !safeIdPattern.test(participant.usuarioId) ||
      typeof participant.puedeContar !== "boolean"
    ) {
      throw domainErrors.invalidArgument();
    }
    return {usuarioId: participant.usuarioId, puedeContar: participant.puedeContar};
  });
  if (new Set(participants.map((participant) => participant.usuarioId)).size !== participants.length) {
    throw domainErrors.duplicateParticipantIds();
  }
  return {
    jornadaId: record.jornadaId,
    participantes: participants.sort((left, right) => left.usuarioId.localeCompare(right.usuarioId)),
    claveIdempotencia: record.claveIdempotencia
  };
}

export function parseActivateJourneyRequest(value: unknown): ActivateJourneyRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.invalidArgument();
  }
  const record = value as Record<string, unknown>;
  const versions = [
    record.versionJornadaEsperada,
    record.versionSeleccionLineasEsperada,
    record.versionSeleccionParticipantesEsperada
  ];
  if (
    Object.keys(record).some((field) => !activateJourneyFields.has(field)) ||
    typeof record.jornadaId !== "string" ||
    !safeIdPattern.test(record.jornadaId) ||
    versions.some((version) => !Number.isSafeInteger(version) || (version as number) < 1) ||
    typeof record.claveIdempotencia !== "string" ||
    !idempotencyPattern.test(record.claveIdempotencia)
  ) {
    throw domainErrors.invalidArgument();
  }
  return {
    jornadaId: record.jornadaId,
    versionJornadaEsperada: record.versionJornadaEsperada as number,
    versionSeleccionLineasEsperada: record.versionSeleccionLineasEsperada as number,
    versionSeleccionParticipantesEsperada: record.versionSeleccionParticipantesEsperada as number,
    claveIdempotencia: record.claveIdempotencia
  };
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
