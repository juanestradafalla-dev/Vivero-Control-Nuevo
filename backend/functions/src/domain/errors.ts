import type {ControlledErrorCode} from "./contracts.js";

export class DomainError extends Error {
  constructor(
    readonly code: ControlledErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const domainErrors = {
  journeyNotDraft: () => new DomainError("JOURNEY_NOT_DRAFT", "La jornada ya no esta en borrador."),
  journeyNameRequired: () => new DomainError("JOURNEY_NAME_REQUIRED", "Escribe un nombre para la jornada."),
  journeyDraftAccessDenied: () => new DomainError(
    "JOURNEY_DRAFT_ACCESS_DENIED",
    "La cuenta no puede gestionar este borrador."
  ),
  lineNotFound: () => new DomainError("LINE_NOT_FOUND", "Una de las lineas seleccionadas no existe."),
  lineInactive: () => new DomainError("LINE_INACTIVE", "Una de las lineas seleccionadas esta inactiva."),
  lineAlreadyInActiveJourney: () => new DomainError(
    "LINE_ALREADY_IN_ACTIVE_JOURNEY",
    "Una de las lineas seleccionadas ya pertenece a una jornada activa."
  ),
  duplicateLineIds: () => new DomainError("DUPLICATE_LINE_IDS", "La seleccion contiene lineas repetidas."),
  participantNotFound: () => new DomainError(
    "PARTICIPANT_NOT_FOUND",
    "Una de las cuentas seleccionadas no existe."
  ),
  participantInactive: () => new DomainError(
    "PARTICIPANT_INACTIVE",
    "Una de las cuentas seleccionadas esta inactiva."
  ),
  duplicateParticipantIds: () => new DomainError(
    "DUPLICATE_PARTICIPANT_IDS",
    "La seleccion contiene participantes repetidos."
  ),
  activationStaleSummary: () => new DomainError(
    "ACTIVATION_STALE_SUMMARY",
    "El resumen del borrador cambio. Actualiza la informacion antes de activar."
  ),
  activationSelectionsIncomplete: () => new DomainError(
    "ACTIVATION_SELECTIONS_INCOMPLETE",
    "El borrador no conserva todas sus selecciones preparatorias."
  ),
  activationLinesRequired: () => new DomainError(
    "ACTIVATION_LINES_REQUIRED",
    "Selecciona al menos una linea antes de activar."
  ),
  activationCounterRequired: () => new DomainError(
    "ACTIVATION_COUNTER_REQUIRED",
    "Selecciona al menos un participante con permiso para contar."
  ),
  activationReviewerRequired: () => new DomainError(
    "ACTIVATION_REVIEWER_REQUIRED",
    "Selecciona al menos un supervisor o administrador activo para revision."
  ),
  activationLimitExceeded: () => new DomainError(
    "ACTIVATION_LIMIT_EXCEEDED",
    "La preparacion supera el maximo tecnico combinado de 200 lineas y participantes."
  ),
  activationParticipantNotFound: () => new DomainError(
    "ACTIVATION_PARTICIPANT_NOT_FOUND",
    "Un participante seleccionado ya no existe."
  ),
  activationParticipantInactive: () => new DomainError(
    "ACTIVATION_PARTICIPANT_INACTIVE",
    "Un participante seleccionado ya no esta activo."
  ),
  activationParticipantRoleChanged: () => new DomainError(
    "ACTIVATION_PARTICIPANT_ROLE_CHANGED",
    "El rol de un participante cambio. Actualiza la seleccion antes de activar."
  ),
  activationLineNotFound: () => new DomainError(
    "ACTIVATION_LINE_NOT_FOUND",
    "Una linea seleccionada ya no existe."
  ),
  activationLineInactive: () => new DomainError(
    "ACTIVATION_LINE_INACTIVE",
    "Una linea seleccionada ya no esta activa en el catalogo."
  ),
  activationLineOccupied: () => new DomainError(
    "ACTIVATION_LINE_OCCUPIED",
    "Una linea seleccionada ya pertenece a otra jornada activa."
  ),
  journeyCloseAccessDenied: () => new DomainError(
    "JOURNEY_CLOSE_ACCESS_DENIED",
    "La cuenta no puede cerrar esta jornada."
  ),
  journeyCloseStaleVersion: () => new DomainError(
    "JOURNEY_CLOSE_STALE_VERSION",
    "La jornada cambio. Actualiza el resumen antes de cerrar."
  ),
  journeyClosePendingLines: () => new DomainError(
    "JOURNEY_CLOSE_PENDING_LINES",
    "Todas las lineas deben estar APROBADA antes de cerrar la jornada."
  ),
  journeyCloseActiveReservations: () => new DomainError(
    "JOURNEY_CLOSE_ACTIVE_RESERVATIONS",
    "La jornada conserva al menos una reserva activa."
  ),
  journeyClosePendingCorrections: () => new DomainError(
    "JOURNEY_CLOSE_PENDING_CORRECTIONS",
    "La jornada conserva correcciones o reasignaciones pendientes."
  ),
  journeyCloseLimitExceeded: () => new DomainError(
    "JOURNEY_CLOSE_LIMIT_EXCEEDED",
    "La jornada supera el maximo tecnico combinado de 200 lineas y autorizaciones para un cierre atomico."
  ),
  journeyCloseOccupationMismatch: () => new DomainError(
    "JOURNEY_CLOSE_OCCUPATION_MISMATCH",
    "Una linea no conserva el bloqueo activo de esta jornada."
  ),
  draftCancellationReasonRequired: () => new DomainError(
    "DRAFT_CANCELLATION_REASON_REQUIRED",
    "La cancelacion del borrador exige un motivo."
  ),
  draftCancellationStaleVersion: () => new DomainError(
    "DRAFT_CANCELLATION_STALE_VERSION",
    "El borrador cambio. Actualiza el resumen antes de cancelar."
  ),
  draftCancellationInvalidState: () => new DomainError(
    "DRAFT_CANCELLATION_INVALID_STATE",
    "Solo una jornada en BORRADOR puede cancelarse."
  ),
  draftCancellationOperationalDataExists: () => new DomainError(
    "DRAFT_CANCELLATION_OPERATIONAL_DATA_EXISTS",
    "El borrador conserva datos operativos y no puede cancelarse."
  ),
  draftReopenStaleVersion: () => new DomainError(
    "DRAFT_REOPEN_STALE_VERSION",
    "La jornada cancelada cambio. Actualiza el resumen antes de reabrir."
  ),
  draftReopenInvalidState: () => new DomainError(
    "DRAFT_REOPEN_INVALID_STATE",
    "Solo un borrador cancelado puede reabrirse."
  ),
  draftReopenNotAllowed: () => new DomainError(
    "DRAFT_REOPEN_NOT_ALLOWED",
    "Una jornada activada o cerrada normalmente no puede reabrirse como borrador."
  ),
  userProfileStaleVersion: () => new DomainError(
    "USER_PROFILE_STALE_VERSION",
    "El perfil cambio. Actualiza la lista antes de continuar."
  ),
  selfDeactivationForbidden: () => new DomainError(
    "SELF_DEACTIVATION_FORBIDDEN",
    "Un administrador no puede desactivar su propia cuenta."
  ),
  selfAdminRoleRemovalForbidden: () => new DomainError(
    "SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN",
    "Un administrador no puede retirar su propio rol administrador."
  ),
  lastActiveAdminRequired: () => new DomainError(
    "LAST_ACTIVE_ADMIN_REQUIRED",
    "Debe permanecer al menos un administrador activo."
  ),
  userRoleChangeBlockedActiveWork: () => new DomainError(
    "USER_ROLE_CHANGE_BLOCKED_ACTIVE_WORK",
    "El rol no puede cambiar mientras existan jornadas, reservas o correcciones activas."
  ),
  userProfileNoChange: () => new DomainError(
    "USER_PROFILE_NO_CHANGE",
    "Selecciona un estado o rol diferente del actual."
  ),
  catalogLocationNotFound: () => new DomainError(
    "CATALOG_LOCATION_NOT_FOUND",
    "La ubicación del catálogo no existe."
  ),
  catalogLocationInactive: () => new DomainError(
    "CATALOG_LOCATION_INACTIVE",
    "La ubicación o alguno de sus padres está inactivo."
  ),
  catalogLineNotFound: () => new DomainError("CATALOG_LINE_NOT_FOUND", "La línea del catálogo no existe."),
  catalogStaleVersion: () => new DomainError(
    "CATALOG_STALE_VERSION",
    "El catálogo cambió. Actualiza la información antes de continuar."
  ),
  catalogDuplicateCode: () => new DomainError(
    "CATALOG_DUPLICATE_CODE",
    "Ya existe un código equivalente en el mismo nivel del catálogo."
  ),
  catalogParentCycle: () => new DomainError(
    "CATALOG_PARENT_CYCLE",
    "La cadena de ubicaciones contiene una referencia propia o un ciclo."
  ),
  catalogLocationHasActiveChildren: () => new DomainError(
    "CATALOG_LOCATION_HAS_ACTIVE_CHILDREN",
    "Desactiva primero las ubicaciones hijas activas."
  ),
  catalogLocationHasActiveLines: () => new DomainError(
    "CATALOG_LOCATION_HAS_ACTIVE_LINES",
    "Desactiva primero las líneas activas de esta ubicación."
  ),
  catalogLineOccupied: () => new DomainError(
    "CATALOG_LINE_OCCUPIED",
    "La línea pertenece a una jornada activa y no puede modificarse."
  ),
  catalogNoChange: () => new DomainError("CATALOG_NO_CHANGE", "No hay cambios para guardar."),
  unauthenticated: () => new DomainError("UNAUTHENTICATED", "Debes iniciar sesión."),
  invalidArgument: () => new DomainError("INVALID_ARGUMENT", "La solicitud no tiene un formato válido."),
  userNotFound: () => new DomainError("USER_NOT_FOUND", "La cuenta no tiene un perfil operativo."),
  userInactive: () => new DomainError("USER_INACTIVE", "La cuenta está inactiva."),
  permissionDenied: () => new DomainError("PERMISSION_DENIED", "La cuenta no puede ejecutar esta operación."),
  journeyNotFound: () => new DomainError("JOURNEY_NOT_FOUND", "La jornada no existe."),
  journeyNotActive: () => new DomainError("JOURNEY_NOT_ACTIVE", "La jornada no está activa."),
  journeyAccessDenied: () => new DomainError("JOURNEY_ACCESS_DENIED", "La cuenta no está autorizada para esta jornada."),
  journeyLineNotFound: () => new DomainError("JOURNEY_LINE_NOT_FOUND", "La línea de jornada no existe."),
  lineNotAvailable: () => new DomainError("LINE_NOT_AVAILABLE", "Esta línea acaba de ser tomada por otro usuario."),
  reservationNotFound: () => new DomainError("RESERVATION_NOT_FOUND", "La reserva no existe."),
  reservationNotActive: () => new DomainError("RESERVATION_NOT_ACTIVE", "La reserva ya no está activa."),
  reservationReleased: () => new DomainError(
    "RESERVATION_RELEASED",
    "La reserva fue liberada por supervisión. Conserva el borrador y consulta con el supervisor."
  ),
  reservationReleaseNotAllowed: () => new DomainError(
    "RESERVATION_RELEASE_NOT_ALLOWED",
    "La cuenta no puede liberar reservas en esta jornada."
  ),
  reservationReleaseReasonRequired: () => new DomainError(
    "RESERVATION_RELEASE_REASON_REQUIRED",
    "La liberación manual exige un motivo."
  ),
  reservationAlreadyCounted: () => new DomainError(
    "RESERVATION_ALREADY_COUNTED",
    "La reserva ya tiene un conteo asociado y no puede liberarse."
  ),
  reservationAccessDenied: () => new DomainError("RESERVATION_ACCESS_DENIED", "La reserva pertenece a otra cuenta."),
  deviceMismatch: () => new DomainError("DEVICE_MISMATCH", "La reserva pertenece a otro dispositivo."),
  invalidReservationToken: () => new DomainError("INVALID_RESERVATION_TOKEN", "La reserva no puede validarse."),
  lineReservationMismatch: () => new DomainError("LINE_RESERVATION_MISMATCH", "La línea ya no conserva esta reserva activa."),
  lineNotInCount: () => new DomainError("LINE_NOT_IN_COUNT", "La línea ya no está en conteo."),
  countNotFound: () => new DomainError("COUNT_NOT_FOUND", "El conteo no existe."),
  countNotReturned: () => new DomainError("COUNT_NOT_RETURNED", "El conteo ya no está devuelto para corrección."),
  countAuthorMismatch: () => new DomainError("COUNT_AUTHOR_MISMATCH", "Solo el autor puede corregir este conteo."),
  correctionResponsibleMismatch: () => new DomainError(
    "CORRECTION_RESPONSIBLE_MISMATCH",
    "Solo la persona responsable actual puede iniciar esta corrección."
  ),
  correctionReassignmentNotAllowed: () => new DomainError(
    "CORRECTION_REASSIGNMENT_NOT_ALLOWED",
    "La cuenta no puede reasignar correcciones en esta jornada."
  ),
  correctionAssigneeInactive: () => new DomainError(
    "CORRECTION_ASSIGNEE_INACTIVE",
    "La cuenta seleccionada no está activa."
  ),
  correctionAssigneeUnauthorized: () => new DomainError(
    "CORRECTION_ASSIGNEE_UNAUTHORIZED",
    "La cuenta seleccionada no está autorizada para contar en esta jornada."
  ),
  correctionReassignmentReasonRequired: () => new DomainError(
    "CORRECTION_REASSIGNMENT_REASON_REQUIRED",
    "La reasignación exige un motivo."
  ),
  correctionReassignmentNoChange: () => new DomainError(
    "CORRECTION_REASSIGNMENT_NO_CHANGE",
    "Selecciona una persona diferente de la responsable actual."
  ),
  countNotPendingReview: () => new DomainError("COUNT_NOT_PENDING_REVIEW", "El conteo ya no está pendiente de revisión."),
  countLineMismatch: () => new DomainError("COUNT_LINE_MISMATCH", "El conteo vigente no coincide con la línea."),
  reviewNotAllowed: () => new DomainError("REVIEW_NOT_ALLOWED", "La cuenta no puede revisar conteos en esta jornada."),
  selfApprovalForbidden: () => new DomainError("SELF_APPROVAL_FORBIDDEN", "Un supervisor no puede aprobar su propio conteo."),
  exceptionReasonRequired: () => new DomainError("EXCEPTION_REASON_REQUIRED", "La autorrevisión administrativa exige un motivo."),
  returnReasonRequired: () => new DomainError("RETURN_REASON_REQUIRED", "La devolución exige un motivo."),
  inventoryNotFound: () => new DomainError("INVENTORY_NOT_FOUND", "La línea no tiene un inventario oficial inicial."),
  activeReservationExists: () => new DomainError("ACTIVE_RESERVATION_EXISTS", "La cuenta ya tiene otra reserva activa."),
  idempotencyConflict: () => new DomainError("IDEMPOTENCY_CONFLICT", "La clave de reintento ya se utilizó con otra solicitud."),
  emulatorOnly: () => new DomainError("EMULATOR_ONLY", "La operación solo está disponible en el entorno local de prueba."),
  internal: () => new DomainError("INTERNAL_ERROR", "No fue posible completar la operación.")
} as const;
