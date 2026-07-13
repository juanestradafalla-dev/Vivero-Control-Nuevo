export interface OperationContext {
  readonly actorId: string;
  readonly requestId: string;
  readonly occurredAtIso: string;
}

export interface LineOperationRequest {
  readonly lineId: string;
  readonly journeyId: string;
  readonly context: OperationContext;
}

export interface CountOperationRequest extends LineOperationRequest {
  readonly quantity: number;
  readonly observation?: string;
}

export interface ReviewOperationRequest extends LineOperationRequest {
  readonly reason?: string;
}

export interface OperationResult {
  readonly accepted: boolean;
  readonly operationId: string;
}
