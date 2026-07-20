import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ApproveCountRequest,
  ApproveCountResult,
  RegisterInitialInventoryRequest,
  RegisterInitialInventoryResult,
  ReserveLineRequest,
  ReserveLineResult,
  SendCountRequest,
  SendCountResult
} from "../src/domain/contracts.js";
import {
  DEMO_PASSWORD,
  FREE_CATALOG_LINE_ID,
  INACTIVE_CATALOG_LINE_ID,
  SECOND_ACTIVE_JOURNEY_ID,
  secondJourneyLineId,
  journeyLineId
} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const apps: FirebaseApp[] = [];

function createClient(name: string): {auth: Auth; functions: Functions} {
  const app = initializeApp({
    apiKey: "demo-api-key", appId: `initial-inventory-${name}`,
    authDomain: `${projectId}.firebaseapp.com`, projectId
  }, `${name}-${crypto.randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {auth, functions};
}

async function client(email: string, name: string) {
  const value = createClient(name);
  await signInWithEmailAndPassword(value.auth, email, DEMO_PASSWORD);
  return value;
}

function database() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getAdminApps().find((candidate) => candidate.name === "initial-inventory-tests") ??
    initializeAdminApp({projectId}, "initial-inventory-tests");
  return getFirestore(app);
}

async function register(
  functions: Functions,
  overrides: Partial<RegisterInitialInventoryRequest> & Pick<RegisterInitialInventoryRequest, "lineaId">
) {
  const callable = httpsCallable<RegisterInitialInventoryRequest | Record<string, unknown>, RegisterInitialInventoryResult>(
    functions, "registrarInventarioInicial"
  );
  return (await callable({
    lineaId: overrides.lineaId,
    versionLineaEsperada: overrides.versionLineaEsperada ?? 1,
    hembras: overrides.hembras ?? 100,
    machos: overrides.machos ?? 50,
    patrones: overrides.patrones ?? 25,
    referenciaFuente: overrides.referenciaFuente ?? "Acta de inventario inicial ETAPA 20",
    claveIdempotencia: overrides.claveIdempotencia ?? `inventario-inicial-${crypto.randomUUID()}`
  })).data;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const details = (error as {details?: unknown}).details;
  return typeof details === "object" && details !== null ? (details as {code?: string}).code : undefined;
}

async function expectCode(promise: Promise<unknown>, expected: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Se esperaba ${expected}`);
  } catch (error) {
    expect(errorCode(error)).toBe(expected);
  }
}

beforeEach(async () => seedEmulator());
afterEach(async () => Promise.all(apps.splice(0).map((app) => deleteApp(app))));

