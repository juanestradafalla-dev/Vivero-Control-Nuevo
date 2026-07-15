import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  InitiateCountCorrectionRequest,
  InitiateCountCorrectionResult,
  ReserveLineRequest,
  ReserveLineResult,
  ReturnCountRequest,
  SendCountRequest,
  SendCountResult
} from "../src/domain/contracts.js";
import {DEMO_PASSWORD, journeyLineId} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const deviceId = "DISPOSITIVO-CORRECCION-001";
const clientApps: FirebaseApp[] = [];

interface Client {
  readonly auth: Auth;
  readonly functions: Functions;
}

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `demo-correction-${name}`,
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
    claveIdempotencia: `reservar-correccion-${crypto.randomUUID()}`
  })).data;
}

async function send(
  client: Client,
  reservation: Pick<ReserveLineResult | InitiateCountCorrectionResult, "reservaId" | "tokenReserva">,
  quantities = {hembras: 450, machos: 320, patrones: 210}
): Promise<SendCountResult> {
  const callable = httpsCallable<SendCountRequest, SendCountResult>(client.functions, "enviarConteo");
  return (await callable({
    reservaId: reservation.reservaId,
    tokenReserva: reservation.tokenReserva,
    dispositivoId: deviceId,
    ...quantities,
    observaciones: "Versión ficticia para corrección.",
    timestampDispositivo: "2026-07-15T08:00:00.000-05:00",
    claveIdempotencia: `enviar-correccion-${crypto.randomUUID()}`
  })).data;
}

async function returnCount(supervisor: Client, countId: string): Promise<void> {
  const callable = httpsCallable<ReturnCountRequest, unknown>(supervisor.functions, "devolverConteo");
  await callable({
    conteoId: countId,
    motivo: "Recontar la línea completa.",
    claveIdempotencia: `devolver-correccion-${crypto.randomUUID()}`
  });
}

async function initiate(
  client: Client,
  countId: string,
  key = `iniciar-correccion-${crypto.randomUUID()}`
): Promise<InitiateCountCorrectionResult> {
  const callable = httpsCallable<InitiateCountCorrectionRequest, InitiateCountCorrectionResult>(
    client.functions,
    "iniciarCorreccionConteo"
  );
  return (await callable({conteoId: countId, dispositivoId: deviceId, claveIdempotencia: key})).data;
}

