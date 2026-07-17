import {describe, expect, it} from "vitest";

import {
  parseApproveDiscardRequest,
  parseRegisterDiscardRequest,
  parseReturnDiscardRequest
} from "../src/domain/validation.js";

const validRequest = {
  lineaId: "LINEA-PRUEBA-1",
  versionInventarioObservada: 1,
  dispositivoId: "DISPOSITIVO-001",
  hembras: 8,
  machos: 2,
  patrones: 0,
  causas: {
    muertos: 6,
    nematodos: 5,
    cuelloGanso: 0,
    raicesBifurcadas: 0,
    dobleInjertacion: 0
  },
  timestampDispositivo: "2026-07-17T08:00:00.000-05:00",
  claveIdempotencia: "descarte-unitario-0001"
};

function expectCode(operation: () => unknown, code: string): void {
  expect(operation).toThrow(expect.objectContaining({code}));
}

describe("validación de descartes", () => {
  it("acepta múltiples causas cuya suma supera el total único", () => {
    expect(parseRegisterDiscardRequest(validRequest)).toMatchObject({
      hembras: 8,
      machos: 2,
      causas: {muertos: 6, nematodos: 5}
    });
  });

  it("exige plantas y al menos una causa", () => {
    expectCode(() => parseRegisterDiscardRequest({
      ...validRequest, hembras: 0, machos: 0,
      causas: {...validRequest.causas, muertos: 0, nematodos: 0}
    }), "DISCARD_TOTAL_REQUIRED");
    expectCode(() => parseRegisterDiscardRequest({
      ...validRequest,
      causas: {...validRequest.causas, muertos: 0, nematodos: 0}
    }), "DISCARD_CAUSE_REQUIRED");
  });

  it("impide que una causa individual supere el total único", () => {
    expectCode(() => parseRegisterDiscardRequest({
      ...validRequest,
      causas: {...validRequest.causas, muertos: 11}
    }), "DISCARD_CAUSE_EXCEEDS_TOTAL");
  });

  it("rechaza campos desconocidos y valida las decisiones", () => {
    expectCode(() => parseRegisterDiscardRequest({...validRequest, usuarioId: "otro"}), "INVALID_ARGUMENT");
    expect(parseApproveDiscardRequest({
      descarteId: "DESCARTE-001",
      claveIdempotencia: "aprobar-descarte-0001"
    })).toEqual({descarteId: "DESCARTE-001", claveIdempotencia: "aprobar-descarte-0001"});
    expectCode(() => parseReturnDiscardRequest({
      descarteId: "DESCARTE-001",
      motivo: " ",
      claveIdempotencia: "devolver-descarte-0001"
    }), "RETURN_REASON_REQUIRED");
  });
});
