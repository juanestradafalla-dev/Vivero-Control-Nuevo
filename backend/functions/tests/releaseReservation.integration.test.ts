import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  InitiateCountCorrectionRequest,
  InitiateCountCorrectionResult,
  ReassignCountCorrectionRequest,
  ReassignCountCorrectionResult,
  ReleaseReservationRequest,
  ReleaseReservationResult,
  ReserveLineRequest,
  ReserveLineResult,
  ReturnCountRequest,
  SendCountRequest,
  SendCountResult
} from "../src/domain/contracts.js";
import {DEMO_PASSWORD, journeyLineId} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const deviceId = "DISPOSITIVO-LIBERACION-001";
const clientApps: FirebaseApp[] = [];

interface Client {
  readonly auth: Auth;
  readonly functions: Functions;
}

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `demo-release-${name}`,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId
  }, `${name}-${crypto.randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {auth, functions};
}

async function authenticatedClient(email: string, name: string): Promise<Client> {
  const client = createClient(name);
  await signInWithEmailAndPassword(client.auth, email, DEMO_PASSWORD);
  return client;
}

async function reserve(client: Client, lineNumber: number): Promise<ReserveLineResult> {
  const callable = httpsCallable<ReserveLineRequest, ReserveLineResult>(client.functions, "reservarLinea");
  return (await callable({
    jornadaLineaId: journeyLineId(lineNumber),
    dispositivoId: deviceId,
    claveIdempotencia: `reservar-liberacion-${crypto.randomUUID()}`
  })).data;
}

async function send(
  client: Client,
  reservation: Pick<ReserveLineResult | InitiateCountCorrectionResult, "reservaId" | "tokenReserva">,
  key = `enviar-liberacion-${crypto.randomUUID()}`
): Promise<SendCountResult> {
  const callable = httpsCallable<SendCountRequest, SendCountResult>(client.functions, "enviarConteo");
  return (await callable({
    reservaId: reservation.reservaId,
    tokenReserva: reservation.tokenReserva,
    dispositivoId: deviceId,
    hembras: 500,
    machos: 300,
    patrones: 200,
    observaciones: "Conteo ficticio para probar liberación.",
    timestampDispositivo: "2026-07-15T10:00:00.000-05:00",
    claveIdempotencia: key
  })).data;
}

async function release(
  actor: Client,
  reservationId: string,
  key = `liberar-reserva-${crypto.randomUUID()}`,
  reason = "El titular informó que no puede continuar."
): Promise<ReleaseReservationResult> {
  const callable = httpsCallable<ReleaseReservationRequest, ReleaseReservationResult>(
    actor.functions,
    "liberarReservaLinea"
  );
  return (await callable({reservaId: reservationId, motivo: reason, claveIdempotencia: key})).data;
}

async function returnCount(reviewer: Client, countId: string): Promise<void> {
  const callable = httpsCallable<ReturnCountRequest, unknown>(reviewer.functions, "devolverConteo");
  await callable({
    conteoId: countId,
    motivo: "Debe repetirse el conteo completo.",
    claveIdempotencia: `devolver-liberacion-${crypto.randomUUID()}`
  });
}

async function reassign(
  reviewer: Client,
  countId: string,
  targetUserId = "uid-auxiliar-2"
): Promise<ReassignCountCorrectionResult> {
  const callable = httpsCallable<ReassignCountCorrectionRequest, ReassignCountCorrectionResult>(
    reviewer.functions,
    "reasignarCorreccionConteo"
  );
  return (await callable({
    conteoId: countId,
    nuevoUsuarioId: targetUserId,
    motivo: "El autor original no está disponible.",
    claveIdempotencia: `reasignar-liberacion-${crypto.randomUUID()}`
  })).data;
}

async function initiateCorrection(client: Client, countId: string): Promise<InitiateCountCorrectionResult> {
  const callable = httpsCallable<InitiateCountCorrectionRequest, InitiateCountCorrectionResult>(
    client.functions,
    "iniciarCorreccionConteo"
  );
  return (await callable({
    conteoId: countId,
    dispositivoId: deviceId,
    claveIdempotencia: `iniciar-liberacion-${crypto.randomUUID()}`
  })).data;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const details = (error as {details?: unknown}).details;
  return typeof details === "object" && details !== null ? (details as {code?: string}).code : undefined;
}

async function expectRejectCode(promise: Promise<unknown>, expectedCode: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Se esperaba el error ${expectedCode}`);
  } catch (error) {
    expect(errorCode(error)).toBe(expectedCode);
  }
}

