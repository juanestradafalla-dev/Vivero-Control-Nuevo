import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import type {ControlledErrorCode} from "./domain/contracts.js";
import {DomainError, domainErrors} from "./domain/errors.js";
import {InitiateCountCorrectionService} from "./domain/correctCount.js";
import {ReassignCountCorrectionService} from "./domain/reassignCorrection.js";
import {ReleaseReservationService} from "./domain/releaseReservation.js";
import {ReserveLineService} from "./domain/reserveLine.js";
import {ApproveCountService, ReturnCountService} from "./domain/reviewCount.js";
import {SendCountService} from "./domain/sendCount.js";
import {
  parseApproveCountRequest,
  parseInitiateCountCorrectionRequest,
  parseReassignCountCorrectionRequest,
  parseReleaseReservationRequest,
  parseReserveLineRequest,
  parseReturnCountRequest,
  parseSendCountRequest
} from "./domain/validation.js";
import {firestore} from "./firebase.js";

function assertEmulatorOnly(): void {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
  if (process.env.FUNCTIONS_EMULATOR !== "true" || !projectId.startsWith("demo-")) {
    throw domainErrors.emulatorOnly();
  }
}

function httpsCodeFor(code: ControlledErrorCode): ConstructorParameters<typeof HttpsError>[0] {
  if (code === "UNAUTHENTICATED") return "unauthenticated";
  if (code === "INVALID_ARGUMENT") return "invalid-argument";
  if (code === "LINE_NOT_AVAILABLE") return "failed-precondition";
  if (["RESERVATION_NOT_ACTIVE", "LINE_RESERVATION_MISMATCH", "LINE_NOT_IN_COUNT"].includes(code)) {
    return "failed-precondition";
  }
  if (["RESERVATION_RELEASED", "RESERVATION_ALREADY_COUNTED", "RESERVATION_RELEASE_REASON_REQUIRED"].includes(code)) {
    return "failed-precondition";
  }
  if (["COUNT_NOT_PENDING_REVIEW", "COUNT_LINE_MISMATCH", "EXCEPTION_REASON_REQUIRED", "INVENTORY_NOT_FOUND"].includes(code)) {
    return "failed-precondition";
  }
  if (["COUNT_NOT_RETURNED", "ACTIVE_RESERVATION_EXISTS"].includes(code)) return "failed-precondition";
  if ([
    "CORRECTION_REASSIGNMENT_REASON_REQUIRED",
    "CORRECTION_REASSIGNMENT_NO_CHANGE"
  ].includes(code)) {
    return "failed-precondition";
  }
  if (code === "IDEMPOTENCY_CONFLICT") return "already-exists";
  if (code === "EMULATOR_ONLY") return "failed-precondition";
  if (code === "INTERNAL_ERROR") return "internal";
  if (["USER_NOT_FOUND", "JOURNEY_NOT_FOUND", "JOURNEY_LINE_NOT_FOUND", "RESERVATION_NOT_FOUND", "COUNT_NOT_FOUND"].includes(code)) {
    return "not-found";
  }
  return "permission-denied";
}

function toHttpsError(error: DomainError): HttpsError {
  return new HttpsError(httpsCodeFor(error.code), error.message, {code: error.code});
}

const reserveLineService = new ReserveLineService(firestore);
const sendCountService = new SendCountService(firestore);
const approveCountService = new ApproveCountService(firestore);
const returnCountService = new ReturnCountService(firestore);
const initiateCountCorrectionService = new InitiateCountCorrectionService(firestore);
const reassignCountCorrectionService = new ReassignCountCorrectionService(firestore);
const releaseReservationService = new ReleaseReservationService(firestore);

export const reservarLinea = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseReserveLineRequest(request.data);
    return await reserveLineService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en reservarLinea", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const enviarConteo = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseSendCountRequest(request.data);
    return await sendCountService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en enviarConteo", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const iniciarCorreccionConteo = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseInitiateCountCorrectionRequest(request.data);
    return await initiateCountCorrectionService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en iniciarCorreccionConteo", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const reasignarCorreccionConteo = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseReassignCountCorrectionRequest(request.data);
    return await reassignCountCorrectionService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en reasignarCorreccionConteo", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const liberarReservaLinea = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseReleaseReservationRequest(request.data);
    return await releaseReservationService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en liberarReservaLinea", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const aprobarConteo = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseApproveCountRequest(request.data);
    return await approveCountService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en aprobarConteo", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const devolverConteo = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseReturnCountRequest(request.data);
    return await returnCountService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en devolverConteo", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});
