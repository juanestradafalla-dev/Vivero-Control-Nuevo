import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ListActiveJourneysResult,
  ListDraftJourneyParticipantsRequest,
  ListDraftJourneyParticipantsResult,
  UpdateDraftJourneyParticipantsRequest,
  UpdateDraftJourneyParticipantsResult
} from "../src/domain/contracts.js";
import {
  DEMO_PASSWORD,
  DRAFT_JOURNEY_ID,
  OTHER_SUPERVISOR_DRAFT_JOURNEY_ID
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
    appId: `draft-participant-${name}`,
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

async function listParticipants(
  client: Client,
  journeyId = DRAFT_JOURNEY_ID
): Promise<ListDraftJourneyParticipantsResult> {
  const callable = httpsCallable<ListDraftJourneyParticipantsRequest, ListDraftJourneyParticipantsResult>(
    client.functions,
    "listarParticipantesJornadaBorrador"
  );
  return (await callable({jornadaId: journeyId})).data;
}

async function updateParticipants(
  client: Client,
  journeyId: string,
  participants: UpdateDraftJourneyParticipantsRequest["participantes"],
  key = `participantes-${crypto.randomUUID()}`
): Promise<UpdateDraftJourneyParticipantsResult> {
  const callable = httpsCallable<UpdateDraftJourneyParticipantsRequest, UpdateDraftJourneyParticipantsResult>(
    client.functions,
    "actualizarParticipantesJornadaBorrador"
  );
  return (await callable({jornadaId: journeyId, participantes: participants, claveIdempotencia: key})).data;
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
  const app = getAdminApps().find((candidate) => candidate.name === "draft-participant-tests") ??
    initializeAdminApp({projectId}, "draft-participant-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("participantes de jornadas en borrador mediante emuladores", () => {
  it("aplica permisos por rol y aislamiento entre supervisores", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "participants-aux");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "participants-owner");
    await expectRejectCode(listParticipants(auxiliary), "PERMISSION_DENIED");
    await expectRejectCode(
      listParticipants(supervisor, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID),
      "JOURNEY_DRAFT_ACCESS_DENIED"
    );
    await expectRejectCode(
      updateParticipants(supervisor, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID, [
        {usuarioId: "uid-auxiliar-2", puedeContar: true}
      ]),
      "JOURNEY_DRAFT_ACCESS_DENIED"
    );
  });

  it("permite al administrador consultar y actualizar cualquier borrador", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "participants-admin");
    await expect(listParticipants(administrator, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID)).resolves.toMatchObject({
      jornadaId: OTHER_SUPERVISOR_DRAFT_JOURNEY_ID,
      estado: "BORRADOR"
    });
    await expect(updateParticipants(administrator, OTHER_SUPERVISOR_DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-auxiliar-2", puedeContar: false}
    ])).resolves.toMatchObject({cantidadParticipantes: 1, version: 2});
  });

  it("obtiene nombre y rol centrales y guarda solo preparacion", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "participants-central");
    const database = adminDatabase();
    const listed = await listParticipants(supervisor);
    expect(listed.usuariosActivos).toContainEqual({
      usuarioId: "uid-auxiliar-1",
      nombreVisible: "Auxiliar ficticio 1",
      rol: "AUXILIAR"
    });
    expect(listed.usuariosActivos.map((user) => user.usuarioId)).not.toContain("uid-inactivo-prueba");
    const result = await updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-auxiliar-2", puedeContar: true},
      {usuarioId: "uid-administrador", puedeContar: false}
    ]);
    expect(result.participantes).toEqual([
      {
        usuarioId: "uid-administrador",
        nombreVisible: "Administrador ficticio",
        rol: "ADMINISTRADOR",
        puedeContar: false
      },
      {
        usuarioId: "uid-auxiliar-2",
        nombreVisible: "Auxiliar ficticio 2",
        rol: "AUXILIAR",
        puedeContar: true
      }
    ]);
    expect((await database.collection("seleccionesParticipantesJornada").doc(DRAFT_JOURNEY_ID).get()).data())
      .toMatchObject({participantes: result.participantes, cantidadParticipantes: 2});
    expect((await database.collection("jornadas").doc(DRAFT_JOURNEY_ID)
      .collection("autorizaciones").get()).empty).toBe(true);
  });

  it("rechaza usuarios inexistentes, inactivos, duplicados y campos adicionales", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "participants-invalid");
    await expectRejectCode(updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-inexistente", puedeContar: true}
    ]), "PARTICIPANT_NOT_FOUND");
    await expectRejectCode(updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-inactivo-prueba", puedeContar: true}
    ]), "PARTICIPANT_INACTIVE");
    await expectRejectCode(updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-auxiliar-1", puedeContar: true},
      {usuarioId: "uid-auxiliar-1", puedeContar: false}
    ]), "DUPLICATE_PARTICIPANT_IDS");
    const rawCallable = httpsCallable<Record<string, unknown>, UpdateDraftJourneyParticipantsResult>(
      supervisor.functions,
      "actualizarParticipantesJornadaBorrador"
    );
    await expectRejectCode(rawCallable({
      jornadaId: DRAFT_JOURNEY_ID,
      participantes: [{usuarioId: "uid-auxiliar-1", puedeContar: true, rol: "ADMINISTRADOR"}],
      claveIdempotencia: "participantes-campo-adicional-0001"
    }), "INVALID_ARGUMENT");
    const rawListCallable = httpsCallable<Record<string, unknown>, ListDraftJourneyParticipantsResult>(
      supervisor.functions,
      "listarParticipantesJornadaBorrador"
    );
    await expectRejectCode(rawListCallable({
      jornadaId: DRAFT_JOURNEY_ID,
      usuarioId: "uid-auxiliar-1"
    }), "INVALID_ARGUMENT");
  });

  it("recupera el resultado idempotente y rechaza otro payload", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "participants-idempotency");
    const key = "participantes-idempotentes-0001";
    const first = await updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-auxiliar-2", puedeContar: true}
    ], key);
    const second = await updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-auxiliar-2", puedeContar: true}
    ], key);
    expect(second).toEqual(first);
    await expectRejectCode(updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-auxiliar-2", puedeContar: false}
    ], key), "IDEMPOTENCY_CONFLICT");
    expect((await adminDatabase().collection("auditoria")
      .where("tipo", "==", "PARTICIPANTES_JORNADA_BORRADOR_ACTUALIZADOS").get()).size).toBe(1);
  });

  it("no crea efectos operativos y Campo sigue sin mostrar borradores", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "participants-no-effects");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "participants-field");
    const database = adminDatabase();
    const collections = [
      "jornadaLineas",
      "reservas",
      "conteos",
      "inventarioOficialLineas",
      "movimientosInventario"
    ];
    const before = await Promise.all(collections.map((name) => database.collection(name).get()));
    await updateParticipants(supervisor, DRAFT_JOURNEY_ID, [
      {usuarioId: "uid-auxiliar-2", puedeContar: true}
    ]);
    const after = await Promise.all(collections.map((name) => database.collection(name).get()));
    expect(after.map((snapshot) => snapshot.docs.map((document) => document.id)))
      .toEqual(before.map((snapshot) => snapshot.docs.map((document) => document.id)));
    const callable = httpsCallable<Record<string, never>, ListActiveJourneysResult>(
      auxiliary.functions,
      "listarJornadasActivas"
    );
    const active = (await callable({})).data;
    expect(active.jornadas.map((journey) => journey.jornadaId)).not.toContain(DRAFT_JOURNEY_ID);
  });
});
