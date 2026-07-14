import {describe, expect, it} from "vitest";

import {DomainError} from "../src/domain/errors.js";
import {parseApproveCountRequest, parseReturnCountRequest} from "../src/domain/validation.js";

function expectDomainCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`Se esperaba ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}

describe("contratos de frontera para revisión", () => {
  it("acepta aprobación mínima y autorrevisión administrativa con motivo", () => {
    expect(parseApproveCountRequest({
      conteoId: "conteo-prueba-001",
      claveIdempotencia: "aprobar-prueba-0001"
    })).toEqual({conteoId: "conteo-prueba-001", claveIdempotencia: "aprobar-prueba-0001"});
    expect(parseApproveCountRequest({
      conteoId: "conteo-prueba-002",
      claveIdempotencia: "aprobar-prueba-0002",
      motivoExcepcion: "  Cuenta maestra única  "
    }).motivoExcepcion).toBe("Cuenta maestra única");
  });

  it("acepta devolución y normaliza su motivo", () => {
    expect(parseReturnCountRequest({
      conteoId: "conteo-prueba-003",
      motivo: "  Repetir conteo  ",
      claveIdempotencia: "devolver-prueba-0001"
    })).toEqual({
      conteoId: "conteo-prueba-003",
      motivo: "Repetir conteo",
      claveIdempotencia: "devolver-prueba-0001"
    });
  });

  it("rechaza identidad, rol, estado o tiempo agregados por el cliente", () => {
    for (const extra of ["usuarioId", "rol", "estadoCentral", "timestampServidor"]) {
      expectDomainCode(() => parseApproveCountRequest({
        conteoId: "conteo-prueba-001",
        claveIdempotencia: "aprobar-prueba-0001",
        [extra]: "no-confiable"
      }), "INVALID_ARGUMENT");
    }
  });

  it("rechaza devolución sin motivo o con motivo defensivamente excesivo", () => {
    expectDomainCode(() => parseReturnCountRequest({
      conteoId: "conteo-prueba-001",
      claveIdempotencia: "devolver-prueba-0001"
    }), "RETURN_REASON_REQUIRED");
    expectDomainCode(() => parseReturnCountRequest({
      conteoId: "conteo-prueba-001",
      motivo: "x".repeat(2001),
      claveIdempotencia: "devolver-prueba-0001"
    }), "RETURN_REASON_REQUIRED");
  });
});
