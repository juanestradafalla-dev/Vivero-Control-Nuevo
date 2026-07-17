import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ApproveDiscardRequest,
  ApproveDiscardResult,
  ListDiscardLinesResult,
  RegisterDiscardRequest,
  RegisterDiscardResult,
  ReturnDiscardRequest,
  ReturnDiscardResult
} from "../src/domain/contracts.js";
import {DEMO_PASSWORD} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const clientApps: FirebaseApp[] = [];

function createClient(name: string): {auth: Auth; functions: Functions} {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `demo-discard-${name}`,
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

function adminDatabase() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getAdminApps().find((candidate) => candidate.name === "discard-tests") ??
    initializeAdminApp({projectId}, "discard-tests");
  return getFirestore(app);
}

function request(key: string, overrides: Partial<RegisterDiscardRequest> = {}): RegisterDiscardRequest {
  return {
    lineaId: "LINEA-PRUEBA-1",
    versionInventarioObservada: 1,
    dispositivoId: "DISPOSITIVO-DESCARTE-001",
    hembras: 10,
    machos: 5,
    patrones: 0,
    causas: {
      muertos: 10,
      nematodos: 8,
      cuelloGanso: 0,
      raicesBifurcadas: 0,
      dobleInjertacion: 0
    },
    observaciones: "Registro ficticio con causas superpuestas.",
    timestampDispositivo: "2026-07-17T08:00:00.000-05:00",
    claveIdempotencia: key,
    ...overrides
  };
}

async function register(functions: Functions, payload: RegisterDiscardRequest): Promise<RegisterDiscardResult> {
  return (await httpsCallable<RegisterDiscardRequest, RegisterDiscardResult>(
    functions, "registrarDescarte"
  )(payload)).data;
}

async function approve(functions: Functions, payload: ApproveDiscardRequest): Promise<ApproveDiscardResult> {
  return (await httpsCallable<ApproveDiscardRequest, ApproveDiscardResult>(
    functions, "aprobarDescarte"
  )(payload)).data;
}

async function returnDiscard(functions: Functions, payload: ReturnDiscardRequest): Promise<ReturnDiscardResult> {
  return (await httpsCallable<ReturnDiscardRequest, ReturnDiscardResult>(
    functions, "devolverDescarte"
  )(payload)).data;
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

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("descartes mediante emuladores reales", () => {
  it("lista líneas con inventario y acepta una captura multicausa", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "discard-list");
    const listed = (await httpsCallable<Record<string, never>, ListDiscardLinesResult>(
      auxiliary.functions, "listarLineasDescarte"
    )({})).data;
    expect(listed.lineas).toHaveLength(3);
    expect(listed.lineas[0]).toMatchObject({
      lineaId: "LINEA-PRUEBA-1",
      inventario: {hembras: 500, machos: 300, patrones: 200, total: 1000},
      versionInventario: 1
    });

    const result = await register(auxiliary.functions, request("registrar-descarte-integration-0001"));
    expect(result).toMatchObject({
      lineaId: "LINEA-PRUEBA-1",
      estado: "PENDIENTE_REVISION",
      totalUnico: 15,
      causas: {muertos: 10, nematodos: 8},
      versionInventarioObservada: 1
    });
  });

  it("descuenta una sola vez únicamente al aprobar", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "discard-author");
    const administrator = await authenticatedClient("administrador@prueba.local", "discard-reviewer");
    const discard = await register(auxiliary.functions, request("registrar-descarte-integration-0002"));
    const result = await approve(administrator.functions, {
      descarteId: discard.descarteId,
      claveIdempotencia: "aprobar-descarte-integration-0002"
    });
    expect(result).toMatchObject({
      estado: "APROBADO",
      inventarioAnterior: {hembras: 500, machos: 300, patrones: 200, total: 1000},
      inventarioNuevo: {hembras: 490, machos: 295, patrones: 200, total: 985},
      versionInventario: 2
    });

    const repeated = await approve(administrator.functions, {
      descarteId: discard.descarteId,
      claveIdempotencia: "aprobar-descarte-integration-0002"
    });
    expect(repeated).toEqual(result);
    const database = adminDatabase();
    expect((await database.collection("movimientosInventario").where(
      "descarteId", "==", discard.descarteId
    ).get()).size).toBe(1);
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toMatchObject({hembras: 490, machos: 295, patrones: 200, total: 985, version: 2});
  });

  it("detiene una aprobación si otra operación cambió la versión observada", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "discard-stale-author");
    const administrator = await authenticatedClient("administrador@prueba.local", "discard-stale-reviewer");
    const first = await register(auxiliary.functions, request("registrar-descarte-stale-0001"));
    const second = await register(auxiliary.functions, request("registrar-descarte-stale-0002"));
    await approve(administrator.functions, {
      descarteId: first.descarteId,
      claveIdempotencia: "aprobar-descarte-stale-0001"
    });
    await expectRejectCode(approve(administrator.functions, {
      descarteId: second.descarteId,
      claveIdempotencia: "aprobar-descarte-stale-0002"
    }), "DISCARD_STALE_INVENTORY");
  });

  it("devuelve con motivo sin modificar el inventario", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "discard-return-author");
    const administrator = await authenticatedClient("administrador@prueba.local", "discard-return-reviewer");
    const discard = await register(auxiliary.functions, request("registrar-descarte-return-0001"));
    const database = adminDatabase();
    const before = (await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data();
    const result = await returnDiscard(administrator.functions, {
      descarteId: discard.descarteId,
      motivo: "Verificar nuevamente las causas en campo.",
      claveIdempotencia: "devolver-descarte-integration-0001"
    });
    expect(result.estado).toBe("DEVUELTO");
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toEqual(before);
    expect((await database.collection("movimientosInventario").where(
      "descarteId", "==", discard.descarteId
    ).get()).empty).toBe(true);
  });

  it("impide revisar al auxiliar", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "discard-no-review");
    const discard = await register(auxiliary.functions, request("registrar-descarte-no-review-0001"));
    await expectRejectCode(approve(auxiliary.functions, {
      descarteId: discard.descarteId,
      claveIdempotencia: "aprobar-descarte-no-review-0001"
    }), "DISCARD_REVIEW_NOT_ALLOWED");
  });

  it("exige motivo para la autorrevisión administrativa", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "discard-self-review");
    const discard = await register(administrator.functions, request("registrar-descarte-self-0001"));
    await expectRejectCode(approve(administrator.functions, {
      descarteId: discard.descarteId,
      claveIdempotencia: "aprobar-descarte-self-sin-motivo"
    }), "EXCEPTION_REASON_REQUIRED");
    const result = await approve(administrator.functions, {
      descarteId: discard.descarteId,
      motivoExcepcion: "Único administrador disponible para la prueba controlada.",
      claveIdempotencia: "aprobar-descarte-self-con-motivo"
    });
    expect(result.estado).toBe("APROBADO");
  });
});
