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
  permissionDenied: () => new DomainError("PERMISSION_DENIED", "La cuenta no puede reservar líneas."),
  journeyNotFound: () => new DomainError("JOURNEY_NOT_FOUND", "La jornada no existe."),
  journeyNotActive: () => new DomainError("JOURNEY_NOT_ACTIVE", "La jornada no está activa."),
  journeyAccessDenied: () => new DomainError("JOURNEY_ACCESS_DENIED", "La cuenta no está autorizada para esta jornada."),
  journeyLineNotFound: () => new DomainError("JOURNEY_LINE_NOT_FOUND", "La línea de jornada no existe."),
  lineNotAvailable: () => new DomainError("LINE_NOT_AVAILABLE", "Esta línea acaba de ser tomada por otro usuario."),
  idempotencyConflict: () => new DomainError("IDEMPOTENCY_CONFLICT", "La clave de reintento ya se utilizó con otra solicitud."),
  emulatorOnly: () => new DomainError("EMULATOR_ONLY", "La operación solo está disponible en el entorno local de prueba."),
  internal: () => new DomainError("INTERNAL_ERROR", "No fue posible completar la operación.")
} as const;
