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