async function returnedCount(lineNumber = 1): Promise<{
  readonly author: Client;
  readonly supervisor: Client;
  readonly count: SendCountResult;
}> {
  const author = await authenticatedClient("auxiliar1@prueba.local", `author-${lineNumber}`);
  const supervisor = await authenticatedClient("supervisor@prueba.local", `reviewer-${lineNumber}`);
  const count = await send(author, await reserve(author, lineNumber));
  await returnCount(supervisor, count.conteoId);
  return {author, supervisor, count};
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const details = (error as {details?: unknown}).details;
  if (typeof details !== "object" || details === null) return undefined;
  return (details as {code?: string}).code;
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
  const app = getAdminApps().find((candidate) => candidate.name === "correct-count-tests") ??
    initializeAdminApp({projectId}, "correct-count-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("corrección versionada mediante emuladores reales", () => {
  it("permite al autor iniciar una corrección y persiste solo el hash del token", async () => {
    const {author, count} = await returnedCount();
    const result = await initiate(author, count.conteoId, "correccion-valida-etapa-06-0001");
    const database = adminDatabase();
    const reservation = await database.collection("reservas").doc(result.reservaId).get();
    const line = await database.collection("jornadaLineas").doc(journeyLineId(1)).get();

    expect(result).toMatchObject({
      conteoAnteriorId: count.conteoId,
      tipoReserva: "CORRECCION",
      estadoCentral: "EN_CONTEO",
      version: 4,
      versionConteoSiguiente: 2
    });
    expect(result.tokenReserva).toHaveLength(43);
    expect(reservation.data()).toMatchObject({
      tipoReserva: "CORRECCION",
      conteoAnteriorId: count.conteoId,
      estadoReserva: "ACTIVA"
    });
    expect(reservation.data()).not.toHaveProperty("tokenReserva");
    expect(reservation.data()?.tokenReservaHash).toMatch(/^[a-f0-9]{64}$/);
    expect(line.data()).toMatchObject({estadoCentral: "EN_CONTEO", reservaActivaId: result.reservaId, version: 4});
  });

  it("rechaza otro usuario y una línea que no está DEVUELTA", async () => {
    const {author, count} = await returnedCount();
    const other = await authenticatedClient("auxiliar2@prueba.local", "other-author");
    await expectRejectCode(initiate(other, count.conteoId), "COUNT_AUTHOR_MISMATCH");

    await seedEmulator();
    const pending = await send(author, await reserve(author, 1));
    await expectRejectCode(initiate(author, pending.conteoId), "COUNT_NOT_RETURNED");
  });

  it("reutiliza la misma clave sin crear otra reserva ni otra auditoría", async () => {
    const {author, count} = await returnedCount();
    const key = "reintento-correccion-etapa-06-0001";
    const first = await initiate(author, count.conteoId, key);
    const second = await initiate(author, count.conteoId, key);
    const database = adminDatabase();
    expect(second).toEqual(first);
    expect((await database.collection("reservas").where("conteoAnteriorId", "==", count.conteoId).get()).size).toBe(1);
    expect((await database.collection("auditoria").where("tipo", "==", "CORRECCION_CONTEO_INICIADA").get()).size).toBe(1);
  });

  it("acepta un solo ganador con dos claves concurrentes", async () => {
    const {author, count} = await returnedCount();
    const attempts = await Promise.allSettled([
      initiate(author, count.conteoId, "concurrencia-correccion-clave-0001"),
      initiate(author, count.conteoId, "concurrencia-correccion-clave-0002")
    ]);
    const winners = attempts.filter((attempt) => attempt.status === "fulfilled");
    const losers = attempts.filter((attempt) => attempt.status === "rejected") as PromiseRejectedResult[];
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(["COUNT_NOT_RETURNED", "ACTIVE_RESERVATION_EXISTS"]).toContain(errorCode(losers[0]?.reason));
    expect((await adminDatabase().collection("reservas").where("conteoAnteriorId", "==", count.conteoId).get()).size).toBe(1);
  });

  it("rechaza iniciar corrección si el autor ya conserva otra reserva activa", async () => {
    const {author, count} = await returnedCount();
    await reserve(author, 2);
    await expectRejectCode(initiate(author, count.conteoId), "ACTIVE_RESERVATION_EXISTS");
  });

  it("envía versión 2, conserva versión 1 inmutable y no modifica inventario", async () => {
    const {author, count} = await returnedCount();
    const database = adminDatabase();
    const previousBefore = (await database.collection("conteos").doc(count.conteoId).get()).data();
    const inventoryBefore = (await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data();
    const correction = await initiate(author, count.conteoId);
    const second = await send(author, correction, {hembras: 451, machos: 319, patrones: 210});
    const secondDocument = await database.collection("conteos").doc(second.conteoId).get();
    const line = await database.collection("jornadaLineas").doc(journeyLineId(1)).get();

    expect(second).toMatchObject({estadoCentral: "PENDIENTE_REVISION", versionConteo: 2, versionLinea: 5});
    expect(secondDocument.data()).toMatchObject({versionNumero: 2, conteoAnteriorId: count.conteoId, inmutable: true});
    expect((await database.collection("conteos").doc(count.conteoId).get()).data()).toEqual(previousBefore);
    expect(line.data()).toMatchObject({estadoCentral: "PENDIENTE_REVISION", conteoVigenteId: second.conteoId, version: 5});
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data()).toEqual(inventoryBefore);
    expect((await database.collection("movimientosInventario").get()).empty).toBe(true);
  });
});
