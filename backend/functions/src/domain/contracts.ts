export type UserRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";

export type CriticalPermission =
  | "RESERVAR_LINEA"
  | "ENVIAR_CONTEO"
  | "LIBERAR_LINEA"
  | "DEVOLVER_CONTEO"
  | "APROBAR_CONTEO";

/**
 * Contexto interno construido después de autenticar y autorizar centralmente.
 * Ninguno de estos valores se acepta desde el cuerpo de una solicitud cliente.
 */
export interface TrustedOperationContext {
  readonly actorId: string;
  readonly roles: readonly UserRole[];
  readonly serverTimestamp: Date;
  readonly permissions: readonly CriticalPermission[];
  readonly verifiedScopeIds: readonly string[];
}

export interface ReserveLineRequest {
  readonly jornadaLineaId: string;
  readonly dispositivoId: string;
  readonly claveIdempotencia: string;
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
