import {deleteApp, getApps, initializeApp, type FirebaseApp} from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  type Auth
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions
} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {ReserveLineRequest, ReserveLineResult} from "../src/domain/contracts.js";
import {ACTIVE_JOURNEY_ID, DEMO_PASSWORD, journeyLineId} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const clientApps: FirebaseApp[] = [];

function createClient(name: string): {auth: Auth; functions: Functions} {
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      appId: `demo-app-${name}`,
      authDomain: `${projectId}.firebaseapp.com`,
      projectId
    },
    `${name}-${crypto.randomUUID()}`
  );
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

async function reserve(functions: Functions, request: ReserveLineRequest): Promise<ReserveLineResult> {
  const callable = httpsCallable<ReserveLineRequest, ReserveLineResult>(functions, "reservarLinea");
  return (await callable(request)).data;
}

function request(lineNumber = 1, key = `clave-integracion-${crypto.randomUUID()}`): ReserveLineRequest {
  return {
    jornadaLineaId: journeyLineId(lineNumber),
    dispositivoId: "DISPOSITIVO-EMULADOR-001",
    claveIdempotencia: key
  };
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
  const app = getAdminApps().find((candidate) => candidate.name === "integration-tests") ??
    initializeAdminApp({projectId}, "integration-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("reservarLinea mediante Auth, Functions y Firestore Emulator", () => {
  it("rechaza usuario no autenticado", async () => {
    const client = createClient("no-auth");
    await expectRejectCode(reserve(client.functions, request()), "UNAUTHENTICATED");
  });

  it("rechaza cuenta autenticada sin perfil central", async () => {
    const client = await authenticatedClient("sin-perfil@prueba.local", "sin-perfil");
    await expectRejectCode(reserve(client.functions, request()), "USER_NOT_FOUND");
  });

  it("rechaza usuario inactivo", async () => {
    const client = await authenticatedClient("inactivo@prueba.local", "inactivo");
    await expectRejectCode(reserve(client.functions, request()), "USER_INACTIVE");
  });

  it("rechaza usuario sin autorización de jornada", async () => {
    const client = await authenticatedClient("sin-acceso@prueba.local", "sin-acceso");
    await expectRejectCode(reserve(client.functions, request()), "JOURNEY_ACCESS_DENIED");
  });

  it("rechaza jornada inexistente", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "jornada-inexistente");
    await expectRejectCode(
      reserve(client.functions, {
        ...request(),
        jornadaLineaId: "JORNADA-PRUEBA-INEXISTENTE__LINEA-PRUEBA-ERROR"
      }),
      "JOURNEY_NOT_FOUND"
    );
  });

  it("rechaza jornada no activa", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "jornada-inactiva");
    await expectRejectCode(
      reserve(client.functions, {
        ...request(),
        jornadaLineaId: "JORNADA-PRUEBA-INACTIVA__LINEA-PRUEBA-1"
      }),
      "JOURNEY_NOT_ACTIVE"
    );
  });

  it("rechaza línea de jornada inexistente", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "linea-inexistente");
    await expectRejectCode(
      reserve(client.functions, {...request(), jornadaLineaId: "JORNADA-PRUEBA-ETAPA-3__LINEA-INEXISTENTE"}),
      "JOURNEY_LINE_NOT_FOUND"
    );
  });

  it("rechaza línea no disponible", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "linea-ocupada");
    await expectRejectCode(reserve(client.functions, request(3)), "LINE_NOT_AVAILABLE");
  });

  it("crea una reserva, transición, auditoría e idempotencia atómicas", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "reserva-valida");
    const result = await reserve(client.functions, request(1, "clave-reserva-valida-0001"));
    const database = adminDatabase();
    const line = await database.collection("jornadaLineas").doc(journeyLineId(1)).get();
    const reservations = await database.collection("reservas").where("jornadaLineaId", "==", journeyLineId(1)).get();
    const audit = await database.collection("auditoria").where("recursoId", "==", journeyLineId(1)).get();
    const idempotency = await database.collection("idempotencia").where("actorUsuarioId", "==", "uid-auxiliar-1").get();

    expect(result).toMatchObject({estadoCentral: "EN_CONTEO", version: 1});
    expect(result.tokenReserva).toHaveLength(43);
    expect(line.data()).toMatchObject({estadoCentral: "EN_CONTEO", reservaActivaId: result.reservaId, version: 1});
    expect(reservations.size).toBe(1);
    expect(reservations.docs[0]?.data()).not.toHaveProperty("tokenReserva");
    expect(reservations.docs[0]?.data().tokenReservaHash).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.size).toBe(1);
    expect(idempotency.size).toBe(1);
  });

  it("permite exactamente un ganador con dos usuarios concurrentes", async () => {
    const first = await authenticatedClient("auxiliar1@prueba.local", "concurrente-1");
    const second = await authenticatedClient("auxiliar2@prueba.local", "concurrente-2");
    const attempts = await Promise.allSettled([
      reserve(first.functions, request(1, "concurrencia-auxiliar-1")),
      reserve(second.functions, request(1, "concurrencia-auxiliar-2"))
    ]);
    const winners = attempts.filter((attempt) => attempt.status === "fulfilled");
    const losers = attempts.filter((attempt) => attempt.status === "rejected");
    const database = adminDatabase();
    const reservations = await database.collection("reservas").where("jornadaLineaId", "==", journeyLineId(1)).get();

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(errorCode((losers[0] as PromiseRejectedResult).reason)).toBe("LINE_NOT_AVAILABLE");
    expect(reservations.size).toBe(1);
  });

  it("devuelve exactamente la misma reserva para misma cuenta, clave y payload", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "reintento");
    const payload = request(1, "clave-reintento-misma-respuesta");
    const first = await reserve(client.functions, payload);
    const second = await reserve(client.functions, payload);
    const database = adminDatabase();
    const line = await database.collection("jornadaLineas").doc(journeyLineId(1)).get();
    const reservations = await database.collection("reservas").where("jornadaLineaId", "==", journeyLineId(1)).get();
    const audit = await database.collection("auditoria").where("recursoId", "==", journeyLineId(1)).get();

    expect(second).toEqual(first);
    expect(line.data()?.version).toBe(1);
    expect(reservations.size).toBe(1);
    expect(audit.size).toBe(1);
  });

  it("rechaza la misma clave con payload diferente", async () => {
    const client = await authenticatedClient("auxiliar1@prueba.local", "conflicto-idempotencia");
    const key = "clave-conflicto-payload-0001";
    await reserve(client.functions, request(1, key));
    await expectRejectCode(reserve(client.functions, request(2, key)), "IDEMPOTENCY_CONFLICT");
  });

  it("usa exclusivamente la jornada ficticia esperada", () => {
    expect(ACTIVE_JOURNEY_ID).toBe("JORNADA-PRUEBA-ETAPA-3");
    expect(getApps().every((app) => app.options.projectId === projectId)).toBe(true);
  });
});
