import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import type {ControlledErrorCode} from "./domain/contracts.js";
import {DomainError, domainErrors} from "./domain/errors.js";
import {ReserveLineService} from "./domain/reserveLine.js";
import {SendCountService} from "./domain/sendCount.js";
import {parseReserveLineRequest, parseSendCountRequest} from "./domain/validation.js";
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
  if (code === "IDEMPOTENCY_CONFLICT") return "already-exists";
  if (code === "EMULATOR_ONLY") return "failed-precondition";
  if (code === "INTERNAL_ERROR") return "internal";
  if (["USER_NOT_FOUND", "JOURNEY_NOT_FOUND", "JOURNEY_LINE_NOT_FOUND", "RESERVATION_NOT_FOUND"].includes(code)) {
    return "not-found";
  }
  return "permission-denied";
}

function toHttpsError(error: DomainError): HttpsError {
  return new HttpsError(httpsCodeFor(error.code), error.message, {code: error.code});
}

const reserveLineService = new ReserveLineService(firestore);
const sendCountService = new SendCountService(firestore);

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
