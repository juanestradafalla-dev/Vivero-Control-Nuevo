import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  CatalogLineResult,
  CatalogLocationResult,
  CreateCatalogLineRequest,
  CreateCatalogLocationRequest,
  ListManageableCatalogResult,
  ListManageableJourneysResult,
  UpdateCatalogLineRequest,
  UpdateCatalogLocationRequest
} from "../src/domain/contracts.js";
import {
  ACTIVE_JOURNEY_ID,
  DEMO_PASSWORD,
  DRAFT_JOURNEY_ID,
  FREE_CATALOG_LINE_ID,
  journeyLineId
} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const clientApps: FirebaseApp[] = [];

interface Client { readonly auth: Auth; readonly functions: Functions; }

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key", appId: `catalog-${name}`,
    authDomain: `${projectId}.firebaseapp.com`, projectId
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

function adminApp() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  return getAdminApps().find((candidate) => candidate.name === "catalog-tests") ??
    initializeAdminApp({projectId}, "catalog-tests");
}

function database() { return getFirestore(adminApp()); }

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const details = (error as {details?: unknown}).details;
  return typeof details === "object" && details !== null ? (details as {code?: string}).code : undefined;
}

async function expectRejectCode(promise: Promise<unknown>, expected: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Se esperaba ${expected}`);
  } catch (error) {
    expect(errorCode(error)).toBe(expected);
  }
}

async function listCatalog(client: Client): Promise<ListManageableCatalogResult> {
  const callable = httpsCallable<Record<string, never>, ListManageableCatalogResult>(
    client.functions, "listarCatalogoAdministrable"
  );
  return (await callable({})).data;
}

async function createLocation(
  client: Client,
  code: string,
  parentId: string | null = null,
  key = `crear-ubicacion-${crypto.randomUUID()}`
): Promise<CatalogLocationResult> {
  const callable = httpsCallable<CreateCatalogLocationRequest, CatalogLocationResult>(client.functions, "crearUbicacion");
  return (await callable({
    codigo: code, tipo: "TIPO-FICTICIO", ubicacionPadreId: parentId,
    nombreVisible: `Ubicación ${code}`, orden: 10, claveIdempotencia: key
  })).data;
}

async function updateLocation(
  client: Client,
  location: Pick<CatalogLocationResult, "ubicacionId" | "version" | "nombreVisible" | "orden" | "activa">,
  changes: Partial<Pick<CatalogLocationResult, "nombreVisible" | "orden" | "activa">> = {},
  key = `actualizar-ubicacion-${crypto.randomUUID()}`
): Promise<CatalogLocationResult> {
  const callable = httpsCallable<UpdateCatalogLocationRequest, CatalogLocationResult>(client.functions, "actualizarUbicacion");
  return (await callable({
    ubicacionId: location.ubicacionId, versionEsperada: location.version,
    nombreVisible: changes.nombreVisible ?? location.nombreVisible,
    orden: changes.orden ?? location.orden, activa: changes.activa ?? location.activa,
    motivo: "Cambio ficticio controlado.", claveIdempotencia: key
  })).data;
}

async function createLine(
  client: Client,
  locationId: string,
  code: string,
  key = `crear-linea-${crypto.randomUUID()}`
): Promise<CatalogLineResult> {
  const callable = httpsCallable<CreateCatalogLineRequest, CatalogLineResult>(client.functions, "crearLinea");
  return (await callable({
    ubicacionId: locationId, codigo: code, nombreVisible: `Línea ${code}`,
    orden: 10, claveIdempotencia: key
  })).data;
}

async function updateLine(
  client: Client,
  line: Pick<CatalogLineResult, "lineaId" | "version" | "nombreVisible" | "orden" | "activa">,
  changes: Partial<Pick<CatalogLineResult, "nombreVisible" | "orden" | "activa">> = {},
  key = `actualizar-linea-${crypto.randomUUID()}`
): Promise<CatalogLineResult> {
  const callable = httpsCallable<UpdateCatalogLineRequest, CatalogLineResult>(client.functions, "actualizarLinea");
  return (await callable({
    lineaId: line.lineaId, versionEsperada: line.version,
    nombreVisible: changes.nombreVisible ?? line.nombreVisible,
    orden: changes.orden ?? line.orden, activa: changes.activa ?? line.activa,
    motivo: "Cambio ficticio controlado.", claveIdempotencia: key
  })).data;
}

beforeEach(async () => { await seedEmulator(); });
afterEach(async () => { await Promise.all(clientApps.splice(0).map((app) => deleteApp(app))); });

describe("administración central del catálogo", () => {
  it("rechaza listar o crear a supervisor y auxiliar", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "denied-supervisor");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "denied-auxiliary");
    await expectRejectCode(listCatalog(supervisor), "PERMISSION_DENIED");
    await expectRejectCode(createLocation(auxiliary, "DENEGADA"), "PERMISSION_DENIED");
  });

  it("permite listar, crear y actualizar al administrador", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "valid-admin");
    const initial = await listCatalog(admin);
    expect(initial.ubicaciones.length).toBeGreaterThan(0);
    expect(initial.lineas.find((line) => line.lineaId === "LINEA-PRUEBA-1")).toMatchObject({
      ocupadaEnJornadaActiva: true, version: 1
    });

    const root = await createLocation(admin, " sector á ");
    expect(root).toMatchObject({codigo: "SECTOR-A", ubicacionPadreId: null, activa: true, version: 1});
    const child = await createLocation(admin, "NIVEL-2", root.ubicacionId);
    const line = await createLine(admin, child.ubicacionId, " línea 01 ");
    expect(line).toMatchObject({codigo: "LINEA-01", ubicacionId: child.ubicacionId, version: 1});
    expect(await updateLocation(admin, child, {nombreVisible: "Nivel actualizado", orden: 20}))
      .toMatchObject({nombreVisible: "Nivel actualizado", orden: 20, version: 2});
    expect(await updateLine(admin, line, {nombreVisible: "Línea actualizada", orden: 20}))
      .toMatchObject({nombreVisible: "Línea actualizada", orden: 20, version: 2});
  });

  it("rechaza padres inexistentes, inactivos, autorreferencias y ciclos", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "parents");
    await expectRejectCode(createLocation(admin, "HUERFANA", "PADRE-INEXISTENTE"), "CATALOG_LOCATION_NOT_FOUND");
    const root = await createLocation(admin, "RAIZ-INACTIVA");
    await updateLocation(admin, root, {activa: false});
    await expectRejectCode(createLocation(admin, "HIJA-BLOQUEADA", root.ubicacionId), "CATALOG_LOCATION_INACTIVE");
    const db = database();
    await db.collection("ubicaciones").doc("CICLO-A").set({
      id: "CICLO-A", codigo: "CICLO-A", tipo: "FIXTURE", ubicacionPadreId: "CICLO-B",
      nombreVisible: "Ciclo A", orden: 1, activa: true, version: 1
    });
    await db.collection("ubicaciones").doc("CICLO-B").set({
      id: "CICLO-B", codigo: "CICLO-B", tipo: "FIXTURE", ubicacionPadreId: "CICLO-A",
      nombreVisible: "Ciclo B", orden: 1, activa: true, version: 1
    });
    await expectRejectCode(createLocation(admin, "BAJO-CICLO", "CICLO-A"), "CATALOG_PARENT_CYCLE");
    await db.collection("ubicaciones").doc("AUTO-REFERENCIA").set({
      id: "AUTO-REFERENCIA", codigo: "AUTO-REFERENCIA", tipo: "FIXTURE",
      ubicacionPadreId: "AUTO-REFERENCIA", nombreVisible: "Auto referencia", orden: 1, activa: true, version: 1
    });
    await expectRejectCode(createLocation(admin, "BAJO-AUTO", "AUTO-REFERENCIA"), "CATALOG_PARENT_CYCLE");
  });

  it("normaliza códigos y serializa creaciones concurrentes con un ganador", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "unique");
    const parent = await createLocation(admin, "PADRE-UNICO");
    await expectRejectCode(createLine(admin, parent.ubicacionId, "---"), "INVALID_ARGUMENT");
    const attempts = await Promise.allSettled([
      createLine(admin, parent.ubicacionId, "Línea 001", "concurrencia-linea-uno"),
      createLine(admin, parent.ubicacionId, " linea-001 ", "concurrencia-linea-dos")
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    expect(errorCode(rejected?.reason)).toBe("CATALOG_DUPLICATE_CODE");
    const lines = (await listCatalog(admin)).lineas.filter((line) => line.ubicacionId === parent.ubicacionId);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.codigo).toBe("LINEA-001");
  });

  it("protege versiones, campos inmutables y ubicaciones con dependencias activas", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "dependencies");
    const root = await createLocation(admin, "RAIZ-DEPENDENCIAS");
    const child = await createLocation(admin, "HIJA-ACTIVA", root.ubicacionId);
    await expectRejectCode(updateLocation(admin, root, {activa: false}), "CATALOG_LOCATION_HAS_ACTIVE_CHILDREN");
    const line = await createLine(admin, child.ubicacionId, "LINEA-ACTIVA");
    await expectRejectCode(updateLocation(admin, child, {activa: false}), "CATALOG_LOCATION_HAS_ACTIVE_LINES");
    const changed = await updateLine(admin, line, {nombreVisible: "Primera edición"});
    await expectRejectCode(updateLine(admin, line, {nombreVisible: "Obsoleta"}), "CATALOG_STALE_VERSION");
    const callable = httpsCallable<Record<string, unknown>, CatalogLineResult>(admin.functions, "actualizarLinea");
    await expectRejectCode(callable({
      lineaId: changed.lineaId, versionEsperada: changed.version, codigo: "NO-PERMITIDO",
      nombreVisible: changed.nombreVisible, orden: changed.orden, activa: changed.activa,
      motivo: "Intento inválido.", claveIdempotencia: "campo-inmutable-etapa-16"
    }), "INVALID_ARGUMENT");
  });

  it("impide modificar una línea ocupada y conserva su fotografía histórica", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "occupied");
    const db = database();
    const historicalBefore = (await db.collection("jornadaLineas").doc(journeyLineId(1)).get()).data();
    const catalog = await listCatalog(admin);
    const occupied = catalog.lineas.find((line) => line.lineaId === "LINEA-PRUEBA-1");
    expect(occupied).toBeDefined();
    await expectRejectCode(
      updateLine(admin, occupied!, {nombreVisible: "No debe cambiar"}),
      "CATALOG_LINE_OCCUPIED"
    );
    expect((await db.collection("jornadaLineas").doc(journeyLineId(1)).get()).data()).toEqual(historicalBefore);
    await db.collection("jornadas").doc(ACTIVE_JOURNEY_ID).update({
      estadoAdministrativo: "CERRANDO"
    });
    await db.collection("ocupacionesLineasActivas").doc("LINEA-PRUEBA-1").delete();
    await expectRejectCode(
      updateLine(admin, occupied!, {nombreVisible: "Tampoco durante el cierre"}),
      "CATALOG_LINE_OCCUPIED"
    );
    expect((await db.collection("jornadaLineas").doc(journeyLineId(1)).get()).data()).toEqual(historicalBefore);
  });

  it("desactiva una línea elegida solo en borrador sin eliminar la selección", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "draft-selection");
    const db = database();
    const selectionRef = db.collection("seleccionesLineasJornada").doc(DRAFT_JOURNEY_ID);
    const selectionBefore = (await selectionRef.get()).data();
    expect((selectionBefore?.lineaIds as string[])).toContain(FREE_CATALOG_LINE_ID);
    const line = (await listCatalog(admin)).lineas.find((candidate) => candidate.lineaId === FREE_CATALOG_LINE_ID);
    expect(line).toBeDefined();
    const disabled = await updateLine(admin, line!, {activa: false});
    expect(disabled).toMatchObject({activa: false, seleccionesBorrador: 1});
    expect((await selectionRef.get()).data()).toEqual(selectionBefore);
    const listDrafts = httpsCallable<Record<string, never>, ListManageableJourneysResult>(
      admin.functions, "listarJornadasAdministrables"
    );
    const drafts = (await listDrafts({})).data;
    expect(drafts.lineasCatalogo.find((candidate) => candidate.lineaId === FREE_CATALOG_LINE_ID))
      .toMatchObject({seleccionable: false, motivoNoSeleccionable: "LINEA_INACTIVA"});
  });

  it("exige la cadena de padres activa para reactivar", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "reactivation");
    const root = await createLocation(admin, "RAIZ-REACTIVAR");
    const child = await createLocation(admin, "HIJA-REACTIVAR", root.ubicacionId);
    const inactiveChild = await updateLocation(admin, child, {activa: false});
    await updateLocation(admin, root, {activa: false});
    await expectRejectCode(updateLocation(admin, inactiveChild, {activa: true}), "CATALOG_LOCATION_INACTIVE");
  });

  it("recupera resultados idempotentes y detecta conflicto de payload", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "idempotency");
    const key = "crear-ubicacion-idempotente-16";
    const first = await createLocation(admin, "IDEMPOTENTE", null, key);
    const repeated = await createLocation(admin, "IDEMPOTENTE", null, key);
    expect(repeated).toEqual(first);
    await expectRejectCode(createLocation(admin, "OTRO-CODIGO", null, key), "IDEMPOTENCY_CONFLICT");
    expect((await database().collection("auditoria").where("recursoId", "==", first.ubicacionId).get()).size).toBe(1);
  });

  it("no produce cascadas ni altera datos operativos o inventario", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "no-cascade");
    const db = database();
    const before = await Promise.all([
      db.collection("jornadas").count().get(), db.collection("reservas").count().get(),
      db.collection("inventarioOficialLineas").count().get(), db.collection("movimientosInventario").count().get()
    ]);
    const root = await createLocation(admin, "RAIZ-SIN-CASCADA");
    const child = await createLocation(admin, "HIJA-SIN-CASCADA", root.ubicacionId);
    const inactiveChild = await updateLocation(admin, child, {activa: false});
    await updateLocation(admin, root, {activa: false});
    expect((await db.collection("ubicaciones").doc(inactiveChild.ubicacionId).get()).exists).toBe(true);
    const after = await Promise.all([
      db.collection("jornadas").count().get(), db.collection("reservas").count().get(),
      db.collection("inventarioOficialLineas").count().get(), db.collection("movimientosInventario").count().get()
    ]);
    expect(after.map((snapshot) => snapshot.data().count)).toEqual(before.map((snapshot) => snapshot.data().count));
  });
});
