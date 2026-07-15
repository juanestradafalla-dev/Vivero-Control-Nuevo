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
  ReserveLineRequest,
  ReserveLineResult,
  ReturnCountRequest,
  SendCountRequest,
  SendCountResult
} from "../src/domain/contracts.js";
import {DEMO_PASSWORD, journeyLineId} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const deviceId = "DISPOSITIVO-REASIGNACION-001";
const clientApps: FirebaseApp[] = [];

interface Client {
  readonly auth: Auth;
  readonly functions: Functions;
}

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `demo-reassignment-${name}`,
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
    claveIdempotencia: `reservar-reasignacion-${crypto.randomUUID()}`
  })).data;
}

async function send(
  client: Client,
  reservation: Pick<ReserveLineResult | InitiateCountCorrectionResult, "reservaId" | "tokenReserva">,
  quantities = {hembras: 440, machos: 330, patrones: 210}
): Promise<SendCountResult> {
  const callable = httpsCallable<SendCountRequest, SendCountResult>(client.functions, "enviarConteo");
  return (await callable({
    reservaId: reservation.reservaId,
    tokenReserva: reservation.tokenReserva,
    dispositivoId: deviceId,
    ...quantities,
    observaciones: "Conteo ficticio para reasignación.",
    timestampDispositivo: "2026-07-15T09:00:00.000-05:00",
    claveIdempotencia: `enviar-reasignacion-${crypto.randomUUID()}`
  })).data;
}

async function returnCount(reviewer: Client, countId: string): Promise<void> {
  const callable = httpsCallable<ReturnCountRequest, unknown>(reviewer.functions, "devolverConteo");
  await callable({
    conteoId: countId,
    motivo: "El autor no está disponible; debe repetirse el conteo.",
    claveIdempotencia: `devolver-reasignacion-${crypto.randomUUID()}`
  });
}

async function reassign(
  actor: Client,
  countId: string,
  targetUserId = "uid-auxiliar-2",
  key = `reasignar-correccion-${crypto.randomUUID()}`,
  reason = "El autor original no está disponible."
): Promise<ReassignCountCorrectionResult> {
  const callable = httpsCallable<ReassignCountCorrectionRequest, ReassignCountCorrectionResult>(
    actor.functions,
    "reasignarCorreccionConteo"
  );
  return (await callable({conteoId: countId, nuevoUsuarioId: targetUserId, motivo: reason, claveIdempotencia: key})).data;
}

async function initiate(client: Client, countId: string): Promise<InitiateCountCorrectionResult> {
  const callable = httpsCallable<InitiateCountCorrectionRequest, InitiateCountCorrectionResult>(
    client.functions,
    "iniciarCorreccionConteo"
  );
  return (await callable({
    conteoId: countId,
    dispositivoId: deviceId,
    claveIdempotencia: `iniciar-reasignada-${crypto.randomUUID()}`
  })).data;
}

