import {describe, expect, it} from "vitest";

import type {DomainError} from "../src/domain/errors.js";
import {parseReserveLineRequest} from "../src/domain/validation.js";

const validRequest = {
  jornadaLineaId: "JORNADA-PRUEBA-ETAPA-3__LINEA-PRUEBA-1",
  dispositivoId: "DISPOSITIVO-PRUEBA-001",
  claveIdempotencia: "clave-prueba-0001"
};

describe("parseReserveLineRequest", () => {
  it("acepta exclusivamente el DTO aprobado", () => {
    expect(parseReserveLineRequest(validRequest)).toEqual(validRequest);
  });

  it.each(["actorId", "usuarioId", "rol", "permisos", "horaServidor", "estadoCentral"])(
    "rechaza el campo cliente no confiable %s",
    (field) => {
      expect(() => parseReserveLineRequest({...validRequest, [field]: "inventado"})).toThrowError(
        expect.objectContaining<Partial<DomainError>>({code: "INVALID_ARGUMENT"})
      );
    }
  );

  it("rechaza IDs con separadores de ruta", () => {
    expect(() => parseReserveLineRequest({...validRequest, jornadaLineaId: "../otra/ruta"})).toThrowError(
      expect.objectContaining<Partial<DomainError>>({code: "INVALID_ARGUMENT"})
    );
  });
});
