import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ActivateJourneyRequest,
  ActivateJourneyResult,
  CancelDraftJourneyRequest,
  CancelDraftJourneyResult,
  ListDraftJourneyParticipantsRequest,
  ListDraftJourneyParticipantsResult,
  ListManageableJourneysResult,
  ReopenCancelledJourneyRequest,
  ReopenCancelledJourneyResult,
  UpdateDraftJourneyLinesRequest,
  UpdateDraftJourneyParticipantsRequest
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
    appId: `cancel-draft-${name}`,
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

async function cancelDraft(
  client: Client,
  journeyId = DRAFT_JOURNEY_ID,
  version = 1,
  reason = "La preparacion se retomara en otra fecha.",
  key = `cancelar-borrador-${crypto.randomUUID()}`
): Promise<CancelDraftJourneyResult> {
  const callable = httpsCallable<CancelDraftJourneyRequest, CancelDraftJourneyResult>(
    client.functions,
    "cancelarJornadaBorrador"
  );
  return (await callable({
    jornadaId: journeyId,
    versionEsperada: version,
    motivo: reason,
    claveIdempotencia: key
  })).data;
}

async function reopenDraft(
  client: Client,
  journeyId: string,
  version: number,
  key = `reabrir-borrador-${crypto.randomUUID()}`
): Promise<ReopenCancelledJourneyResult> {
  const callable = httpsCallable<ReopenCancelledJourneyRequest, ReopenCancelledJourneyResult>(
    client.functions,
    "reabrirJornadaCancelada"
  );
  return (await callable({jornadaId: journeyId, versionEsperada: version, claveIdempotencia: key})).data;
}

async function listManageable(client: Client): Promise<ListManageableJourneysResult> {
  const callable = httpsCallable<Record<string, never>, ListManageableJourneysResult>(
    client.functions,
    "listarJornadasAdministrables"
  );
  return (await callable({})).data;
}