async function returnedCount(lineNumber = 1) {
  const author = await authenticatedClient("auxiliar1@prueba.local", `author-${lineNumber}`);
  const supervisor = await authenticatedClient("supervisor@prueba.local", `supervisor-${lineNumber}`);
  const count = await send(author, await reserve(author, lineNumber));
  await returnCount(supervisor, count.conteoId);
  return {author, supervisor, count};
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
  const app = getAdminApps().find((candidate) => candidate.name === "reassign-correction-tests") ??
    initializeAdminApp({projectId}, "reassign-correction-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("reasignación supervisada mediante emuladores reales", () => {
  it("permite al supervisor reasignar a un usuario activo y autorizado", async () => {
    const {supervisor, count} = await returnedCount(1);
    const first = await reassign(supervisor, count.conteoId);
    expect(first).toMatchObject({
      conteoId: count.conteoId,
      responsableCorreccionUsuarioId: "uid-auxiliar-2",
      versionLinea: 4
    });

  });

  it("permite al administrador reasignar a un usuario activo y autorizado", async () => {
    const secondCase = await returnedCount(2);
    const administrator = await authenticatedClient("administrador@prueba.local", "administrator");
    const second = await reassign(administrator, secondCase.count.conteoId, "uid-supervisor");
    expect(second.responsableCorreccionUsuarioId).toBe("uid-supervisor");
  });

  it("rechaza auxiliar, destino inactivo o sin autorización", async () => {
    const {author, supervisor, count} = await returnedCount();
    await expectRejectCode(reassign(author, count.conteoId), "CORRECTION_REASSIGNMENT_NOT_ALLOWED");
    await expectRejectCode(
      reassign(supervisor, count.conteoId, "uid-inactivo-prueba"),
      "CORRECTION_ASSIGNEE_INACTIVE"
    );
    await expectRejectCode(
      reassign(supervisor, count.conteoId, "uid-sin-acceso-prueba"),
      "CORRECTION_ASSIGNEE_UNAUTHORIZED"
    );
  });

  it("rechaza estado distinto de DEVUELTA, motivo vacío y una selección sin cambio", async () => {
    const author = await authenticatedClient("auxiliar1@prueba.local", "pending-author");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "pending-supervisor");
    const pending = await send(author, await reserve(author, 1));
    await expectRejectCode(reassign(supervisor, pending.conteoId), "COUNT_NOT_RETURNED");

    await seedEmulator();
    const returned = await returnedCount();
    await expectRejectCode(reassign(returned.supervisor, returned.count.conteoId, "uid-auxiliar-2", undefined, "  "),
      "CORRECTION_REASSIGNMENT_REASON_REQUIRED");
    await expectRejectCode(reassign(returned.supervisor, returned.count.conteoId, "uid-auxiliar-1"),
      "CORRECTION_REASSIGNMENT_NO_CHANGE");
  });

  it("recupera la misma respuesta idempotente sin duplicar registro ni auditoría", async () => {
    const {supervisor, count} = await returnedCount();
    const key = "reasignacion-idempotente-etapa-07-0001";
    const first = await reassign(supervisor, count.conteoId, "uid-auxiliar-2", key);
    const second = await reassign(supervisor, count.conteoId, "uid-auxiliar-2", key);
    const database = adminDatabase();
    expect(second).toEqual(first);
    expect((await database.collection("reasignacionesCorreccion").where("conteoId", "==", count.conteoId).get()).size).toBe(1);
    expect((await database.collection("auditoria").where("tipo", "==", "CORRECCION_CONTEO_REASIGNADA").get()).size).toBe(1);
  });

  it("acepta una sola reasignación concurrente hacia la misma persona", async () => {
    const {supervisor, count} = await returnedCount();
    const attempts = await Promise.allSettled([
      reassign(supervisor, count.conteoId, "uid-auxiliar-2", "concurrencia-reasignacion-0001"),
      reassign(supervisor, count.conteoId, "uid-auxiliar-2", "concurrencia-reasignacion-0002")
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const loser = attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult;
    expect(errorCode(loser.reason)).toBe("CORRECTION_REASSIGNMENT_NO_CHANGE");
    expect((await adminDatabase().collection("reasignacionesCorreccion").where("conteoId", "==", count.conteoId).get()).size).toBe(1);
  });

  it("solo el asignado inicia y crea la nueva versión sin alterar originales ni inventario", async () => {
    const {author, supervisor, count} = await returnedCount();
    const target = await authenticatedClient("administrador@prueba.local", "assigned-author");
    const database = adminDatabase();
    const originalBefore = (await database.collection("conteos").doc(count.conteoId).get()).data();
    const inventoryBefore = (await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data();
    await reassign(supervisor, count.conteoId, "uid-administrador");

    await expectRejectCode(initiate(author, count.conteoId), "CORRECTION_RESPONSIBLE_MISMATCH");
    const correction = await initiate(target, count.conteoId);
    const next = await send(target, correction, {hembras: 441, machos: 329, patrones: 210});
    const nextDocument = (await database.collection("conteos").doc(next.conteoId).get()).data();

    expect(next).toMatchObject({versionConteo: 2, estadoCentral: "PENDIENTE_REVISION", versionLinea: 6});
    expect(nextDocument).toMatchObject({
      autorUsuarioId: "uid-administrador",
      conteoAnteriorId: count.conteoId,
      versionNumero: 2,
      inmutable: true
    });
    expect((await database.collection("conteos").doc(count.conteoId).get()).data()).toEqual(originalBefore);
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data()).toEqual(inventoryBefore);
    expect((await database.collection("movimientosInventario").get()).empty).toBe(true);
  });
});
