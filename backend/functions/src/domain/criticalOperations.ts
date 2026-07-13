import type {
  CountOperationRequest,
  LineOperationRequest,
  OperationResult,
  ReviewOperationRequest
} from "./contracts.js";

export interface CriticalOperations {
  reservarLinea(request: LineOperationRequest): Promise<OperationResult>;
  enviarConteo(request: CountOperationRequest): Promise<OperationResult>;
  liberarLinea(request: LineOperationRequest): Promise<OperationResult>;
  devolverConteo(request: ReviewOperationRequest): Promise<OperationResult>;
  aprobarConteo(request: ReviewOperationRequest): Promise<OperationResult>;
}

export class OperationUnavailableError extends Error {
  readonly code = "ETAPA_2_NOT_AVAILABLE";

  constructor(operation: string) {
    super(`La operación ${operation} no está disponible en la ETAPA 2.`);
    this.name = "OperationUnavailableError";
  }
}

export class UnavailableCriticalOperations implements CriticalOperations {
  reservarLinea(_request: LineOperationRequest): Promise<OperationResult> {
    return this.unavailable("reservarLinea");
  }

  enviarConteo(_request: CountOperationRequest): Promise<OperationResult> {
    return this.unavailable("enviarConteo");
  }

  liberarLinea(_request: LineOperationRequest): Promise<OperationResult> {
    return this.unavailable("liberarLinea");
  }

  devolverConteo(_request: ReviewOperationRequest): Promise<OperationResult> {
    return this.unavailable("devolverConteo");
  }

  aprobarConteo(_request: ReviewOperationRequest): Promise<OperationResult> {
    return this.unavailable("aprobarConteo");
  }

  private unavailable(operation: string): Promise<never> {
    return Promise.reject(new OperationUnavailableError(operation));
  }
}