describe("registrarInventarioInicial mediante emuladores reales", () => {
  it("registra antes de activar con total central, trazabilidad y sin movimiento", async () => {
    const admin = await client("administrador@prueba.local", "before-activation");
    const result = await register(admin.functions, {lineaId: FREE_CATALOG_LINE_ID, hembras: 12, machos: 7, patrones: 3});
    const db = database();
    expect(result).toMatchObject({
      lineaId: FREE_CATALOG_LINE_ID, jornadaId: null, jornadaLineaId: null,
      hembras: 12, machos: 7, patrones: 3, total: 22, versionInventario: 1,
      origen: "CARGA_INICIAL_ADMINISTRATIVA", conteoAprobadoId: null
    });
    expect((await db.collection("inventarioOficialLineas").doc(FREE_CATALOG_LINE_ID).get()).data())
      .toMatchObject({total: 22, version: 1, conteoAprobadoId: null});
    expect((await db.collection("cargasInventarioInicial").doc(FREE_CATALOG_LINE_ID).get()).data())
      .toMatchObject({total: 22, inmutable: true, actorUsuarioId: "uid-administrador"});
    expect((await db.collection("auditoria").where("tipo", "==", "INVENTARIO_INICIAL_REGISTRADO").get()).size).toBe(1);
    expect((await db.collection("movimientosInventario").get()).empty).toBe(true);
  });

  it("permite una línea de jornada ACTIVA todavía DISPONIBLE y sin actividad", async () => {
    const admin = await client("administrador@prueba.local", "active-available");
    const result = await register(admin.functions, {lineaId: "LINEA-PRUEBA-B-1"});
    expect(result).toMatchObject({
      jornadaId: SECOND_ACTIVE_JOURNEY_ID,
      jornadaLineaId: secondJourneyLineId(1), total: 175
    });
  });

  it("rechaza supervisor, auxiliar, línea inexistente, inactiva, obsoleta o ya inicializada", async () => {
    const supervisor = await client("supervisor@prueba.local", "supervisor-denied");
    const auxiliary = await client("auxiliar1@prueba.local", "auxiliary-denied");
    const admin = await client("administrador@prueba.local", "invalid-line");
    await expectCode(register(supervisor.functions, {lineaId: FREE_CATALOG_LINE_ID}), "PERMISSION_DENIED");
    await expectCode(register(auxiliary.functions, {lineaId: FREE_CATALOG_LINE_ID}), "PERMISSION_DENIED");
    await expectCode(register(admin.functions, {lineaId: "LINEA-NO-EXISTE"}), "CATALOG_LINE_NOT_FOUND");
    await expectCode(register(admin.functions, {lineaId: INACTIVE_CATALOG_LINE_ID}), "INVENTORY_INITIAL_LINE_INACTIVE");
    await expectCode(register(admin.functions, {lineaId: FREE_CATALOG_LINE_ID, versionLineaEsperada: 99}),
      "INVENTORY_INITIAL_STALE_VERSION");
    await expectCode(register(admin.functions, {lineaId: "LINEA-PRUEBA-1"}), "INVENTORY_ALREADY_EXISTS");
  });

  it("rechaza cantidades inválidas, total cero, fuente no trazable, total cliente y campos adicionales", async () => {
    const admin = await client("administrador@prueba.local", "invalid-payloads");
    await expectCode(register(admin.functions, {lineaId: FREE_CATALOG_LINE_ID, hembras: -1}), "INVALID_ARGUMENT");
    await expectCode(register(admin.functions, {lineaId: FREE_CATALOG_LINE_ID, hembras: 1.5}), "INVALID_ARGUMENT");
    await expectCode(register(admin.functions, {
      lineaId: FREE_CATALOG_LINE_ID, hembras: Number.MAX_SAFE_INTEGER, machos: 1
    }), "INVALID_ARGUMENT");
    await expectCode(register(admin.functions, {
      lineaId: FREE_CATALOG_LINE_ID, hembras: 0, machos: 0, patrones: 0
    }), "INVENTORY_INITIAL_ZERO_NOT_ALLOWED");
    await expectCode(register(admin.functions, {
      lineaId: FREE_CATALOG_LINE_ID, referenciaFuente: "x"
    }), "INVENTORY_INITIAL_SOURCE_INVALID");
    const callable = httpsCallable<Record<string, unknown>, unknown>(admin.functions, "registrarInventarioInicial");
    const base = {
      lineaId: FREE_CATALOG_LINE_ID, versionLineaEsperada: 1, hembras: 1, machos: 1, patrones: 1,
      referenciaFuente: "Acta de control", claveIdempotencia: "payload-extra-etapa-17-0001"
    };
    await expectCode(callable({...base, total: 3}), "INVALID_ARGUMENT");
    await expectCode(callable({...base, usuarioId: "uid-administrador"}), "INVALID_ARGUMENT");
  });

  it.each([
    "reservas", "conteos", "decisionesRevision", "reasignacionesCorreccion", "movimientosInventario"
  ])("rechaza actividad previa en %s sin escrituras parciales", async (collectionName) => {
    const admin = await client("administrador@prueba.local", `activity-${collectionName}`);
    const db = database();
    await db.collection(collectionName).doc(`ACTIVIDAD-${collectionName}`).set({lineaId: FREE_CATALOG_LINE_ID});
    await expectCode(register(admin.functions, {lineaId: FREE_CATALOG_LINE_ID}),
      "INVENTORY_INITIAL_OPERATIONAL_ACTIVITY");
    expect((await db.collection("inventarioOficialLineas").doc(FREE_CATALOG_LINE_ID).get()).exists).toBe(false);
    expect((await db.collection("cargasInventarioInicial").doc(FREE_CATALOG_LINE_ID).get()).exists).toBe(false);
  });

  it("recupera idempotencia y detecta conflicto de payload", async () => {
    const admin = await client("administrador@prueba.local", "idempotency");
    const request = {lineaId: FREE_CATALOG_LINE_ID, claveIdempotencia: "inventario-idempotente-etapa-17-0001"};
    const first = await register(admin.functions, request);
    expect(await register(admin.functions, request)).toEqual(first);
    await expectCode(register(admin.functions, {...request, hembras: 101}), "IDEMPOTENCY_CONFLICT");
  });

  it("serializa dos administradores concurrentes con un solo ganador", async () => {
    const admin = await client("administrador@prueba.local", "first-concurrent-admin");
    const db = database();
    await db.collection("usuarios").doc("uid-supervisor-2").update({roles: ["ADMINISTRADOR"]});
    const secondAdmin = await client("supervisor2@prueba.local", "second-concurrent-admin");
    const attempts = await Promise.allSettled([
      register(admin.functions, {lineaId: "LINEA-CATALOGO-LIBRE-2", claveIdempotencia: "inventario-concurrente-a-17"}),
      register(secondAdmin.functions, {lineaId: "LINEA-CATALOGO-LIBRE-2", claveIdempotencia: "inventario-concurrente-b-17"})
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect((await db.collection("cargasInventarioInicial").where("lineaId", "==", "LINEA-CATALOGO-LIBRE-2").get()).size)
      .toBe(1);
  });

  it("una aprobación posterior lleva versión 1 a 2, crea diferencias y conserva la carga inicial", async () => {
    const admin = await client("administrador@prueba.local", "approval-admin");
    const db = database();
    await db.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").delete();
    await register(admin.functions, {
      lineaId: "LINEA-PRUEBA-1", hembras: 500, machos: 300, patrones: 200,
      claveIdempotencia: "inventario-antes-aprobar-17"
    });
    const author = await client("auxiliar1@prueba.local", "approval-author");
    const reserve = httpsCallable<ReserveLineRequest, ReserveLineResult>(author.functions, "reservarLinea");
    const reservation = (await reserve({
      jornadaLineaId: journeyLineId(1), dispositivoId: "DISPOSITIVO-ETAPA-17",
      claveIdempotencia: "reserva-aprobar-etapa-17"
    })).data;
    const send = httpsCallable<SendCountRequest, SendCountResult>(author.functions, "enviarConteo");
    const count = (await send({
      reservaId: reservation.reservaId, tokenReserva: reservation.tokenReserva,
      dispositivoId: "DISPOSITIVO-ETAPA-17", hembras: 490, machos: 305, patrones: 195,
      observaciones: "Conteo ficticio posterior a carga inicial.",
      timestampDispositivo: "2026-07-15T08:00:00.000-05:00", claveIdempotencia: "envio-aprobar-etapa-17"
    })).data;
    const reviewer = await client("supervisor@prueba.local", "approval-reviewer");
    const approve = httpsCallable<ApproveCountRequest, ApproveCountResult>(reviewer.functions, "aprobarConteo");
    const result = (await approve({conteoId: count.conteoId, claveIdempotencia: "aprobar-etapa-17"})).data;
    expect(result).toMatchObject({
      versionInventario: 2,
      inventarioAnterior: {hembras: 500, machos: 300, patrones: 200, total: 1000},
      inventarioNuevo: {hembras: 490, machos: 305, patrones: 195, total: 990},
      diferencias: {hembras: -10, machos: 5, patrones: -5, total: -10}
    });
    expect((await db.collection("cargasInventarioInicial").doc("LINEA-PRUEBA-1").get()).data())
      .toMatchObject({hembras: 500, machos: 300, patrones: 200, total: 1000, inmutable: true});
    expect((await db.collection("movimientosInventario").get()).size).toBe(1);
  });
});
