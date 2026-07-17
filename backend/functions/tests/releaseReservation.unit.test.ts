import type {Firestore} from "firebase-admin/firestore";
import {describe, expect, it, vi} from "vitest";

import {ReleaseReservationService} from "../src/domain/releaseReservation.js";

const request = {
  reservaId: "RESERVA-PRUEBA-RECUPERACION",
  motivo: "Prueba determinista de recuperacion.",
  claveIdempotencia: "liberacion-recuperacion-unitaria-0001"
};

function failingFirestore(error: Error, finalState: string) {
  const get = vi.fn().mockResolvedValue({
    exists: true,
    data: () => ({estadoReserva: finalState})
  });
  const doc = vi.fn().mockReturnValue({get});
  const collection = vi.fn().mockReturnValue({doc});
  const runTransaction = vi.fn().mockRejectedValue(error);
  return {
    firestore: {collection, runTransaction} as unknown as Firestore,
    get
  };
}

describe("ReleaseReservationService recovery", () => {
  it("traduce un fallo transaccional si otra operacion ya consumio la reserva", async () => {
    const originalError = new Error("transaction retries exhausted");
    const {firestore, get} = failingFirestore(originalError, "CONSUMIDA");
    const service = new ReleaseReservationService(firestore);

    await expect(service.execute(request, {actorId: "uid-supervisor"})).rejects.toMatchObject({
      code: "RESERVATION_NOT_ACTIVE"
    });
    expect(get).toHaveBeenCalledOnce();
  });

  it("no oculta el fallo transaccional si la reserva permanece activa", async () => {
    const originalError = new Error("transport unavailable");
    const {firestore, get} = failingFirestore(originalError, "ACTIVA");
    const service = new ReleaseReservationService(firestore);

    await expect(service.execute(request, {actorId: "uid-supervisor"})).rejects.toBe(originalError);
    expect(get).toHaveBeenCalledOnce();
  });
});
