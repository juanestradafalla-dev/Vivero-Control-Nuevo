import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  CreateDraftJourneyRequest,
  CreateDraftJourneyResult,
  ListActiveJourneysResult,
  ListManageableJourneysResult,
  UpdateDraftJourneyLinesRequest,
  UpdateDraftJourneyLinesResult
} from "../src/domain/contracts.js";
import {
  ACTIVE_JOURNEY_ID,
  DEMO_PASSWORD,
  DRAFT_JOURNEY_ID,
  FREE_CATALOG_LINE_ID,
  INACTIVE_CATALOG_LINE_ID,
  OTHER_SUPERVISOR_DRAFT_JOURNEY_ID,
  SECOND_FREE_CATALOG_LINE_ID
} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const clientApps: FirebaseApp[] = [];

interface Client {
  readonly auth: Auth;
  readonly functions: Functions;
}

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `draft-journey-${name}`,
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

async function createDraft(
  client: Client,
  name = "Borrador integrado Etapa 10",
  key = `crear-borrador-${crypto.randomUUID()}`
): Promise<CreateDraftJourneyResult> {
  const callable = httpsCallable<CreateDraftJourneyRequest, CreateDraftJourneyResult>(
    client.functions,
    "crearJornadaBorrador"
  );
  return (await callable({nombreVisible: name, claveIdempotencia: key})).data;
}

async function updateLines(
  client: Client,
  journeyId: string,
  lineIds: readonly string[],
  key = `actualizar-borrador-${crypto.randomUUID()}`
): Promise<UpdateDraftJourneyLinesResult> {
  const callable = httpsCallable<UpdateDraftJourneyLinesRequest, UpdateDraftJourneyLinesResult>(
    client.functions,
    "actualizarLineasJornadaBorrador"
  );
  return (await callable({jornadaId: journeyId, lineaIds: lineIds, claveIdempotencia: key})).data;
}

