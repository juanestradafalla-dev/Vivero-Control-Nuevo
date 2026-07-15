import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ActivateJourneyRequest,
  ActivateJourneyResult,
  ListActiveJourneysResult,
  ListDraftJourneyParticipantsRequest,
  ListDraftJourneyParticipantsResult,
  UpdateDraftJourneyLinesRequest,
  UpdateDraftJourneyLinesResult,
  UpdateDraftJourneyParticipantsRequest,
  UpdateDraftJourneyParticipantsResult
} from "../src/domain/contracts.js";
import {
  ACTIVE_JOURNEY_ID,
  DEMO_PASSWORD,
  DRAFT_JOURNEY_ID,
  FREE_CATALOG_LINE_ID,
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
    appId: `activate-journey-${name}`,
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

async function listParticipants(client: Client, journeyId: string): Promise<ListDraftJourneyParticipantsResult> {
  const callable = httpsCallable<ListDraftJourneyParticipantsRequest, ListDraftJourneyParticipantsResult>(
    client.functions,
    "listarParticipantesJornadaBorrador"
  );
  return (await callable({jornadaId: journeyId})).data;
}

async function updateParticipants(
  client: Client,
  journeyId: string,
  participants: UpdateDraftJourneyParticipantsRequest["participantes"]
): Promise<UpdateDraftJourneyParticipantsResult> {
  const callable = httpsCallable<UpdateDraftJourneyParticipantsRequest, UpdateDraftJourneyParticipantsResult>(
    client.functions,
    "actualizarParticipantesJornadaBorrador"
  );
  return (await callable({
    jornadaId: journeyId,
    participantes: participants,
    claveIdempotencia: `preparar-participantes-${crypto.randomUUID()}`
  })).data;
}

async function updateLines(
  client: Client,
  journeyId: string,
  lineaIds: readonly string[]
): Promise<UpdateDraftJourneyLinesResult> {
  const callable = httpsCallable<UpdateDraftJourneyLinesRequest, UpdateDraftJourneyLinesResult>(
    client.functions,
    "actualizarLineasJornadaBorrador"
  );
  return (await callable({
    jornadaId: journeyId,
    lineaIds,
    claveIdempotencia: `preparar-lineas-${crypto.randomUUID()}`
  })).data;
}

async function activate(
  client: Client,
  summary: ListDraftJourneyParticipantsResult,
  key = `activar-jornada-${crypto.randomUUID()}`,
  overrides: Partial<ActivateJourneyRequest> = {}
): Promise<ActivateJourneyResult> {
  const callable = httpsCallable<ActivateJourneyRequest, ActivateJourneyResult>(
    client.functions,
    "activarJornada"
  );
  return (await callable({
    jornadaId: summary.jornadaId,
    versionJornadaEsperada: summary.version,
    versionSeleccionLineasEsperada: summary.versionSeleccionLineas,
    versionSeleccionParticipantesEsperada: summary.versionSeleccionParticipantes,
    claveIdempotencia: key,
    ...overrides
  })).data;
}

async function prepareValid(
  client: Client,
  journeyId = DRAFT_JOURNEY_ID,
  auxiliaryId = "uid-auxiliar-1",
  reviewerId = "uid-supervisor"
): Promise<ListDraftJourneyParticipantsResult> {
  await updateParticipants(client, journeyId, [
    {usuarioId: auxiliaryId, puedeContar: true},
    {usuarioId: reviewerId, puedeContar: false}
  ]);
  return listParticipants(client, journeyId);
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
  const app = getAdminApps().find((candidate) => candidate.name === "activate-journey-tests") ??
    initializeAdminApp({projectId}, "activate-journey-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("activacion transaccional de jornadas preparadas", () => {
  it("materializa exactamente lineas, autorizaciones y bloqueos sin tocar inventario", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-valid");
    const database = adminDatabase();
    const inventoryBefore = await database.collection("inventarioOficialLineas").get();
    const movementsBefore = await database.collection("movimientosInventario").get();
    const lineSelectionBefore = (await database.collection("seleccionesLineasJornada")
      .doc(DRAFT_JOURNEY_ID).get()).data();
    const participantSelectionBefore = await prepareValid(supervisor);
    const participantDocumentBefore = (await database.collection("seleccionesParticipantesJornada")
      .doc(DRAFT_JOURNEY_ID).get()).data();

    const result = await activate(supervisor, participantSelectionBefore, "activar-valida-etapa-12-0001");

    expect(result).toMatchObject({
      jornadaId: DRAFT_JOURNEY_ID,
      estado: "ACTIVA",
      version: participantSelectionBefore.version + 1,
      cantidadLineas: 1,
      cantidadParticipantes: 2
    });
    expect((await database.collection("jornadas").doc(DRAFT_JOURNEY_ID).get()).data()).toMatchObject({
      estadoAdministrativo: "ACTIVA",
      activadaPorUsuarioId: "uid-supervisor",
      version: result.version
    });
    expect((await database.collection("jornadaLineas")
      .doc(`${DRAFT_JOURNEY_ID}__${FREE_CATALOG_LINE_ID}`).get()).data()).toMatchObject({
      jornadaId: DRAFT_JOURNEY_ID,
      lineaId: FREE_CATALOG_LINE_ID,
      estadoCentral: "DISPONIBLE",
      reservaActivaId: null,
      version: 0
    });
    expect((await database.collection("ocupacionesLineasActivas").doc(FREE_CATALOG_LINE_ID).get()).data())
      .toMatchObject({lineaId: FREE_CATALOG_LINE_ID, jornadaId: DRAFT_JOURNEY_ID});
    const authorizations = await database.collection("jornadas").doc(DRAFT_JOURNEY_ID)
      .collection("autorizaciones").get();
    expect(authorizations.docs.map((document) => document.id).sort()).toEqual([
      "uid-auxiliar-1",
      "uid-supervisor"
    ]);
    expect(authorizations.docs.find((document) => document.id === "uid-auxiliar-1")?.data())
      .toMatchObject({rolEfectivo: "AUXILIAR", puedeContar: true, puedeRevisar: false});
    expect(authorizations.docs.find((document) => document.id === "uid-supervisor")?.data())
      .toMatchObject({rolEfectivo: "SUPERVISOR", puedeContar: false, puedeRevisar: true});
    expect((await database.collection("seleccionesLineasJornada").doc(DRAFT_JOURNEY_ID).get()).data())
      .toEqual(lineSelectionBefore);
    expect((await database.collection("seleccionesParticipantesJornada").doc(DRAFT_JOURNEY_ID).get()).data())
      .toEqual(participantDocumentBefore);
    expect((await database.collection("inventarioOficialLineas").get()).docs.map((document) => document.data()))
      .toEqual(inventoryBefore.docs.map((document) => document.data()));
    expect((await database.collection("movimientosInventario").get()).docs.map((document) => document.data()))
      .toEqual(movementsBefore.docs.map((document) => document.data()));
  });

  it("aplica permisos de rol y propiedad del borrador", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "activate-aux");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-owner");
    const administrator = await authenticatedClient("administrador@prueba.local", "activate-admin");
    const ownSummary = await prepareValid(supervisor);
    await expectRejectCode(activate(auxiliary, ownSummary), "PERMISSION_DENIED");
    await expectRejectCode(activate(supervisor, {
      ...ownSummary,
      jornadaId: OTHER_SUPERVISOR_DRAFT_JOURNEY_ID
    }), "JOURNEY_DRAFT_ACCESS_DENIED");
    await updateLines(administrator, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID, [SECOND_FREE_CATALOG_LINE_ID]);
    const otherSummary = await prepareValid(
      administrator,
      OTHER_SUPERVISOR_DRAFT_JOURNEY_ID,
      "uid-auxiliar-2",
      "uid-supervisor-2"
    );
    await expect(activate(administrator, otherSummary)).resolves.toMatchObject({estado: "ACTIVA"});
  });

  it("rechaza jornada activa, resumen obsoleto y selecciones incompletas", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-state");
    const valid = await prepareValid(supervisor);
    await expectRejectCode(activate(supervisor, {
      ...valid,
      jornadaId: ACTIVE_JOURNEY_ID
    }), "JOURNEY_NOT_DRAFT");
    await expectRejectCode(activate(supervisor, valid, undefined, {
      versionSeleccionParticipantesEsperada: valid.versionSeleccionParticipantes - 1
    }), "ACTIVATION_STALE_SUMMARY");
    await adminDatabase().collection("seleccionesLineasJornada").doc(DRAFT_JOURNEY_ID).delete();
    await expectRejectCode(activate(supervisor, valid), "ACTIVATION_SELECTIONS_INCOMPLETE");
  });

  it("exige lineas, contador y revisor", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-minimums");
    await updateLines(supervisor, DRAFT_JOURNEY_ID, []);
    await updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-supervisor", puedeContar: true}
    ]);
    await expectRejectCode(
      activate(supervisor, await listParticipants(supervisor, DRAFT_JOURNEY_ID)),
      "ACTIVATION_LINES_REQUIRED"
    );

    await seedEmulator();
    await updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-supervisor", puedeContar: false}
    ]);
    await expectRejectCode(
      activate(supervisor, await listParticipants(supervisor, DRAFT_JOURNEY_ID)),
      "ACTIVATION_COUNTER_REQUIRED"
    );

    await seedEmulator();
    await expectRejectCode(
      activate(supervisor, await listParticipants(supervisor, DRAFT_JOURNEY_ID)),
      "ACTIVATION_REVIEWER_REQUIRED"
    );
  });

  it("revalida perfiles inexistentes, inactivos y con rol cambiado", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-profiles");
    const database = adminDatabase();
    let summary = await prepareValid(supervisor);
    await database.collection("usuarios").doc("uid-auxiliar-1").delete();
    await expectRejectCode(activate(supervisor, summary), "ACTIVATION_PARTICIPANT_NOT_FOUND");

    await seedEmulator();
    summary = await prepareValid(supervisor);
    await database.collection("usuarios").doc("uid-auxiliar-1").update({activo: false});
    await expectRejectCode(activate(supervisor, summary), "ACTIVATION_PARTICIPANT_INACTIVE");

    await seedEmulator();
    summary = await prepareValid(supervisor);
    await database.collection("usuarios").doc("uid-auxiliar-1").update({roles: ["SUPERVISOR"]});
    await expectRejectCode(activate(supervisor, summary), "ACTIVATION_PARTICIPANT_ROLE_CHANGED");
  });

  it("revalida lineas inexistentes, inactivas y ocupadas sin escrituras parciales", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-lines");
    const database = adminDatabase();
    let summary = await prepareValid(supervisor);
    const operationalBefore = await database.collection("jornadaLineas").get();
    await database.collection("lineas").doc(FREE_CATALOG_LINE_ID).delete();
    await expectRejectCode(activate(supervisor, summary), "ACTIVATION_LINE_NOT_FOUND");
    expect((await database.collection("jornadaLineas").get()).size).toBe(operationalBefore.size);

    await seedEmulator();
    summary = await prepareValid(supervisor);
    await database.collection("lineas").doc(FREE_CATALOG_LINE_ID).update({activa: false});
    await expectRejectCode(activate(supervisor, summary), "ACTIVATION_LINE_INACTIVE");

    await seedEmulator();
    summary = await prepareValid(supervisor);
    await database.collection("ocupacionesLineasActivas").doc(FREE_CATALOG_LINE_ID).set({
      id: FREE_CATALOG_LINE_ID,
      lineaId: FREE_CATALOG_LINE_ID,
      jornadaId: ACTIVE_JOURNEY_ID,
      activadaPorUsuarioId: "uid-administrador",
      activadaEn: Timestamp.now()
    });
    await expectRejectCode(activate(supervisor, summary), "ACTIVATION_LINE_OCCUPIED");
    expect((await database.collection("jornadas").doc(DRAFT_JOURNEY_ID).get()).data()?.estadoAdministrativo)
      .toBe("BORRADOR");
    expect((await database.collection("auditoria").where("tipo", "==", "JORNADA_ACTIVADA").get()).empty)
      .toBe(true);
  });

  it("rechaza el limite combinado mayor a 200 sin iniciar materializacion", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-limit");
    const database = adminDatabase();
    const summary = await prepareValid(supervisor);
    await database.collection("seleccionesLineasJornada").doc(DRAFT_JOURNEY_ID).update({
      lineaIds: Array.from({length: 199}, (_, index) => `LINEA-LIMITE-${index + 1}`),
      cantidadLineas: 199
    });
    await expectRejectCode(activate(supervisor, summary), "ACTIVATION_LIMIT_EXCEEDED");
    expect((await database.collection("jornadaLineas")
      .where("jornadaId", "==", DRAFT_JOURNEY_ID).get()).empty).toBe(true);
    expect((await database.collection("idempotencia")
      .where("operacion", "==", "ACTIVAR_JORNADA").get()).empty).toBe(true);
  });

  it("recupera el resultado idempotente y detecta conflicto de payload", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-idempotency");
    const summary = await prepareValid(supervisor);
    const key = "activar-idempotente-etapa-12-0001";
    const first = await activate(supervisor, summary, key);
    const second = await activate(supervisor, summary, key);
    expect(second).toEqual(first);
    await expectRejectCode(activate(supervisor, summary, key, {
      versionJornadaEsperada: summary.version + 1
    }), "IDEMPOTENCY_CONFLICT");
    expect((await adminDatabase().collection("auditoria")
      .where("tipo", "==", "JORNADA_ACTIVADA").get()).size).toBe(1);
  });

  it("produce un solo ganador cuando dos borradores compiten por la misma linea", async () => {
    const firstSupervisor = await authenticatedClient("supervisor@prueba.local", "activate-race-a");
    const secondSupervisor = await authenticatedClient("supervisor2@prueba.local", "activate-race-b");
    const firstSummary = await prepareValid(firstSupervisor);
    await updateLines(secondSupervisor, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID, [FREE_CATALOG_LINE_ID]);
    const secondSummary = await prepareValid(
      secondSupervisor,
      OTHER_SUPERVISOR_DRAFT_JOURNEY_ID,
      "uid-auxiliar-2",
      "uid-supervisor-2"
    );

    const outcomes = await Promise.allSettled([
      activate(firstSupervisor, firstSummary, "activar-carrera-a-etapa-12"),
      activate(secondSupervisor, secondSummary, "activar-carrera-b-etapa-12")
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejection?.status === "rejected" ? errorCode(rejection.reason) : undefined)
      .toBe("ACTIVATION_LINE_OCCUPIED");
    const database = adminDatabase();
    const occupation = await database.collection("ocupacionesLineasActivas").doc(FREE_CATALOG_LINE_ID).get();
    const winnerId = occupation.data()?.jornadaId;
    expect([DRAFT_JOURNEY_ID, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID]).toContain(winnerId);
    const operational = await database.collection("jornadaLineas").where("lineaId", "==", FREE_CATALOG_LINE_ID).get();
    expect(operational.size).toBe(1);
    expect((await database.collection("auditoria").where("tipo", "==", "JORNADA_ACTIVADA").get()).size)
      .toBe(1);
  });

  it("hace visible la jornada solo a participantes seleccionados en Campo", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "activate-field-owner");
    const selected = await authenticatedClient("auxiliar1@prueba.local", "activate-field-selected");
    const unselected = await authenticatedClient("sin-acceso@prueba.local", "activate-field-unselected");
    const summary = await prepareValid(supervisor);
    await activate(supervisor, summary);
    const callable = (client: Client) => httpsCallable<Record<string, never>, ListActiveJourneysResult>(
      client.functions,
      "listarJornadasActivas"
    )({});
    expect((await callable(selected)).data.jornadas.map((journey) => journey.jornadaId))
      .toContain(DRAFT_JOURNEY_ID);
    expect((await callable(unselected)).data.jornadas.map((journey) => journey.jornadaId))
      .not.toContain(DRAFT_JOURNEY_ID);
  });
});
