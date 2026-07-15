import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ApproveCountRequest,
  CloseJourneyRequest,
  CloseJourneyResult,
  ListActiveJourneysResult,
  ReleaseReservationRequest,
  ReserveLineRequest,
  ReserveLineResult,
  ReturnCountRequest,
  SendCountRequest,
  SendCountResult
} from "../src/domain/contracts.js";
import {
  ACTIVE_JOURNEY_ID,
  DEMO_PASSWORD,
  SECOND_ACTIVE_JOURNEY_ID,
  journeyLineId,
  secondJourneyLineId
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
    appId: `close-journey-${name}`,
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

async function closeJourney(
  client: Client,
  journeyId = ACTIVE_JOURNEY_ID,
  version = 1,
  key = `cerrar-jornada-${crypto.randomUUID()}`
): Promise<CloseJourneyResult> {
  const callable = httpsCallable<CloseJourneyRequest, CloseJourneyResult>(client.functions, "cerrarJornada");
  return (await callable({jornadaId: journeyId, versionEsperada: version, claveIdempotencia: key})).data;
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
  const app = getAdminApps().find((candidate) => candidate.name === "close-journey-tests") ??
    initializeAdminApp({projectId}, "close-journey-tests");
  return getFirestore(app);
}

async function prepareClosable(journeyId = ACTIVE_JOURNEY_ID, creatorId = "uid-administrador"): Promise<number> {
  const database = adminDatabase();
  const [journey, lines, reservations] = await Promise.all([
    database.collection("jornadas").doc(journeyId).get(),
    database.collection("jornadaLineas").where("jornadaId", "==", journeyId).get(),
    database.collection("reservas").where("jornadaId", "==", journeyId).get()
  ]);
  const version = journey.data()?.version as number;
  const batch = database.batch();
  batch.update(journey.ref, {creadaPorUsuarioId: creatorId});
  lines.docs.forEach((line) => batch.update(line.ref, {
    activa: true,
    estadoCentral: "APROBADA",
    reservaActivaId: null,
    responsableCorreccionUsuarioId: FieldValue.delete(),
    responsableCorreccionNombreVisible: FieldValue.delete(),
    reasignacionActivaId: FieldValue.delete(),
    reasignadaPorUsuarioId: FieldValue.delete(),
    reasignadaPorNombreVisible: FieldValue.delete(),
    motivoReasignacion: FieldValue.delete()
  }));
  reservations.docs.forEach((reservation) => {
    if (reservation.data().estadoReserva === "ACTIVA") {
      batch.update(reservation.ref, {estadoReserva: "CONSUMIDA", consumidaEn: Timestamp.now()});
    }
  });
  await batch.commit();
  return version;
}

async function createPendingCount(author: Client): Promise<SendCountResult> {
  const reserve = httpsCallable<ReserveLineRequest, ReserveLineResult>(author.functions, "reservarLinea");
  const reservation = (await reserve({
    jornadaLineaId: journeyLineId(1),
    dispositivoId: "DISPOSITIVO-CIERRE-001",
    claveIdempotencia: `reservar-cierre-${crypto.randomUUID()}`
  })).data;
  const send = httpsCallable<SendCountRequest, SendCountResult>(author.functions, "enviarConteo");
  return (await send({
    reservaId: reservation.reservaId,
    tokenReserva: reservation.tokenReserva,
    dispositivoId: "DISPOSITIVO-CIERRE-001",
    hembras: 500,
    machos: 300,
    patrones: 200,
    observaciones: "Conteo ficticio para carrera de cierre.",
    timestampDispositivo: "2026-07-15T15:00:00.000-05:00",
    claveIdempotencia: `enviar-cierre-${crypto.randomUUID()}`
  })).data;
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("cierre seguro y atomico de jornadas activas", () => {
  it("cierra una jornada aprobada, conserva historia y libera exactamente sus ocupaciones", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-valid");
    const database = adminDatabase();
    const version = await prepareClosable();
    const protectedBefore = await Promise.all([
      database.collection("inventarioOficialLineas").get(),
      database.collection("movimientosInventario").get(),
      database.collection("conteos").get(),
      database.collection("decisionesRevision").get(),
      database.collection("reservas").get()
    ]);

    const result = await closeJourney(administrator, ACTIVE_JOURNEY_ID, version, "cerrar-valida-etapa-13-0001");

    expect(result).toMatchObject({
      jornadaId: ACTIVE_JOURNEY_ID,
      estado: "INACTIVA",
      version: version + 1,
      cantidadLineas: 3,
      ocupacionesLiberadas: 3
    });
    expect((await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data()).toMatchObject({
      estadoAdministrativo: "INACTIVA",
      cerradaPorUsuarioId: "uid-administrador",
      version: version + 1
    });
    const lines = await database.collection("jornadaLineas").where("jornadaId", "==", ACTIVE_JOURNEY_ID).get();
    expect(lines.docs.every((line) => line.data().activa === false && line.data().estadoCentral === "APROBADA"))
      .toBe(true);
    const authorizations = await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID)
      .collection("autorizaciones").get();
    expect(authorizations.docs.every((authorization) => authorization.data().activa === false)).toBe(true);
    expect((await database.collection("ocupacionesLineasActivas")
      .where("jornadaId", "==", ACTIVE_JOURNEY_ID).get()).empty).toBe(true);
    const protectedAfter = await Promise.all([
      database.collection("inventarioOficialLineas").get(),
      database.collection("movimientosInventario").get(),
      database.collection("conteos").get(),
      database.collection("decisionesRevision").get(),
      database.collection("reservas").get()
    ]);
    expect(protectedAfter.map((snapshot) => snapshot.docs.map((document) => [document.id, document.data()])))
      .toEqual(protectedBefore.map((snapshot) => snapshot.docs.map((document) => [document.id, document.data()])));
  });

  it("aplica permisos a supervisor propietario, supervisor ajeno, administrador y auxiliar", async () => {
    const owner = await authenticatedClient("supervisor@prueba.local", "close-owner");
    const other = await authenticatedClient("supervisor2@prueba.local", "close-other");
    const administrator = await authenticatedClient("administrador@prueba.local", "close-admin");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "close-aux");
    let version = await prepareClosable(ACTIVE_JOURNEY_ID, "uid-supervisor");
    await expect(closeJourney(owner, ACTIVE_JOURNEY_ID, version)).resolves.toMatchObject({estado: "INACTIVA"});

    await seedEmulator();
    version = await prepareClosable(ACTIVE_JOURNEY_ID, "uid-supervisor");
    await expectRejectCode(closeJourney(other, ACTIVE_JOURNEY_ID, version), "JOURNEY_CLOSE_ACCESS_DENIED");
    await expect(closeJourney(administrator, ACTIVE_JOURNEY_ID, version)).resolves.toMatchObject({estado: "INACTIVA"});

    await seedEmulator();
    version = await prepareClosable();
    await expectRejectCode(closeJourney(auxiliary, ACTIVE_JOURNEY_ID, version), "PERMISSION_DENIED");
  });

  it("rechaza jornada inactiva y version obsoleta", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-state");
    const version = await prepareClosable();
    await expectRejectCode(closeJourney(administrator, ACTIVE_JOURNEY_ID, version + 1), "JOURNEY_CLOSE_STALE_VERSION");
    await adminDatabase().collection("jornadas").doc(ACTIVE_JOURNEY_ID).update({estadoAdministrativo: "INACTIVA"});
    await expectRejectCode(closeJourney(administrator, ACTIVE_JOURNEY_ID, version), "JOURNEY_NOT_ACTIVE");
  });

  it.each(["DISPONIBLE", "EN_CONTEO", "PENDIENTE_REVISION", "DEVUELTA"])(
    "rechaza el estado bloqueante %s sin escrituras parciales",
    async (state) => {
      const administrator = await authenticatedClient("administrador@prueba.local", `close-block-${state}`);
      const version = await prepareClosable();
      await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).update({estadoCentral: state});
      await expectRejectCode(closeJourney(administrator, ACTIVE_JOURNEY_ID, version), "JOURNEY_CLOSE_PENDING_LINES");
      expect((await adminDatabase().collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data()?.estadoAdministrativo)
        .toBe("ACTIVA");
      expect((await adminDatabase().collection("ocupacionesLineasActivas").doc("LINEA-PRUEBA-1").get()).exists)
        .toBe(true);
    }
  );

  it("rechaza reservas activas y responsabilidades de correccion pendientes", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-blockers");
    let version = await prepareClosable();
    await adminDatabase().collection("reservas").doc("RESERVA-BLOQUEO-CIERRE").set({
      id: "RESERVA-BLOQUEO-CIERRE",
      jornadaId: ACTIVE_JOURNEY_ID,
      jornadaLineaId: journeyLineId(1),
      estadoReserva: "ACTIVA"
    });
    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version),
      "JOURNEY_CLOSE_ACTIVE_RESERVATIONS"
    );

    await seedEmulator();
    version = await prepareClosable();
    await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).update({
      responsableCorreccionUsuarioId: "uid-auxiliar-1",
      reasignacionActivaId: "REASIGNACION-PENDIENTE-CIERRE"
    });
    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version),
      "JOURNEY_CLOSE_PENDING_CORRECTIONS"
    );
  });

  it("recupera resultado idempotente y rechaza reutilizar la clave con otro payload", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-idempotency");
    const version = await prepareClosable();
    const key = "cerrar-idempotente-etapa-13-0001";
    const first = await closeJourney(administrator, ACTIVE_JOURNEY_ID, version, key);
    expect(await closeJourney(administrator, ACTIVE_JOURNEY_ID, version, key)).toEqual(first);
    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version + 1, key),
      "IDEMPOTENCY_CONFLICT"
    );
    expect((await adminDatabase().collection("auditoria").where("tipo", "==", "JORNADA_CERRADA").get()).size)
      .toBe(1);
  });

  it("dos cierres concurrentes producen un solo efecto", async () => {
    const first = await authenticatedClient("administrador@prueba.local", "close-race-a");
    const second = await authenticatedClient("administrador@prueba.local", "close-race-b");
    const version = await prepareClosable();
    const outcomes = await Promise.allSettled([
      closeJourney(first, ACTIVE_JOURNEY_ID, version, "cerrar-carrera-a-etapa-13"),
      closeJourney(second, ACTIVE_JOURNEY_ID, version, "cerrar-carrera-b-etapa-13")
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejection?.status === "rejected" ? errorCode(rejection.reason) : undefined).toBe("JOURNEY_NOT_ACTIVE");
    expect((await adminDatabase().collection("auditoria").where("tipo", "==", "JORNADA_CERRADA").get()).size)
      .toBe(1);
  });

  it("un bloqueo de ocupacion inconsistente impide todo el cierre", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-occupation");
    const version = await prepareClosable();
    await adminDatabase().collection("ocupacionesLineasActivas").doc("LINEA-PRUEBA-1").delete();
    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version),
      "JOURNEY_CLOSE_OCCUPATION_MISMATCH"
    );
    expect((await adminDatabase().collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data()?.estadoAdministrativo)
      .toBe("ACTIVA");
    expect((await adminDatabase().collection("jornadaLineas").where("jornadaId", "==", ACTIVE_JOURNEY_ID).get())
      .docs.every((line) => line.data().activa === true)).toBe(true);
    expect((await adminDatabase().collection("auditoria").where("tipo", "==", "JORNADA_CERRADA").get()).empty)
      .toBe(true);
  });

  it("compite sin cierre parcial contra reservar, enviar, aprobar, devolver y liberar", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-operations-admin");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "close-operations-aux");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "close-operations-supervisor");

    const reserve = httpsCallable<ReserveLineRequest, ReserveLineResult>(auxiliary.functions, "reservarLinea");
    let outcomes: PromiseSettledResult<unknown>[] = await Promise.allSettled([
      closeJourney(administrator, SECOND_ACTIVE_JOURNEY_ID, 1, "cerrar-vs-reservar-etapa-13"),
      reserve({
        jornadaLineaId: secondJourneyLineId(1),
        dispositivoId: "DISPOSITIVO-CIERRE-CARRERA",
        claveIdempotencia: "reservar-vs-cerrar-etapa-13"
      })
    ]);
    expect(outcomes[0]?.status === "rejected" ? errorCode(outcomes[0].reason) : undefined)
      .toBe("JOURNEY_CLOSE_PENDING_LINES");
    expect(outcomes[1]?.status).toBe("fulfilled");

    await seedEmulator();
    const pending = await createPendingCount(auxiliary);
    const approve = httpsCallable<ApproveCountRequest, unknown>(supervisor.functions, "aprobarConteo");
    outcomes = await Promise.allSettled([
      closeJourney(administrator, ACTIVE_JOURNEY_ID, 1, "cerrar-vs-aprobar-etapa-13"),
      approve({conteoId: pending.conteoId, claveIdempotencia: "aprobar-vs-cerrar-etapa-13"})
    ]);
    expect(outcomes[0]?.status === "rejected" ? errorCode(outcomes[0].reason) : undefined)
      .toBe("JOURNEY_CLOSE_PENDING_LINES");
    expect(outcomes[1]?.status).toBe("fulfilled");

    await seedEmulator();
    const returned = await createPendingCount(auxiliary);
    const returnCount = httpsCallable<ReturnCountRequest, unknown>(supervisor.functions, "devolverConteo");
    outcomes = await Promise.allSettled([
      closeJourney(administrator, ACTIVE_JOURNEY_ID, 1, "cerrar-vs-devolver-etapa-13"),
      returnCount({
        conteoId: returned.conteoId,
        motivo: "Repetir conteo ficticio.",
        claveIdempotencia: "devolver-vs-cerrar-etapa-13"
      })
    ]);
    expect(outcomes[0]?.status === "rejected" ? errorCode(outcomes[0].reason) : undefined)
      .toBe("JOURNEY_CLOSE_PENDING_LINES");
    expect(outcomes[1]?.status).toBe("fulfilled");

    await seedEmulator();
    const initialReservation = (await reserve({
      jornadaLineaId: journeyLineId(1),
      dispositivoId: "DISPOSITIVO-CIERRE-CARRERA",
      claveIdempotencia: "reservar-antes-enviar-vs-cerrar"
    })).data;
    const send = httpsCallable<SendCountRequest, unknown>(auxiliary.functions, "enviarConteo");
    outcomes = await Promise.allSettled([
      closeJourney(administrator, ACTIVE_JOURNEY_ID, 1, "cerrar-vs-enviar-etapa-13"),
      send({
        reservaId: initialReservation.reservaId,
        tokenReserva: initialReservation.tokenReserva,
        dispositivoId: "DISPOSITIVO-CIERRE-CARRERA",
        hembras: 1,
        machos: 2,
        patrones: 3,
        timestampDispositivo: "2026-07-15T15:00:00.000-05:00",
        claveIdempotencia: "enviar-vs-cerrar-etapa-13"
      })
    ]);
    expect(outcomes[0]?.status === "rejected" ? errorCode(outcomes[0].reason) : undefined)
      .toBe("JOURNEY_CLOSE_PENDING_LINES");
    expect(outcomes[1]?.status).toBe("fulfilled");

    await seedEmulator();
    const release = httpsCallable<ReleaseReservationRequest, unknown>(supervisor.functions, "liberarReservaLinea");
    outcomes = await Promise.allSettled([
      closeJourney(administrator, ACTIVE_JOURNEY_ID, 1, "cerrar-vs-liberar-etapa-13"),
      release({
        reservaId: "RESERVA-PRUEBA-PREEXISTENTE",
        motivo: "Prueba de carrera con cierre.",
        claveIdempotencia: "liberar-vs-cerrar-etapa-13"
      })
    ]);
    expect(outcomes[0]?.status === "rejected" ? errorCode(outcomes[0].reason) : undefined)
      .toBe("JOURNEY_CLOSE_PENDING_LINES");
    expect(outcomes[1]?.status).toBe("fulfilled");
    expect((await adminDatabase().collection("auditoria").where("tipo", "==", "JORNADA_CERRADA").get()).empty)
      .toBe(true);
  }, 30_000);

  it("desaparece de Campo y sus lineas liberadas vuelven al catalogo de borradores", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-visibility-admin");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "close-visibility-aux");
    const version = await prepareClosable();
    await closeJourney(administrator, ACTIVE_JOURNEY_ID, version);
    const listActive = httpsCallable<Record<string, never>, ListActiveJourneysResult>(
      auxiliary.functions,
      "listarJornadasActivas"
    );
    expect((await listActive({})).data.jornadas.map((journey) => journey.jornadaId))
      .not.toContain(ACTIVE_JOURNEY_ID);
    const listManageable = httpsCallable<Record<string, never>, {lineasCatalogo: Array<{
      lineaId: string;
      seleccionable: boolean;
    }>}> (administrator.functions, "listarJornadasAdministrables");
    const catalog = (await listManageable({})).data.lineasCatalogo;
    expect(catalog.filter((line) => ["LINEA-PRUEBA-1", "LINEA-PRUEBA-2", "LINEA-PRUEBA-3"].includes(line.lineaId)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({lineaId: "LINEA-PRUEBA-1", seleccionable: true}),
        expect.objectContaining({lineaId: "LINEA-PRUEBA-2", seleccionable: true}),
        expect.objectContaining({lineaId: "LINEA-PRUEBA-3", seleccionable: true})
      ]));
  });
});
