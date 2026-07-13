import type {
  ApproveCountRequest,
  OperationResult,
  ReleaseLineRequest,
  ReserveLineRequest,
  ReturnCountRequest,
  SubmitCountRequest,
  TrustedOperationContext
} from "./contracts.js";

export interface CriticalOperations {
  reservarLinea(
    request: ReserveLineRequest,
    context: TrustedOperationContext
  ): Promise<OperationResult>;
  enviarConteo(
    request: SubmitCountRequest,
    context: TrustedOperationContext
  ): Promise<OperationResult>;
  liberarLinea(
    request: ReleaseLineRequest,
    context: TrustedOperationContext
  ): Promise<OperationResult>;
  devolverConteo(
    request: ReturnCountRequest,
    context: TrustedOperationContext
  ): Promise<OperationResult>;
  aprobarConteo(
    request: ApproveCountRequest,
    context: TrustedOperationContext
  ): Promise<OperationResult>;
}

export class OperationUnavailableError extends Error {
  readonly code = "ETAPA_2_NOT_AVAILABLE";

  constructor(operation: string) {
    super(`La operación ${operation} no está disponible en la ETAPA 2.`);
    this.name = "OperationUnavailableError";
  }
}

export class UnavailableCriticalOperations implements CriticalOperations {
  reservarLinea(
    _request: ReserveLineRequest,
    _context: TrustedOperationContext
  ): Promise<OperationResult> {
    return this.unavailable("reservarLinea");
  }

  enviarConteo(
    _request: SubmitCountRequest,
    _context: TrustedOperationContext
  ): Promise<OperationResult> {
    return this.unavailable("enviarConteo");
  }

  liberarLinea(
    _request: ReleaseLineRequest,
    _context: TrustedOperationContext
  ): Promise<OperationResult> {
    return this.unavailable("liberarLinea");
  }

  devolverConteo(
    _request: ReturnCountRequest,
    _context: TrustedOperationContext
  ): Promise<OperationResult> {
    return this.unavailable("devolverConteo");
  }

  aprobarConteo(
    _request: ApproveCountRequest,
    _context: TrustedOperationContext
  ): Promise<OperationResult> {
    return this.unavailable("aprobarConteo");
  }

  private unavailable(operation: string): Promise<never> {
    return Promise.reject(new OperationUnavailableError(operation));
  }
}