async function listParticipants(client: Client): Promise<ListDraftJourneyParticipantsResult> {
  const callable = httpsCallable<ListDraftJourneyParticipantsRequest, ListDraftJourneyParticipantsResult>(
    client.functions,
    "listarParticipantesJornadaBorrador"
  );
  return (await callable({jornadaId: DRAFT_JOURNEY_ID})).data;
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
  const app = getAdminApps().find((candidate) => candidate.name === "cancel-draft-tests") ??
    initializeAdminApp({projectId}, "cancel-draft-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("cancelacion y reapertura segura de borradores", () => {
  it("cancela y reabre conservando exactamente las selecciones y la trazabilidad", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "valid");
    const database = adminDatabase();
    const linesBefore = (await database.collection("seleccionesLineasJornada").doc(DRAFT_JOURNEY_ID).get()).data();
    const participantsBefore = (await database.collection("seleccionesParticipantesJornada")
      .doc(DRAFT_JOURNEY_ID).get()).data();
    const inventoryBefore = await database.collection("inventarioOficialLineas").get();
    const movementsBefore = await database.collection("movimientosInventario").get();
    const countsBefore = await database.collection("conteos").get();

    const cancelled = await cancelDraft(supervisor);
    expect(cancelled).toMatchObject({
      jornadaId: DRAFT_JOURNEY_ID,
      estado: "INACTIVA",
      tipoInactivacion: "CANCELACION_BORRADOR",
      version: 2,
      canceladaPorUsuarioId: "uid-supervisor"
    });
    expect((await listManageable(supervisor)).jornadasCanceladas[0]).toMatchObject({
      jornadaId: DRAFT_JOURNEY_ID,
      lineaIds: [FREE_CATALOG_LINE_ID],
      motivoCancelacion: cancelled.motivo,
      participantes: [{usuarioId: "uid-auxiliar-1", puedeContar: true}]
    });
    expect((await database.collection("jornadaLineas").where("jornadaId", "==", DRAFT_JOURNEY_ID).get()).empty)
      .toBe(true);
    expect((await database.collection("jornadas").doc(DRAFT_JOURNEY_ID).collection("autorizaciones").get()).empty)
      .toBe(true);
    expect((await database.collection("ocupacionesLineasActivas").where("jornadaId", "==", DRAFT_JOURNEY_ID).get()).empty)
      .toBe(true);

    const reopened = await reopenDraft(supervisor, DRAFT_JOURNEY_ID, cancelled.version);
    expect(reopened).toMatchObject({
      jornadaId: DRAFT_JOURNEY_ID,
      estado: "BORRADOR",
      version: 3,
      cancelacionAnteriorId: cancelled.cancelacionId
    });
    expect((await listManageable(supervisor)).jornadas.map((journey) => journey.jornadaId))
      .toContain(DRAFT_JOURNEY_ID);
    expect((await database.collection("cancelacionesJornadas").doc(cancelled.cancelacionId).get()).exists).toBe(true);
    expect((await database.collection("seleccionesLineasJornada").doc(DRAFT_JOURNEY_ID).get()).data()).toEqual(linesBefore);
    expect((await database.collection("seleccionesParticipantesJornada").doc(DRAFT_JOURNEY_ID).get()).data())
      .toEqual(participantsBefore);
    expect((await database.collection("inventarioOficialLineas").get()).docs.map((doc) => doc.data()))
      .toEqual(inventoryBefore.docs.map((doc) => doc.data()));
    expect((await database.collection("movimientosInventario").get()).docs.map((doc) => doc.data()))
      .toEqual(movementsBefore.docs.map((doc) => doc.data()));
    expect((await database.collection("conteos").get()).docs.map((doc) => doc.data()))
      .toEqual(countsBefore.docs.map((doc) => doc.data()));
  });

  it("aplica permisos por rol y propiedad", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "auxiliary");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "owner");
    const administrator = await authenticatedClient("administrador@prueba.local", "administrator");
    await expectRejectCode(cancelDraft(auxiliary), "PERMISSION_DENIED");
    await expectRejectCode(cancelDraft(supervisor, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID), "JOURNEY_DRAFT_ACCESS_DENIED");
    const cancelled = await cancelDraft(administrator, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID);
    expect(cancelled.estado).toBe("INACTIVA");
    expect((await listManageable(supervisor)).jornadasCanceladas).toHaveLength(0);
    expect((await listManageable(administrator)).jornadasCanceladas.map((journey) => journey.jornadaId))
      .toContain(OTHER_SUPERVISOR_DRAFT_JOURNEY_ID);
    await expect(reopenDraft(administrator, cancelled.jornadaId, cancelled.version)).resolves.toMatchObject({
      estado: "BORRADOR"
    });
  });

  it("rechaza motivo invalido, campos adicionales y version obsoleta", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "invalid-payload");
    const callable = httpsCallable<Record<string, unknown>, CancelDraftJourneyResult>(
      supervisor.functions,
      "cancelarJornadaBorrador"
    );
    await expectRejectCode(callable({
      jornadaId: DRAFT_JOURNEY_ID,
      versionEsperada: 1,
      motivo: "   ",
      claveIdempotencia: "cancel-invalid-reason-0001"
    }), "DRAFT_CANCELLATION_REASON_REQUIRED");
    await expectRejectCode(callable({
      jornadaId: DRAFT_JOURNEY_ID,
      versionEsperada: 1,
      motivo: "x".repeat(2001),
      claveIdempotencia: "cancel-long-reason-0001"
    }), "DRAFT_CANCELLATION_REASON_REQUIRED");
    await expectRejectCode(callable({
      jornadaId: DRAFT_JOURNEY_ID,
      versionEsperada: 1,
      motivo: "Motivo valido",
      claveIdempotencia: "cancel-extra-field-0001",
      usuarioId: "uid-supervisor"
    }), "INVALID_ARGUMENT");
    await expectRejectCode(cancelDraft(supervisor, DRAFT_JOURNEY_ID, 99), "DRAFT_CANCELLATION_STALE_VERSION");
  });

  it("rechaza estados no permitidos, doble cancelacion y reapertura de cierre normal", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "invalid-state");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "double-cancel");
    await expectRejectCode(cancelDraft(administrator, ACTIVE_JOURNEY_ID, 1), "DRAFT_CANCELLATION_INVALID_STATE");
    const cancelled = await cancelDraft(supervisor);
    await expectRejectCode(
      cancelDraft(supervisor, DRAFT_JOURNEY_ID, cancelled.version, "Otro motivo"),
      "DRAFT_CANCELLATION_INVALID_STATE"
    );
    await expectRejectCode(
      reopenDraft(administrator, "JORNADA-PRUEBA-INACTIVA", 1),
      "DRAFT_REOPEN_INVALID_STATE"
    );
    await adminDatabase().collection("jornadas").doc("JORNADA-CIERRE-NORMAL-CORRUPTA").set({
      id: "JORNADA-CIERRE-NORMAL-CORRUPTA",
      nombreVisible: "Cierre normal",
      creadaPorUsuarioId: "uid-administrador",
      estadoAdministrativo: "INACTIVA",
      tipoInactivacion: "CANCELACION_BORRADOR",
      cancelacionVigenteId: "CANCELACION-CORRUPTA",
      activadaEn: Timestamp.now(),
      cerradaEn: Timestamp.now(),
      version: 2,
      creadaEn: Timestamp.now(),
      actualizadaEn: Timestamp.now()
    });
    await expectRejectCode(
      reopenDraft(administrator, "JORNADA-CIERRE-NORMAL-CORRUPTA", 2),
      "DRAFT_REOPEN_NOT_ALLOWED"
    );
  });

  it("recupera resultados idempotentes y detecta conflicto de payload", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "idempotency");
    const cancelKey = "cancel-idempotency-key-0001";
    const first = await cancelDraft(supervisor, DRAFT_JOURNEY_ID, 1, "Motivo idempotente", cancelKey);
    expect(await cancelDraft(supervisor, DRAFT_JOURNEY_ID, 1, "Motivo idempotente", cancelKey)).toEqual(first);
    await expectRejectCode(
      cancelDraft(supervisor, DRAFT_JOURNEY_ID, 1, "Motivo diferente", cancelKey),
      "IDEMPOTENCY_CONFLICT"
    );
    const reopenKey = "reopen-idempotency-key-0001";
    const reopened = await reopenDraft(supervisor, DRAFT_JOURNEY_ID, first.version, reopenKey);
    expect(await reopenDraft(supervisor, DRAFT_JOURNEY_ID, first.version, reopenKey)).toEqual(reopened);
    await expectRejectCode(
      reopenDraft(supervisor, DRAFT_JOURNEY_ID, first.version + 1, reopenKey),
      "IDEMPOTENCY_CONFLICT"
    );
    expect((await adminDatabase().collection("auditoria").where("tipo", "==", "JORNADA_BORRADOR_CANCELADA").get()).size)
      .toBe(1);
    expect((await adminDatabase().collection("auditoria").where("tipo", "==", "JORNADA_CANCELADA_REABIERTA").get()).size)
      .toBe(1);
  });

  it.each([
    ["jornadaLinea", async () => adminDatabase().collection("jornadaLineas").doc("JL-BORRADOR-BLOQUEO").set({
      jornadaId: DRAFT_JOURNEY_ID,
      lineaId: FREE_CATALOG_LINE_ID
    })],
    ["autorizacion", async () => adminDatabase().collection("jornadas").doc(DRAFT_JOURNEY_ID)
      .collection("autorizaciones").doc("uid-auxiliar-1").set({jornadaId: DRAFT_JOURNEY_ID})],
    ["reserva", async () => adminDatabase().collection("reservas").doc("RESERVA-BORRADOR-BLOQUEO").set({
      jornadaId: DRAFT_JOURNEY_ID,
      estadoReserva: "ACTIVA"
    })],
    ["ocupacion", async () => adminDatabase().collection("ocupacionesLineasActivas").doc(FREE_CATALOG_LINE_ID).set({
      jornadaId: DRAFT_JOURNEY_ID,
      lineaId: FREE_CATALOG_LINE_ID
    })]
  ])("rechaza cancelacion cuando existe %s operativa", async (_name, createBlocker) => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", `operational-${_name}`);
    await createBlocker();
    await expectRejectCode(cancelDraft(supervisor), "DRAFT_CANCELLATION_OPERATIONAL_DATA_EXISTS");
    expect((await adminDatabase().collection("jornadas").doc(DRAFT_JOURNEY_ID).get()).data()?.estadoAdministrativo)
      .toBe("BORRADOR");
    expect((await adminDatabase().collection("cancelacionesJornadas").get()).empty).toBe(true);
  });

  it("compite con activacion y confirma exactamente una operacion sin parciales", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "race-activate");
    const participantCallable = httpsCallable<UpdateDraftJourneyParticipantsRequest, unknown>(
      supervisor.functions,
      "actualizarParticipantesJornadaBorrador"
    );
    await participantCallable({
      jornadaId: DRAFT_JOURNEY_ID,
      participantes: [
        {usuarioId: "uid-auxiliar-1", puedeContar: true},
        {usuarioId: "uid-supervisor", puedeContar: false}
      ],
      claveIdempotencia: "prepare-race-activation-0001"
    });
    const summary = await listParticipants(supervisor);
    const activationCallable = httpsCallable<ActivateJourneyRequest, ActivateJourneyResult>(
      supervisor.functions,
      "activarJornada"
    );
    const outcomes = await Promise.allSettled([
      cancelDraft(supervisor, DRAFT_JOURNEY_ID, summary.version, "Carrera contra activacion"),
      activationCallable({
        jornadaId: DRAFT_JOURNEY_ID,
        versionJornadaEsperada: summary.version,
        versionSeleccionLineasEsperada: summary.versionSeleccionLineas,
        versionSeleccionParticipantesEsperada: summary.versionSeleccionParticipantes,
        claveIdempotencia: "activate-race-cancellation-0001"
      })
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const state = (await adminDatabase().collection("jornadas").doc(DRAFT_JOURNEY_ID).get()).data()
      ?.estadoAdministrativo;
    const operationalLines = await adminDatabase().collection("jornadaLineas")
      .where("jornadaId", "==", DRAFT_JOURNEY_ID).get();
    const cancellations = await adminDatabase().collection("cancelacionesJornadas")
      .where("jornadaId", "==", DRAFT_JOURNEY_ID).get();
    if (state === "ACTIVA") {
      expect(operationalLines.size).toBe(1);
      expect(cancellations.empty).toBe(true);
    } else {
      expect(state).toBe("INACTIVA");
      expect(operationalLines.empty).toBe(true);
      expect(cancellations.size).toBe(1);
    }
  });

  it.each(["lineas", "participantes"])(
    "compite con actualizacion de %s y confirma exactamente una operacion",
    async (kind) => {
      const supervisor = await authenticatedClient("supervisor@prueba.local", `race-${kind}`);
      const update = kind === "lineas"
        ? httpsCallable<UpdateDraftJourneyLinesRequest, unknown>(
            supervisor.functions,
            "actualizarLineasJornadaBorrador"
          )({
            jornadaId: DRAFT_JOURNEY_ID,
            lineaIds: [SECOND_FREE_CATALOG_LINE_ID],
            claveIdempotencia: "update-lines-race-cancel-0001"
          })
        : httpsCallable<UpdateDraftJourneyParticipantsRequest, unknown>(
            supervisor.functions,
            "actualizarParticipantesJornadaBorrador"
          )({
            jornadaId: DRAFT_JOURNEY_ID,
            participantes: [{usuarioId: "uid-auxiliar-2", puedeContar: true}],
            claveIdempotencia: "update-participants-race-cancel-0001"
          });
      const outcomes = await Promise.allSettled([
        cancelDraft(supervisor, DRAFT_JOURNEY_ID, 1, `Carrera contra ${kind}`),
        update
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const journey = (await adminDatabase().collection("jornadas").doc(DRAFT_JOURNEY_ID).get()).data();
      expect(journey?.version).toBe(2);
      expect(["BORRADOR", "INACTIVA"]).toContain(journey?.estadoAdministrativo);
      const cancellations = await adminDatabase().collection("cancelacionesJornadas")
        .where("jornadaId", "==", DRAFT_JOURNEY_ID).get();
      expect(cancellations.size).toBe(journey?.estadoAdministrativo === "INACTIVA" ? 1 : 0);
    }
  );
});