function adminDatabase() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getAdminApps().find((candidate) => candidate.name === "release-reservation-tests") ??
    initializeAdminApp({projectId}, "release-reservation-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("liberación manual supervisada mediante emuladores reales", () => {
  it("permite a supervisor y administrador liberar reservas normales y vuelve a DISPONIBLE", async () => {
    const owner = await authenticatedClient("auxiliar1@prueba.local", "owner-normal");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor-normal");
    const reservation = await reserve(owner, 1);
    const first = await release(supervisor, reservation.reservaId);
    expect(first).toMatchObject({
      reservaId: reservation.reservaId,
      tipoReserva: "INICIAL",
      estadoReserva: "LIBERADA",
      estadoCentral: "DISPONIBLE",
      versionLinea: 2
    });

    await seedEmulator();
    const secondOwner = await authenticatedClient("auxiliar1@prueba.local", "owner-admin");
    const administrator = await authenticatedClient("administrador@prueba.local", "administrator");
    const secondReservation = await reserve(secondOwner, 2);
    expect((await release(administrator, secondReservation.reservaId)).estadoCentral).toBe("DISPONIBLE");
  });

  it("rechaza auxiliar, motivo vacío, reserva inexistente, consumida o no coincidente", async () => {
    const owner = await authenticatedClient("auxiliar1@prueba.local", "owner-rejections");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor-rejections");
    const reservation = await reserve(owner, 1);
    await expectRejectCode(release(owner, reservation.reservaId), "RESERVATION_RELEASE_NOT_ALLOWED");
    await expectRejectCode(release(supervisor, reservation.reservaId, undefined, "  "),
      "RESERVATION_RELEASE_REASON_REQUIRED");
    await expectRejectCode(release(supervisor, "reserva-inexistente-001"), "RESERVATION_NOT_FOUND");

    await send(owner, reservation);
    await expectRejectCode(release(supervisor, reservation.reservaId), "RESERVATION_NOT_ACTIVE");

    await seedEmulator();
    const mismatchOwner = await authenticatedClient("auxiliar1@prueba.local", "owner-mismatch");
    const mismatchReservation = await reserve(mismatchOwner, 1);
    await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).update({
      reservaActivaId: "otra-reserva-activa"
    });
    await expectRejectCode(release(supervisor, mismatchReservation.reservaId), "LINE_RESERVATION_MISMATCH");

    await seedEmulator();
    const countedOwner = await authenticatedClient("auxiliar1@prueba.local", "owner-counted");
    const countedReservation = await reserve(countedOwner, 1);
    await adminDatabase().collection("reservas").doc(countedReservation.reservaId).update({
      conteoId: "conteo-aceptado-inconsistente"
    });
    await expectRejectCode(release(supervisor, countedReservation.reservaId), "RESERVATION_ALREADY_COUNTED");
  });

  it("libera una corrección hacia DEVUELTA y conserva responsable y reasignación", async () => {
    const author = await authenticatedClient("auxiliar1@prueba.local", "correction-author");
    const assigned = await authenticatedClient("administrador@prueba.local", "correction-assigned");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "correction-supervisor");
    const count = await send(author, await reserve(author, 1));
    await returnCount(supervisor, count.conteoId);
    const reassignment = await reassign(supervisor, count.conteoId, "uid-administrador");
    const correctionReservation = await initiateCorrection(assigned, count.conteoId);

    const released = await release(supervisor, correctionReservation.reservaId);
    const line = (await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).get()).data();
    expect(released).toMatchObject({tipoReserva: "CORRECCION", estadoCentral: "DEVUELTA"});
    expect(line).toMatchObject({
      estadoCentral: "DEVUELTA",
      reservaActivaId: null,
      responsableCorreccionUsuarioId: "uid-administrador",
      reasignacionActivaId: reassignment.reasignacionId
    });
  });

  it("recupera el resultado idempotente y rechaza el mismo identificador con otro payload", async () => {
    const owner = await authenticatedClient("auxiliar1@prueba.local", "owner-idempotent");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor-idempotent");
    const reservation = await reserve(owner, 1);
    const key = "liberacion-idempotente-etapa-08-0001";
    const first = await release(supervisor, reservation.reservaId, key);
    const recovered = await release(supervisor, reservation.reservaId, key);
    expect(recovered).toEqual(first);
    await expectRejectCode(
      release(supervisor, reservation.reservaId, key, "Un motivo lógico diferente."),
      "IDEMPOTENCY_CONFLICT"
    );
    expect((await adminDatabase().collection("liberacionesReserva").get()).size).toBe(1);
    expect((await adminDatabase().collection("auditoria").where("tipo", "==", "RESERVA_LINEA_LIBERADA").get()).size).toBe(1);
  });

  it("dos liberaciones concurrentes producen un solo efecto", async () => {
    const owner = await authenticatedClient("auxiliar1@prueba.local", "owner-concurrent");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor-concurrent");
    const reservation = await reserve(owner, 1);
    const attempts = await Promise.allSettled([
      release(supervisor, reservation.reservaId, "liberacion-concurrente-etapa-08-0001"),
      release(supervisor, reservation.reservaId, "liberacion-concurrente-etapa-08-0002")
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(errorCode((attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult).reason))
      .toBe("RESERVATION_NOT_ACTIVE");
    expect((await adminDatabase().collection("liberacionesReserva").get()).size).toBe(1);
  });

  it("liberar y enviar simultáneamente tienen un solo ganador y no alteran inventario", async () => {
    const owner = await authenticatedClient("auxiliar1@prueba.local", "owner-race");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor-race");
    const reservation = await reserve(owner, 1);
    const database = adminDatabase();
    const inventoryBefore = (await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data();
    const attempts = await Promise.allSettled([
      release(supervisor, reservation.reservaId, "liberar-contra-enviar-etapa-08-0001"),
      send(owner, reservation, "enviar-contra-liberar-etapa-08-0001")
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(["RESERVATION_NOT_ACTIVE", "RESERVATION_RELEASED"])
      .toContain(errorCode((attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult).reason));
    expect((await database.collection("conteos").where("reservaId", "==", reservation.reservaId).get()).size)
      .toBeLessThanOrEqual(1);
    expect((await database.collection("liberacionesReserva").where("reservaId", "==", reservation.reservaId).get()).size)
      .toBeLessThanOrEqual(1);
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toEqual(inventoryBefore);
    expect((await database.collection("movimientosInventario").get()).empty).toBe(true);
  });
});