async function listManageable(client: Client): Promise<ListManageableJourneysResult> {
  const callable = httpsCallable<Record<string, never>, ListManageableJourneysResult>(
    client.functions,
    "listarJornadasAdministrables"
  );
  return (await callable({})).data;
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
  const app = getAdminApps().find((candidate) => candidate.name === "draft-journey-tests") ??
    initializeAdminApp({projectId}, "draft-journey-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("jornadas en borrador mediante Auth, Functions y Firestore Emulator", () => {
  it("permite crear borradores a supervisor y administrador sin crear estado operativo", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "draft-supervisor");
    const administrator = await authenticatedClient("administrador@prueba.local", "draft-administrator");
    const database = adminDatabase();
    const operationalBefore = await database.collection("jornadaLineas").get();
    const inventoryBefore = await database.collection("inventarioOficialLineas").get();

    const supervisorDraft = await createDraft(supervisor, "Borrador del supervisor");
    const administratorDraft = await createDraft(administrator, "Borrador del administrador");

    expect(supervisorDraft).toMatchObject({estado: "BORRADOR", version: 1, cantidadLineas: 0});
    expect(administratorDraft).toMatchObject({estado: "BORRADOR", version: 1, cantidadLineas: 0});
    expect((await database.collection("jornadas").doc(supervisorDraft.jornadaId).get()).data()).toMatchObject({
      creadaPorUsuarioId: "uid-supervisor",
      estadoAdministrativo: "BORRADOR"
    });
    expect((await database.collection("jornadaLineas").get()).docs.map((document) => document.id)).toEqual(
      operationalBefore.docs.map((document) => document.id)
    );
    expect((await database.collection("inventarioOficialLineas").get()).docs.map((document) => document.data())).toEqual(
      inventoryBefore.docs.map((document) => document.data())
    );
  });

  it("rechaza auxiliar y nombre vacio", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "draft-auxiliary");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "draft-empty-name");
    await expectRejectCode(createDraft(auxiliary), "PERMISSION_DENIED");
    await expectRejectCode(createDraft(supervisor, "   "), "JOURNEY_NAME_REQUIRED");
    await expectRejectCode(listManageable(auxiliary), "PERMISSION_DENIED");
  });

  it("recupera el mismo resultado y detecta conflicto idempotente", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "draft-idempotency");
    const key = "crear-borrador-idempotente-0001";
    const first = await createDraft(supervisor, "Borrador idempotente", key);
    const second = await createDraft(supervisor, "Borrador idempotente", key);
    expect(second).toEqual(first);
    await expectRejectCode(createDraft(supervisor, "Nombre diferente", key), "IDEMPOTENCY_CONFLICT");
    expect((await adminDatabase().collection("auditoria")
      .where("tipo", "==", "JORNADA_BORRADOR_CREADA").get()).size).toBe(1);
  });

  it("limita borradores del supervisor y permite al administrador gestionar todos", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "draft-owner");
    const administrator = await authenticatedClient("administrador@prueba.local", "draft-admin-owner");
    const ownList = await listManageable(supervisor);
    expect(ownList.jornadas.map((journey) => journey.jornadaId)).toEqual([DRAFT_JOURNEY_ID]);
    await expectRejectCode(
      updateLines(supervisor, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID, [SECOND_FREE_CATALOG_LINE_ID]),
      "JOURNEY_DRAFT_ACCESS_DENIED"
    );
    const adminList = await listManageable(administrator);
    expect(adminList.jornadas.map((journey) => journey.jornadaId)).toEqual(expect.arrayContaining([
      DRAFT_JOURNEY_ID,
      OTHER_SUPERVISOR_DRAFT_JOURNEY_ID
    ]));
    await expect(updateLines(
      administrator,
      OTHER_SUPERVISOR_DRAFT_JOURNEY_ID,
      [SECOND_FREE_CATALOG_LINE_ID]
    )).resolves.toMatchObject({cantidadLineas: 1, estado: "BORRADOR"});
  });

  it("guarda lineas libres en preparacion sin crear jornadaLineas ni inventario", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "draft-lines");
    const database = adminDatabase();
    const operationalBefore = await database.collection("jornadaLineas").get();
    const inventoryBefore = await database.collection("inventarioOficialLineas").get();
    const result = await updateLines(supervisor, DRAFT_JOURNEY_ID, [
      SECOND_FREE_CATALOG_LINE_ID,
      FREE_CATALOG_LINE_ID
    ]);
    expect(result).toMatchObject({version: 2, cantidadLineas: 2});
    expect(result.lineaIds).toEqual([FREE_CATALOG_LINE_ID, SECOND_FREE_CATALOG_LINE_ID]);
    expect((await database.collection("seleccionesLineasJornada").doc(DRAFT_JOURNEY_ID).get()).data()).toMatchObject({
      lineaIds: [FREE_CATALOG_LINE_ID, SECOND_FREE_CATALOG_LINE_ID],
      cantidadLineas: 2
    });
    expect((await database.collection("jornadaLineas").get()).docs.map((document) => document.id)).toEqual(
      operationalBefore.docs.map((document) => document.id)
    );
    expect((await database.collection("inventarioOficialLineas").get()).docs.map((document) => document.data())).toEqual(
      inventoryBefore.docs.map((document) => document.data())
    );
  });

  it("rechaza lineas inexistentes, inactivas, duplicadas o usadas por jornada activa", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "draft-invalid-lines");
    await expectRejectCode(updateLines(supervisor, DRAFT_JOURNEY_ID, ["LINEA-INEXISTENTE"]), "LINE_NOT_FOUND");
    await expectRejectCode(updateLines(supervisor, DRAFT_JOURNEY_ID, [INACTIVE_CATALOG_LINE_ID]), "LINE_INACTIVE");
    await expectRejectCode(
      updateLines(supervisor, DRAFT_JOURNEY_ID, [FREE_CATALOG_LINE_ID, FREE_CATALOG_LINE_ID]),
      "DUPLICATE_LINE_IDS"
    );
    await expectRejectCode(updateLines(supervisor, DRAFT_JOURNEY_ID, ["LINEA-PRUEBA-1"]),
      "LINE_ALREADY_IN_ACTIVE_JOURNEY");
  });

  it("rechaza editar una jornada activa y recupera actualizacion idempotente", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "draft-update-idempotency");
    await expectRejectCode(updateLines(supervisor, ACTIVE_JOURNEY_ID, []), "JOURNEY_NOT_DRAFT");
    const key = "actualizar-borrador-idempotente-0001";
    const first = await updateLines(supervisor, DRAFT_JOURNEY_ID, [SECOND_FREE_CATALOG_LINE_ID], key);
    const second = await updateLines(supervisor, DRAFT_JOURNEY_ID, [SECOND_FREE_CATALOG_LINE_ID], key);
    expect(second).toEqual(first);
    await expectRejectCode(updateLines(supervisor, DRAFT_JOURNEY_ID, [FREE_CATALOG_LINE_ID], key),
      "IDEMPOTENCY_CONFLICT");
  });

  it("Campo continua recibiendo solo jornadas activas y nunca borradores", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "draft-field-list");
    const callable = httpsCallable<Record<string, never>, ListActiveJourneysResult>(
      auxiliary.functions,
      "listarJornadasActivas"
    );
    const result = (await callable({})).data;
    expect(result.jornadas.every((journey) => journey.estado === "ACTIVA")).toBe(true);
    expect(result.jornadas.map((journey) => journey.jornadaId)).not.toContain(DRAFT_JOURNEY_ID);
    expect(result.jornadas.map((journey) => journey.jornadaId)).not.toContain(OTHER_SUPERVISOR_DRAFT_JOURNEY_ID);
  });
});
