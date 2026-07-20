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
  ClosedJourneyResult,
  ListActiveJourneysResult,
  RegisterDiscardRequest,
  RegisterDiscardResult,
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
): Promise<ClosedJourneyResult> {
  const callable = httpsCallable<CloseJourneyRequest, CloseJourneyResult>(client.functions, "cerrarJornada");
  const result = (await callable({jornadaId: journeyId, versionEsperada: version, claveIdempotencia: key})).data;
  if (result.estado === "INACTIVA") return result;
  const database = adminDatabase();
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const job = (await database.collection("trabajosCierreJornada").doc(journeyId).get()).data();
    if (job?.estado === "ERROR") throw new Error("El worker marco el cierre con error.");
    if (job?.estado === "COMPLETADO" && typeof job.idempotenciaId === "string") {
      const completed = (await database.collection("idempotencia").doc(job.idempotenciaId).get())
        .data()?.resultado as ClosedJourneyResult | undefined;
      if (!completed || completed.estado !== "INACTIVA") throw new Error("El worker no completo el cierre.");
      return completed;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("El worker no completo el cierre dentro de la ventana de prueba.");
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

async function prepareConfiguredClosable(
  source: "CONTEO_FISICO" | "DESCARTES_APROBADOS"
): Promise<number> {
  const version = await prepareClosable();
  const database = adminDatabase();
  const lines = await database.collection("jornadaLineas").where("jornadaId", "==", ACTIVE_JOURNEY_ID).get();
  const activatedAt = Timestamp.fromDate(new Date("2026-07-01T12:00:00.000Z"));
  const receivedAt = Timestamp.fromDate(new Date("2026-07-15T12:00:00.000Z"));
  const batch = database.batch();
  batch.update(database.collection("jornadas").doc(ACTIVE_JOURNEY_ID), {
    activadaEn: activatedAt,
    configuracionInformeInventario: {
      habilitado: true,
      mes: 7,
      anio: 2026,
      fuentePlantasMuertas: source
    }
  });
  lines.docs.forEach((line, index) => {
    const countId = `CONTEO-INFORME-CIERRE-${index + 1}`;
    batch.update(line.ref, {conteoVigenteId: countId});
    batch.set(database.collection("conteos").doc(countId), {
      id: countId,
      jornadaId: ACTIVE_JOURNEY_ID,
      jornadaLineaId: line.id,
      lineaId: line.data().lineaId,
      hembras: 100 + index,
      machos: 50 + index,
      patrones: 25 + index,
      total: 175 + (index * 3),
      ...(source === "CONTEO_FISICO" ? {plantasMuertas: 4 + index} : {}),
      observaciones: `Conteo ficticio ${index + 1}`,
      recibidoEn: receivedAt,
      inmutable: true
    });
  });
  await batch.commit();
  return version;
}

async function createAssociatedDiscard(
  state: "PENDIENTE_REVISION" | "APROBADO" | "DEVUELTO",
  deadPlants: number
): Promise<string> {
  const database = adminDatabase();
  const id = `DESCARTE-CIERRE-${state}-${crypto.randomUUID()}`;
  await database.collection("descartes").doc(id).set({
    id,
    jornadaId: ACTIVE_JOURNEY_ID,
    jornadaLineaId: journeyLineId(1),
    lineaId: "LINEA-PRUEBA-1",
    hembras: deadPlants + 5,
    machos: 0,
    patrones: 0,
    totalUnico: deadPlants + 5,
    causas: {
      muertos: deadPlants,
      nematodos: 5,
      cuelloGanso: 0,
      raicesBifurcadas: 0,
      dobleInjertacion: 0
    },
    estado: state,
    capturaInmutable: true,
    recibidoEn: Timestamp.fromDate(new Date("2026-07-16T12:00:00.000Z"))
  });
  return id;
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
  it("CERRANDO bloquea reserva, envio y liberacion", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "close-block-aux");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "close-block-supervisor");
    const reserve = httpsCallable<ReserveLineRequest, ReserveLineResult>(auxiliary.functions, "reservarLinea");
    const reservation = (await reserve({
      jornadaLineaId: journeyLineId(1),
      dispositivoId: "DISPOSITIVO-CIERRE-BLOQUEO",
      claveIdempotencia: "reservar-antes-cerrando-bloqueo"
    })).data;
    await adminDatabase().collection("jornadas").doc(ACTIVE_JOURNEY_ID).update({
      estadoAdministrativo: "CERRANDO"
    });
    await expectRejectCode(reserve({
      jornadaLineaId: journeyLineId(2),
      dispositivoId: "DISPOSITIVO-CIERRE-BLOQUEO",
      claveIdempotencia: "reservar-durante-cerrando-bloqueo"
    }), "JOURNEY_NOT_ACTIVE");
    await expectRejectCode(httpsCallable<SendCountRequest, unknown>(auxiliary.functions, "enviarConteo")({
      reservaId: reservation.reservaId,
      tokenReserva: reservation.tokenReserva,
      dispositivoId: "DISPOSITIVO-CIERRE-BLOQUEO",
      hembras: 1,
      machos: 1,
      patrones: 1,
      timestampDispositivo: "2026-07-15T15:00:00.000-05:00",
      claveIdempotencia: "enviar-durante-cerrando-bloqueo"
    }), "JOURNEY_NOT_ACTIVE");
    await expectRejectCode(httpsCallable<ReleaseReservationRequest, unknown>(
      supervisor.functions, "liberarReservaLinea"
    )({
      reservaId: reservation.reservaId,
      motivo: "La jornada esta cerrando.",
      claveIdempotencia: "liberar-durante-cerrando-bloqueo"
    }), "JOURNEY_NOT_ACTIVE");
  });

  it("CERRANDO bloquea iniciar y reasignar correcciones", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "close-block-correction-aux");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "close-block-correction-supervisor");
    const pending = await createPendingCount(auxiliary);
    await httpsCallable<ReturnCountRequest, unknown>(supervisor.functions, "devolverConteo")({
      conteoId: pending.conteoId,
      motivo: "Preparar una correccion ficticia.",
      claveIdempotencia: "devolver-antes-cerrando-bloqueo"
    });
    await adminDatabase().collection("jornadas").doc(ACTIVE_JOURNEY_ID).update({
      estadoAdministrativo: "CERRANDO"
    });
    await expectRejectCode(httpsCallable<Record<string, unknown>, unknown>(
      auxiliary.functions, "iniciarCorreccionConteo"
    )({
      conteoId: pending.conteoId,
      dispositivoId: "DISPOSITIVO-CIERRE-BLOQUEO",
      claveIdempotencia: "corregir-durante-cerrando-bloqueo"
    }), "JOURNEY_NOT_ACTIVE");
    await expectRejectCode(httpsCallable<Record<string, unknown>, unknown>(
      supervisor.functions, "reasignarCorreccionConteo"
    )({
      conteoId: pending.conteoId,
      nuevoUsuarioId: "uid-auxiliar-2",
      motivo: "No debe reasignarse durante el cierre.",
      claveIdempotencia: "reasignar-durante-cerrando-bloqueo"
    }), "JOURNEY_NOT_ACTIVE");
  });

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
    expect(["JOURNEY_NOT_ACTIVE", "JOURNEY_CLOSE_IN_PROGRESS"])
      .toContain(rejection?.status === "rejected" ? errorCode(rejection.reason) : undefined);
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
  });

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

  it("cierra CONTEO_FISICO y crea un unico job determinista con fotografia estable", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-report-physical");
    const version = await prepareConfiguredClosable("CONTEO_FISICO");
    const key = "cerrar-informe-fisico-idempotente-0001";
    const first = await closeJourney(administrator, ACTIVE_JOURNEY_ID, version, key);
    const repeated = await closeJourney(administrator, ACTIVE_JOURNEY_ID, version, key);
    const database = adminDatabase();
    const report = await database.collection("informesInventario").doc(ACTIVE_JOURNEY_ID).get();

    expect(repeated).toEqual(first);
    expect(first.informeInventario).toMatchObject({
      informeId: ACTIVE_JOURNEY_ID,
      estado: "PENDIENTE",
      mes: 7,
      anio: 2026,
      fuentePlantasMuertas: "CONTEO_FISICO",
      intentos: 0
    });
    expect(report.exists).toBe(true);
    expect(report.data()).toMatchObject({
      id: ACTIVE_JOURNEY_ID,
      responsableUsuarioId: "uid-administrador",
      responsableNombreVisible: "Administrador ficticio",
      versionJornadaCierre: version + 1
    });
    expect(report.data()?.lineas).toEqual(expect.arrayContaining([
      expect.objectContaining({jornadaLineaId: journeyLineId(1), plantasMuertas: 4})
    ]));
    expect((await database.collection("informesInventario").get()).size).toBe(1);
  });

  it("bloquea descartes pendientes y suma solo causas.muertos aprobadas dentro del periodo", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-report-discards");
    const version = await prepareConfiguredClosable("DESCARTES_APROBADOS");
    const pendingId = await createAssociatedDiscard("PENDIENTE_REVISION", 6);
    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version, "cerrar-descartes-pendientes-0001"),
      "INVENTORY_REPORT_PENDING_DISCARDS"
    );
    expect((await adminDatabase().collection("informesInventario").doc(ACTIVE_JOURNEY_ID).get()).exists)
      .toBe(false);

    await adminDatabase().collection("descartes").doc(pendingId).update({
      estado: "APROBADO",
      recibidoEn: Timestamp.fromDate(new Date("2026-06-30T23:59:59.000Z"))
    });
    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version, "cerrar-descarte-fuera-periodo-0001"),
      "INVENTORY_REPORT_COUNT_INCOMPATIBLE"
    );

    await adminDatabase().collection("descartes").doc(pendingId).update({
      recibidoEn: Timestamp.fromDate(new Date("2026-07-16T12:00:00.000Z"))
    });
    await createAssociatedDiscard("DEVUELTO", 90);
    const result = await closeJourney(
      administrator, ACTIVE_JOURNEY_ID, version, "cerrar-descartes-aprobados-0001"
    );
    const report = await adminDatabase().collection("informesInventario").doc(ACTIVE_JOURNEY_ID).get();
    expect(result.informeInventario?.fuentePlantasMuertas).toBe("DESCARTES_APROBADOS");
    expect(report.data()?.lineas).toEqual(expect.arrayContaining([
      expect.objectContaining({jornadaLineaId: journeyLineId(1), plantasMuertas: 6})
    ]));
  });

  it("serializa la carrera entre cerrar y registrar un descarte asociado", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-discard-race-admin");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "close-discard-race-author");
    const version = await prepareConfiguredClosable("DESCARTES_APROBADOS");
    const registerDiscard = httpsCallable<RegisterDiscardRequest, RegisterDiscardResult>(
      auxiliary.functions, "registrarDescarte"
    );
    const [closeOutcome, registerOutcome] = await Promise.allSettled([
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version, "cerrar-carrera-descarte-0001"),
      registerDiscard({
        lineaId: "LINEA-PRUEBA-1",
        versionInventarioObservada: 1,
        dispositivoId: "DISPOSITIVO-CARRERA-DESCARTE",
        hembras: 1,
        machos: 0,
        patrones: 0,
        causas: {
          muertos: 1,
          nematodos: 0,
          cuelloGanso: 0,
          raicesBifurcadas: 0,
          dobleInjertacion: 0
        },
        timestampDispositivo: "2026-07-18T08:00:00.000-05:00",
        claveIdempotencia: "registrar-carrera-cierre-0001"
      })
    ]);
    const database = adminDatabase();
    if (registerOutcome.status === "fulfilled") {
      const discard = await database.collection("descartes").doc(registerOutcome.value.data.descarteId).get();
      const associatedWithJourney = discard.data()?.jornadaId === ACTIVE_JOURNEY_ID;
      if (associatedWithJourney) {
        expect(closeOutcome.status).toBe("rejected");
        if (closeOutcome.status === "rejected") {
          expect(errorCode(closeOutcome.reason)).toBe("INVENTORY_REPORT_PENDING_DISCARDS");
        }
        expect((await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data()?.estadoAdministrativo)
          .toBe("ACTIVA");
        expect((await database.collection("informesInventario").doc(ACTIVE_JOURNEY_ID).get()).exists)
          .toBe(false);
      } else {
        expect(closeOutcome.status).toBe("fulfilled");
        expect((await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data()?.estadoAdministrativo)
          .toBe("INACTIVA");
        expect((await database.collection("informesInventario").doc(ACTIVE_JOURNEY_ID).get()).exists)
          .toBe(true);
      }
    } else {
      expect(closeOutcome.status).toBe("fulfilled");
      expect(["JOURNEY_CLOSE_IN_PROGRESS", "JOURNEY_NOT_ACTIVE"])
        .toContain(errorCode(registerOutcome.reason));
      expect((await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data()?.estadoAdministrativo)
        .toBe("INACTIVA");
      expect((await database.collection("informesInventario").doc(ACTIVE_JOURNEY_ID).get()).exists)
        .toBe(true);
    }
  });

  it("rechaza cerrar CONTEO_FISICO si el conteo aprobado no congela plantas muertas", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-report-invalid-count");
    const version = await prepareConfiguredClosable("CONTEO_FISICO");
    await adminDatabase().collection("conteos").doc("CONTEO-INFORME-CIERRE-1").update({
      plantasMuertas: FieldValue.delete()
    });
    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version, "cerrar-conteo-incompatible-0001"),
      "INVENTORY_REPORT_COUNT_INCOMPATIBLE"
    );
    expect((await adminDatabase().collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data())
      .toMatchObject({estadoAdministrativo: "ACTIVA"});
  });

  it("rechaza un snapshot Unicode que excede el margen seguro sin cerrar parcialmente", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "close-report-size-limit");
    const version = await prepareConfiguredClosable("CONTEO_FISICO");
    const database = adminDatabase();
    const oversizedObservation = "🌱".repeat(70_000);
    await Promise.all([1, 2, 3].map((index) =>
      database.collection("conteos").doc(`CONTEO-INFORME-CIERRE-${index}`).update({
        observaciones: oversizedObservation
      })
    ));

    await expectRejectCode(
      closeJourney(administrator, ACTIVE_JOURNEY_ID, version, "cerrar-informe-snapshot-grande-0001"),
      "JOURNEY_CLOSE_LIMIT_EXCEEDED"
    );
    expect((await database.collection("informesInventario").doc(ACTIVE_JOURNEY_ID).get()).exists)
      .toBe(false);
    expect((await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).get()).data())
      .toMatchObject({estadoAdministrativo: "ACTIVA", version});
    expect((await database.collection("ocupacionesLineasActivas").doc("LINEA-PRUEBA-1").get()).exists)
      .toBe(true);
    expect((await database.collection("jornadaLineas").doc(journeyLineId(1)).get()).data()?.activa)
      .toBe(true);
  });
});
