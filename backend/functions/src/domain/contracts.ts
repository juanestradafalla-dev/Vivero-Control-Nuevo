export type UserRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";

export type CentralLineState =
  | "DISPONIBLE"
  | "EN_CONTEO"
  | "PENDIENTE_REVISION"
  | "DEVUELTA"
  | "APROBADA";

export type ControlledErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_ARGUMENT"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "PERMISSION_DENIED"
  | "JOURNEY_NOT_FOUND"
  | "JOURNEY_NOT_ACTIVE"
  | "JOURNEY_ACCESS_DENIED"
  | "JOURNEY_LINE_NOT_FOUND"
  | "LINE_NOT_AVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "EMULATOR_ONLY"
  | "INTERNAL_ERROR";

export interface ReserveLineRequest {
  readonly jornadaLineaId: string;
  readonly dispositivoId: string;
  readonly claveIdempotencia: string;
}

export interface VisibleLocation {
  readonly vivero: string;
  readonly modulo: string;
  readonly cama: string;
  readonly linea: string;
  readonly nombreVisible: string;
  readonly orden: number;
}

export interface ReserveLineResult {
  readonly reservaId: string;
  readonly jornadaLineaId: string;
  readonly estadoCentral: "EN_CONTEO";
  readonly tokenReserva: string;
  readonly reservadaEn: string;
  readonly version: number;
  readonly ubicacion: VisibleLocation;
}

/** Contexto construido exclusivamente desde Authentication y fuentes centrales. */
export interface TrustedOperationContext {
  readonly actorId: string;
}

export interface SubmitCountRequest {
  readonly jornadaLineaId: string;
  readonly reservaId: string;
  readonly dispositivoId: string;
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly observaciones?: string;
  readonly claveIdempotencia: string;
}

export interface ReleaseLineRequest {
  readonly jornadaLineaId: string;
  readonly reservaId: string;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface ReturnCountRequest {
  readonly conteoId: string;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface ApproveCountRequest {
  readonly conteoId: string;
  readonly motivo?: string;
  readonly claveIdempotencia: string;
}

export interface OperationResult {
  readonly accepted: boolean;
  readonly operationId: string;
}
