import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import type {ControlledErrorCode} from "./domain/contracts.js";
import {ActivateJourneyService} from "./domain/activateJourney.js";
import {
  ListManageableUsersService,
  UpdateUserRoleService,
  UpdateUserStatusService
} from "./domain/adminUsers.js";
import {CloseJourneyService} from "./domain/closeJourney.js";
import {
  CancelDraftJourneyService,
  ReopenCancelledJourneyService
} from "./domain/cancelDraftJourney.js";
import {DomainError, domainErrors} from "./domain/errors.js";
import {InitiateCountCorrectionService} from "./domain/correctCount.js";
import {
  CreateDraftJourneyService,
  ListManageableJourneysService,
  UpdateDraftJourneyLinesService
} from "./domain/draftJourneys.js";
import {
  ListDraftJourneyParticipantsService,
  UpdateDraftJourneyParticipantsService
} from "./domain/draftParticipants.js";
import {ListActiveJourneysService} from "./domain/listActiveJourneys.js";
import {ReassignCountCorrectionService} from "./domain/reassignCorrection.js";
import {ReleaseReservationService} from "./domain/releaseReservation.js";
import {ReserveLineService} from "./domain/reserveLine.js";
import {ApproveCountService, ReturnCountService} from "./domain/reviewCount.js";
import {SendCountService} from "./domain/sendCount.js";
import {
  parseApproveCountRequest,
  parseActivateJourneyRequest,
  parseCancelDraftJourneyRequest,
  parseCreateDraftJourneyRequest,
  parseCloseJourneyRequest,
  parseInitiateCountCorrectionRequest,
  parseListActiveJourneysRequest,
  parseListDraftJourneyParticipantsRequest,
  parseListManageableJourneysRequest,
  parseListManageableUsersRequest,
  parseReassignCountCorrectionRequest,
  parseReopenCancelledJourneyRequest,
  parseReleaseReservationRequest,
  parseReserveLineRequest,
  parseReturnCountRequest,
  parseSendCountRequest,
  parseUpdateDraftJourneyLinesRequest,
  parseUpdateDraftJourneyParticipantsRequest,
  parseUpdateUserRoleRequest,
  parseUpdateUserStatusRequest
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
  if ([
    "JOURNEY_NOT_DRAFT",
    "JOURNEY_NAME_REQUIRED",
    "LINE_INACTIVE",
    "LINE_ALREADY_IN_ACTIVE_JOURNEY",
    "DUPLICATE_LINE_IDS",
    "PARTICIPANT_INACTIVE",
    "DUPLICATE_PARTICIPANT_IDS",
    "ACTIVATION_STALE_SUMMARY",
    "ACTIVATION_SELECTIONS_INCOMPLETE",
    "ACTIVATION_LINES_REQUIRED",
    "ACTIVATION_COUNTER_REQUIRED",
    "ACTIVATION_REVIEWER_REQUIRED",
    "ACTIVATION_LIMIT_EXCEEDED",
    "ACTIVATION_PARTICIPANT_INACTIVE",
    "ACTIVATION_PARTICIPANT_ROLE_CHANGED",
    "ACTIVATION_LINE_INACTIVE",
    "ACTIVATION_LINE_OCCUPIED",
    "JOURNEY_NOT_ACTIVE",
    "JOURNEY_CLOSE_STALE_VERSION",
    "JOURNEY_CLOSE_PENDING_LINES",
    "JOURNEY_CLOSE_ACTIVE_RESERVATIONS",
    "JOURNEY_CLOSE_PENDING_CORRECTIONS",
    "JOURNEY_CLOSE_LIMIT_EXCEEDED",
    "JOURNEY_CLOSE_OCCUPATION_MISMATCH",
    "DRAFT_CANCELLATION_REASON_REQUIRED",
    "DRAFT_CANCELLATION_STALE_VERSION",
    "DRAFT_CANCELLATION_INVALID_STATE",
    "DRAFT_CANCELLATION_OPERATIONAL_DATA_EXISTS",
    "DRAFT_REOPEN_STALE_VERSION",
    "DRAFT_REOPEN_INVALID_STATE",
    "DRAFT_REOPEN_NOT_ALLOWED",
    "USER_PROFILE_STALE_VERSION",
    "SELF_DEACTIVATION_FORBIDDEN",
    "SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN",
    "LAST_ACTIVE_ADMIN_REQUIRED",
    "USER_ROLE_CHANGE_BLOCKED_ACTIVE_WORK",
    "USER_PROFILE_NO_CHANGE"
  ].includes(code)) return "failed-precondition";
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
  if ([
    "USER_NOT_FOUND",
    "JOURNEY_NOT_FOUND",
    "JOURNEY_LINE_NOT_FOUND",
    "LINE_NOT_FOUND",
    "PARTICIPANT_NOT_FOUND",
    "ACTIVATION_PARTICIPANT_NOT_FOUND",
    "ACTIVATION_LINE_NOT_FOUND",
    "RESERVATION_NOT_FOUND",
    "COUNT_NOT_FOUND"
  ].includes(code)) {
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
const listActiveJourneysService = new ListActiveJourneysService(firestore);
const createDraftJourneyService = new CreateDraftJourneyService(firestore);
const updateDraftJourneyLinesService = new UpdateDraftJourneyLinesService(firestore);
const listManageableJourneysService = new ListManageableJourneysService(firestore);
const listDraftJourneyParticipantsService = new ListDraftJourneyParticipantsService(firestore);
const updateDraftJourneyParticipantsService = new UpdateDraftJourneyParticipantsService(firestore);
const activateJourneyService = new ActivateJourneyService(firestore);
const closeJourneyService = new CloseJourneyService(firestore);
const cancelDraftJourneyService = new CancelDraftJourneyService(firestore);
const reopenCancelledJourneyService = new ReopenCancelledJourneyService(firestore);
const listManageableUsersService = new ListManageableUsersService(firestore);
const updateUserStatusService = new UpdateUserStatusService(firestore);
const updateUserRoleService = new UpdateUserRoleService(firestore);

export const listarUsuariosAdministrables = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    parseListManageableUsersRequest(request.data);
    return await listManageableUsersService.execute({actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en listarUsuariosAdministrables", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const actualizarEstadoUsuario = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseUpdateUserStatusRequest(request.data);
    return await updateUserStatusService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en actualizarEstadoUsuario", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const actualizarRolUsuario = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseUpdateUserRoleRequest(request.data);
    return await updateUserRoleService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en actualizarRolUsuario", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const cancelarJornadaBorrador = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseCancelDraftJourneyRequest(request.data);
    return await cancelDraftJourneyService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en cancelarJornadaBorrador", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const reabrirJornadaCancelada = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseReopenCancelledJourneyRequest(request.data);
    return await reopenCancelledJourneyService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en reabrirJornadaCancelada", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const cerrarJornada = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseCloseJourneyRequest(request.data);
    return await closeJourneyService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en cerrarJornada", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const activarJornada = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseActivateJourneyRequest(request.data);
    return await activateJourneyService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en activarJornada", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const listarParticipantesJornadaBorrador = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseListDraftJourneyParticipantsRequest(request.data);
    return await listDraftJourneyParticipantsService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en listarParticipantesJornadaBorrador", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const actualizarParticipantesJornadaBorrador = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseUpdateDraftJourneyParticipantsRequest(request.data);
    return await updateDraftJourneyParticipantsService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en actualizarParticipantesJornadaBorrador", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const crearJornadaBorrador = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseCreateDraftJourneyRequest(request.data);
    return await createDraftJourneyService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en crearJornadaBorrador", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const actualizarLineasJornadaBorrador = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    const payload = parseUpdateDraftJourneyLinesRequest(request.data);
    return await updateDraftJourneyLinesService.execute(payload, {actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en actualizarLineasJornadaBorrador", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const listarJornadasAdministrables = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    parseListManageableJourneysRequest(request.data);
    return await listManageableJourneysService.execute({actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en listarJornadasAdministrables", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

export const listarJornadasActivas = onCall({region: "us-central1"}, async (request) => {
  try {
    assertEmulatorOnly();
    if (!request.auth?.uid) throw domainErrors.unauthenticated();
    parseListActiveJourneysRequest(request.data);
    return await listActiveJourneysService.execute({actorId: request.auth.uid});
  } catch (error) {
    if (error instanceof DomainError) throw toHttpsError(error);
    logger.error("Fallo interno en listarJornadasActivas", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw toHttpsError(domainErrors.internal());
  }
});

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
