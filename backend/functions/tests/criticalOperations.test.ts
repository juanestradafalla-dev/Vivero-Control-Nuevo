import { describe, expect, it } from "vitest";

import {UnavailableCriticalOperations} from "../src/domain/criticalOperations.js";
import type {OperationUnavailableError} from "../src/domain/criticalOperations.js";
import type {
  CountOperationRequest,
  LineOperationRequest,
  ReviewOperationRequest
} from "../src/domain/contracts.js";

const context = {
  actorId: "usuario-prueba",
  requestId: "solicitud-prueba",
  occurredAtIso: "2026-07-13T12:00:00.000Z"
};
const lineRequest: LineOperationRequest = {
  lineId: "linea-prueba",
  journeyId: "jornada-prueba",
  context
};
const countRequest: CountOperationRequest = {...lineRequest, quantity: 10};
const reviewRequest: ReviewOperationRequest = {...lineRequest, reason: "Prueba"};

describe("UnavailableCriticalOperations", () => {
  it("mantiene cerradas todas las operaciones críticas durante la ETAPA 2", async () => {
    const operations = new UnavailableCriticalOperations();
    const attempts = [
      operations.reservarLinea(lineRequest),
      operations.enviarConteo(countRequest),
      operations.liberarLinea(lineRequest),
      operations.devolverConteo(reviewRequest),
      operations.aprobarConteo(reviewRequest)
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({
        code: "ETAPA_2_NOT_AVAILABLE"
      } satisfies Partial<OperationUnavailableError>);
    }
  });
});
