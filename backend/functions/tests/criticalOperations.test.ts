import {describe, expect, it} from "vitest";

import {UnavailableCriticalOperations} from "../src/domain/criticalOperations.js";
import type {OperationUnavailableError} from "../src/domain/criticalOperations.js";
import type {
  ApproveCountRequest,
  ReleaseLineRequest,
  ReserveLineRequest,
  ReturnCountRequest,
  SubmitCountRequest,
  TrustedOperationContext
} from "../src/domain/contracts.js";

const trustedContext: TrustedOperationContext = {
  actorId: "usuario-autenticado-prueba"
};

const reserveRequest: ReserveLineRequest = {
  jornadaLineaId: "jornada-linea-prueba",
  dispositivoId: "dispositivo-prueba",
  claveIdempotencia: "reserva-prueba-0001"
};
const submitRequest: SubmitCountRequest = {
  jornadaLineaId: "jornada-linea-prueba",
  reservaId: "reserva-prueba",
  dispositivoId: "dispositivo-prueba",
  hembras: 7,
  machos: 2,
  patrones: 1,
  observaciones: "Datos ficticios",
  claveIdempotencia: "conteo-prueba-0001"
};
const releaseRequest: ReleaseLineRequest = {
  jornadaLineaId: "jornada-linea-prueba",
  reservaId: "reserva-prueba",
  motivo: "Liberación de prueba",
  claveIdempotencia: "liberacion-prueba-0001"
};
const returnRequest: ReturnCountRequest = {
  conteoId: "conteo-prueba",
  motivo: "Devolución de prueba",
  claveIdempotencia: "devolucion-prueba-0001"
};
const approveRequest: ApproveCountRequest = {
  conteoId: "conteo-prueba",
  claveIdempotencia: "aprobacion-prueba-0001"
};

describe("UnavailableCriticalOperations", () => {
  it("mantiene cerrados los marcadores no conectados al servicio transaccional", async () => {
    const operations = new UnavailableCriticalOperations();
    const attempts = [
      operations.reservarLinea(reserveRequest, trustedContext),
      operations.enviarConteo(submitRequest, trustedContext),
      operations.liberarLinea(releaseRequest, trustedContext),
      operations.devolverConteo(returnRequest, trustedContext),
      operations.aprobarConteo(approveRequest, trustedContext)
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({
        code: "ETAPA_2_NOT_AVAILABLE"
      } satisfies Partial<OperationUnavailableError>);
    }
  });

  it("mantiene identidad, roles y tiempo fuera de los DTO del cliente", () => {
    expect(reserveRequest).not.toHaveProperty("actorId");
    expect(submitRequest).not.toHaveProperty("rolEfectivo");
    expect(submitRequest).not.toHaveProperty("roles");
    expect(submitRequest).not.toHaveProperty("permissions");
    expect(submitRequest).not.toHaveProperty("serverTimestamp");
    expect(submitRequest).not.toHaveProperty("occurredAtIso");
    expect(submitRequest).not.toHaveProperty("total");
  });
});
