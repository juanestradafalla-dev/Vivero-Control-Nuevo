import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ListActiveJourneysResult,
  ReserveLineRequest,
  ReserveLineResult
} from "../src/domain/contracts.js";
import {
  ACTIVE_JOURNEY_ID,
  DEMO_PASSWORD,
  SECOND_ACTIVE_JOURNEY_ID,
  UNAUTHORIZED_ACTIVE_JOURNEY_ID,
  journeyLineId,
  secondJourneyLineId
} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const clientApps: FirebaseApp[] = [];

function createClient(name: string): {auth: Auth; functions: Functions} {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `demo-app-${name}`,
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

async function authenticatedClient(email: string, name: string) {
  const client = createClient(name);
  await signInWithEmailAndPassword(client.auth, email, DEMO_PASSWORD);
  return client;
}

async function list(functions: Functions, payload?: unknown): Promise<ListActiveJourneysResult> {
  const callable = httpsCallable<unknown, ListActiveJourneysResult>(functions, "listarJornadasActivas");
  return (await callable(payload)).data;
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
  const app = getAdminApps().find((candidate) => candidate.name === "journey-list-tests") ??
    initializeAdminApp({projectId}, "journey-list-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("listarJornadasActivas mediante Auth, Functions y Firestore Emulator", () => {
  it("usa la identidad autenticada y rechaza solicitudes con campos", async () => {
    const anonymous = createClient("journeys-anonymous");
    await expectRejectCode(list(anonymous.functions), "UNAUTHENTICATED");

    const client = await authenticatedClient("auxiliar1@prueba.local", "journeys-extra-field");
    await expectRejectCode(list(client.functions, {usuarioId: "uid-auxiliar-2"}), "INVALID_ARGUMENT");
  });

  it("rechaza perfiles inactivos", async () => {
    const client = await authenticatedClient("inactivo@prueba.local", "journeys-inactive-user");
    await expectRejectCode(list(client.functions), "USER_INACTIVE");
  });

  it("devuelve solo jornadas activas autorizadas, ordenadas y sin datos ajenos", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "journeys-authorized");
    const result = await list(client.functions);

    expect(result.jornadas.map((journey) => journey.jornadaId)).toEqual([
      SECOND_ACTIVE_JOURNEY_ID,
      ACTIVE_JOURNEY_ID
    ]);
    expect(result.jornadas).not.toContainEqual(expect.objectContaining({jornadaId: UNAUTHORIZED_ACTIVE_JOURNEY_ID}));
    expect(result.jornadas).not.toContainEqual(expect.objectContaining({jornadaId: "JORNADA-PRUEBA-INACTIVA"}));
    expect(result.jornadas).toEqual([
      {
        jornadaId: SECOND_ACTIVE_JOURNEY_ID,
        nombreVisible: "Jornada ficticia dinámica B",
        estado: "ACTIVA",
        rolEfectivo: "AUXILIAR",
        puedeContar: true,
        cantidadLineas: 2
      },
      {
        jornadaId: ACTIVE_JOURNEY_ID,
        nombreVisible: "Jornada ficticia de la Etapa 3",
        estado: "ACTIVA",
        rolEfectivo: "AUXILIAR",
        puedeContar: true,
        cantidadLineas: 3
      }
    ]);
  });

  it("permite que una cuenta con una sola jornada la reciba como única opción", async () => {
    const client = await authenticatedClient("auxiliar2@prueba.local", "journeys-single");
    const result = await list(client.functions);
    expect(result.jornadas).toHaveLength(1);
    expect(result.jornadas[0]?.jornadaId).toBe(ACTIVE_JOURNEY_ID);
  });

  it("reserva en la jornada seleccionada sin afectar otra jornada ni inventario", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "journeys-reserve-selected");
    const reserve = httpsCallable<ReserveLineRequest, ReserveLineResult>(client.functions, "reservarLinea");
    const beforeInventory = await adminDatabase().collection("inventarioOficialLineas").get();

    await reserve({
      jornadaLineaId: secondJourneyLineId(1),
      dispositivoId: "DISPOSITIVO-JORNADA-DINAMICA",
      claveIdempotencia: `jornada-dinamica-${crypto.randomUUID()}`
    });

    const [selectedLine, otherLine, afterInventory] = await Promise.all([
      adminDatabase().collection("jornadaLineas").doc(secondJourneyLineId(1)).get(),
      adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).get(),
      adminDatabase().collection("inventarioOficialLineas").get()
    ]);
    expect(selectedLine.data()?.estadoCentral).toBe("EN_CONTEO");
    expect(selectedLine.data()?.jornadaId).toBe(SECOND_ACTIVE_JOURNEY_ID);
    expect(otherLine.data()?.estadoCentral).toBe("DISPONIBLE");
    expect(afterInventory.docs.map((document) => document.data())).toEqual(
      beforeInventory.docs.map((document) => document.data())
    );
  });
});
