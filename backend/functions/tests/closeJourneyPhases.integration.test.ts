import {getApps, initializeApp} from "firebase-admin/app";
import {getFirestore, Timestamp, type Firestore, type WriteBatch} from "firebase-admin/firestore";
import {beforeEach, describe, expect, it} from "vitest";

import {
  CloseJourneyService,
  ProcessCloseJourneyService,
  RetryCloseJourneyService,
  type CloseJourneyJobDocument
} from "../src/domain/closeJourney.js";
import {ActivateJourneyService} from "../src/domain/activateJourney.js";

const projectId = "demo-vivero-control-cierre-fases";
const ACTOR_ID = "uid-admin-cierre-fases";
const DISTRIBUTION = [76, 76, 76, 29, 14] as const;

function database(): Firestore {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getApps().find((candidate) => candidate.name === "close-phases-tests") ??
    initializeApp({projectId}, "close-phases-tests");
  return getFirestore(app);
}

async function commitWrites(
  firestore: Firestore,
  writes: readonly ((batch: WriteBatch) => void)[]
): Promise<void> {
  for (let start = 0; start < writes.length; start += 350) {
    const batch = firestore.batch();
    writes.slice(start, start + 350).forEach((write) => write(batch));
    await batch.commit();
  }
}

async function seedLargeJourney(
  firestore: Firestore,
  journeyId: string,
  withReport: boolean
): Promise<void> {
  const now = Timestamp.fromDate(new Date("2026-07-01T12:00:00.000Z"));
  const receivedAt = Timestamp.fromDate(new Date("2026-07-15T12:00:00.000Z"));
  const writes: Array<(batch: WriteBatch) => void> = [];
  writes.push((batch) => batch.set(firestore.collection("usuarios").doc(ACTOR_ID), {
    id: ACTOR_ID,
    nombreVisible: "Administrador de prueba por fases",
    roles: ["ADMINISTRADOR"],
    activo: true,
    version: 1
  }));
  writes.push((batch) => batch.set(firestore.collection("usuarios").doc("uid-aux-cierre-fases"), {
    id: "uid-aux-cierre-fases", nombreVisible: "Auxiliar", roles: ["AUXILIAR"], activo: true, version: 1
  }));
  writes.push((batch) => batch.set(firestore.collection("usuarios").doc("uid-supervisor-ajeno-cierre-fases"), {
    id: "uid-supervisor-ajeno-cierre-fases", nombreVisible: "Supervisor ajeno",
    roles: ["SUPERVISOR"], activo: true, version: 1
  }));
  writes.push((batch) => batch.set(firestore.collection("jornadas").doc(journeyId), {
    id: journeyId,
    nombreVisible: "Jornada de 271 lineas",
    estadoAdministrativo: "ACTIVA",
    creadaPorUsuarioId: ACTOR_ID,
    version: 1,
    activadaEn: now,
    ...(withReport ? {
      configuracionInformeInventario: {
        habilitado: true,
        mes: 7,
        anio: 2026,
        fuentePlantasMuertas: "CONTEO_FISICO"
      }
    } : {})
  }));
  [ACTOR_ID, "uid-auxiliar-cierre-fases"].forEach((userId) => {
    writes.push((batch) => batch.set(
      firestore.collection("jornadas").doc(journeyId).collection("autorizaciones").doc(userId),
      {jornadaId: journeyId, usuarioId: userId, activa: true}
    ));
  });

  let globalIndex = 0;
  DISTRIBUTION.forEach((amount, moduleIndex) => {
    for (let moduleLine = 1; moduleLine <= amount; moduleLine += 1) {
      globalIndex += 1;
      const lineId = `LINEA-CIERRE-${String(globalIndex).padStart(3, "0")}`;
      const journeyLineId = `${journeyId}__${lineId}`;
      const countId = `CONTEO-CIERRE-${String(globalIndex).padStart(3, "0")}`;
      writes.push((batch) => batch.set(firestore.collection("jornadaLineas").doc(journeyLineId), {
        id: journeyLineId,
        jornadaId: journeyId,
        lineaId: lineId,
        activa: true,
        estadoCentral: "APROBADA",
        version: 2,
        reservaActivaId: null,
        conteoVigenteId: withReport ? countId : null,
        ubicacion: {
          vivero: "VIVERO PRUEBA",
          modulo: `MODULO ${moduleIndex + 1}`,
          cama: `CAMA ${String(Math.floor((moduleLine - 1) / 4) + 1).padStart(2, "0")}`,
          linea: `LINEA ${String(moduleLine).padStart(2, "0")}`,
          nombreVisible: `Modulo ${moduleIndex + 1} linea ${moduleLine}`,
          orden: globalIndex
        }
      }));
      writes.push((batch) => batch.set(firestore.collection("ocupacionesLineasActivas").doc(lineId), {
        jornadaId: journeyId,
        lineaId: lineId
      }));
      if (withReport) {
        writes.push((batch) => batch.set(firestore.collection("conteos").doc(countId), {
          id: countId,
          jornadaId: journeyId,
          jornadaLineaId: journeyLineId,
          lineaId: lineId,
          hembras: 100 + globalIndex,
          machos: 50,
          patrones: 25,
          plantasMuertas: globalIndex % 7,
          total: 175 + globalIndex,
          observaciones: `Linea ficticia ${globalIndex}`,
          recibidoEn: receivedAt,
          inmutable: true
        }));
      }
    }
  });
  expect(globalIndex).toBe(271);
  await commitWrites(firestore, writes);
}

async function clearProject(firestore: Firestore): Promise<void> {
  const collections = await firestore.listCollections();
  for (const collection of collections) {
    const snapshots = await collection.get();
    await commitWrites(firestore, snapshots.docs.map((snapshot) =>
      (batch) => batch.delete(snapshot.ref)
    ));
  }
}

beforeEach(async () => {
  await clearProject(database());
});

describe("cierre durable por fases", () => {
  it("mantiene intacto un cierre historico INACTIVA sin trabajo durable", async () => {
    const firestore = database();
    const journeyId = "JORNADA-CERRADA-LEGACY";
    const closedAt = Timestamp.fromDate(new Date("2026-06-30T18:00:00.000Z"));
    const legacy = {
      id: journeyId,
      nombreVisible: "Jornada cerrada por el flujo anterior",
      estadoAdministrativo: "INACTIVA",
      creadaPorUsuarioId: ACTOR_ID,
      version: 7,
      cerradaPorUsuarioId: ACTOR_ID,
      cerradaEn: closedAt,
      actualizadaEn: closedAt
    };
    await firestore.collection("jornadas").doc(journeyId).set(legacy);

    await new ProcessCloseJourneyService(firestore).processTriggered(journeyId, "0".repeat(64));

    expect((await firestore.collection("jornadas").doc(journeyId).get()).data()).toEqual(legacy);
    expect((await firestore.collection("jornadas").where("estadoAdministrativo", "==", "INACTIVA").get())
      .docs.map((snapshot) => snapshot.id)).toContain(journeyId);
    expect((await firestore.collection("trabajosCierreJornada").doc(journeyId).get()).exists).toBe(false);
    expect((await firestore.collection("auditoria").get()).empty).toBe(true);
  });

  it("salta una fase historica sin autorizaciones y finaliza sin bloquearse", async () => {
    const firestore = database();
    const journeyId = "JORNADA-CIERRE-SIN-AUTORIZACIONES";
    const lineId = "LINEA-CIERRE-SIN-AUTORIZACIONES";
    const journeyLineId = `${journeyId}__${lineId}`;
    const now = Timestamp.fromDate(new Date("2026-07-01T12:00:00.000Z"));
    await commitWrites(firestore, [
      (batch) => batch.set(firestore.collection("usuarios").doc(ACTOR_ID), {
        id: ACTOR_ID,
        nombreVisible: "Administrador de prueba por fases",
        roles: ["ADMINISTRADOR"],
        activo: true,
        version: 1
      }),
      (batch) => batch.set(firestore.collection("jornadas").doc(journeyId), {
        id: journeyId,
        nombreVisible: "Jornada historica sin autorizaciones",
        estadoAdministrativo: "ACTIVA",
        creadaPorUsuarioId: ACTOR_ID,
        version: 1,
        activadaEn: now
      }),
      (batch) => batch.set(firestore.collection("jornadaLineas").doc(journeyLineId), {
        id: journeyLineId,
        jornadaId: journeyId,
        lineaId: lineId,
        activa: true,
        estadoCentral: "APROBADA",
        version: 2,
        reservaActivaId: null,
        conteoVigenteId: null
      }),
      (batch) => batch.set(firestore.collection("ocupacionesLineasActivas").doc(lineId), {
        jornadaId: journeyId,
        lineaId: lineId
      })
    ]);

    await expect(new CloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 1,
      claveIdempotencia: "cerrar-sin-autorizaciones-etapa-26"
    }, {actorId: ACTOR_ID})).resolves.toMatchObject({estado: "CERRANDO", cantidadAutorizaciones: 0});
    await expect(new ProcessCloseJourneyService(firestore).processUntilComplete(journeyId))
      .resolves.toMatchObject({estado: "INACTIVA", cantidadAutorizaciones: 0});
    expect((await firestore.collection("trabajosCierreJornada").doc(journeyId).get()).data()).toMatchObject({
      estado: "COMPLETADO",
      autorizacionesProcesadas: 0,
      intentos: 4
    });
  });

  it("rechaza dos jornadaLineas que apuntan a la misma linea fisica sin iniciar el cierre", async () => {
    const firestore = database();
    const journeyId = "JORNADA-CIERRE-LINEA-DUPLICADA";
    const lineId = "LINEA-FISICA-DUPLICADA";
    const now = Timestamp.fromDate(new Date("2026-07-01T12:00:00.000Z"));
    await commitWrites(firestore, [
      (batch) => batch.set(firestore.collection("usuarios").doc(ACTOR_ID), {
        id: ACTOR_ID,
        nombreVisible: "Administrador de prueba por fases",
        roles: ["ADMINISTRADOR"],
        activo: true,
        version: 1
      }),
      (batch) => batch.set(firestore.collection("jornadas").doc(journeyId), {
        id: journeyId,
        nombreVisible: "Jornada con linea fisica duplicada",
        estadoAdministrativo: "ACTIVA",
        creadaPorUsuarioId: ACTOR_ID,
        version: 1,
        activadaEn: now
      }),
      ...["A", "B"].map((suffix) => (batch: WriteBatch) => batch.set(
        firestore.collection("jornadaLineas").doc(`${journeyId}__${suffix}`),
        {
          id: `${journeyId}__${suffix}`,
          jornadaId: journeyId,
          lineaId: lineId,
          activa: true,
          estadoCentral: "APROBADA",
          version: 2,
          reservaActivaId: null,
          conteoVigenteId: null
        }
      )),
      (batch) => batch.set(firestore.collection("ocupacionesLineasActivas").doc(lineId), {
        jornadaId: journeyId,
        lineaId: lineId
      })
    ]);

    await expect(new CloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 1,
      claveIdempotencia: "cerrar-linea-fisica-duplicada-etapa-26"
    }, {actorId: ACTOR_ID})).rejects.toMatchObject({code: "JOURNEY_CLOSE_OCCUPATION_MISMATCH"});
    expect((await firestore.collection("jornadas").doc(journeyId).get()).data())
      .toMatchObject({estadoAdministrativo: "ACTIVA", version: 1});
    expect((await firestore.collection("trabajosCierreJornada").doc(journeyId).get()).exists).toBe(false);
    expect((await firestore.collection("idempotencia").get()).empty).toBe(true);
  });

  it("cierra exactamente 271 lineas 76/76/76/29/14 en lotes de 100", async () => {
    const firestore = database();
    const journeyId = "JORNADA-CIERRE-271";
    await seedLargeJourney(firestore, journeyId, true);
    const service = new CloseJourneyService(firestore);
    const request = {
      jornadaId: journeyId,
      versionEsperada: 1,
      claveIdempotencia: "cerrar-271-lineas-etapa-26"
    } as const;
    const started = await service.execute(request, {actorId: ACTOR_ID});
    expect(started).toMatchObject({estado: "CERRANDO", cantidadLineas: 271, fase: "LINEAS", cursor: 0});
    expect(await service.execute(request, {actorId: ACTOR_ID})).toEqual(started);
    const pendingIdempotency = (await firestore.collection("idempotencia")
      .where("operacion", "==", "CERRAR_JORNADA").get()).docs[0];
    expect(pendingIdempotency?.data()).toMatchObject({estado: "EN_PROCESO", resultado: started});
    const worker = new ProcessCloseJourneyService(firestore);
    await worker.processOneBatch(journeyId);
    const releasedClaim = (await firestore.collection("trabajosCierreJornada").doc(journeyId).get()).data();
    expect(releasedClaim).toMatchObject({estado: "PENDIENTE", fase: "LINEAS", cursor: 100});
    expect(releasedClaim).not.toHaveProperty("procesamientoId");
    expect(releasedClaim).not.toHaveProperty("procesandoEn");
    for (let batch = 1; batch < 4; batch += 1) await worker.processOneBatch(journeyId);
    const releasedLineId = "LINEA-CIERRE-001";
    expect((await firestore.collection("ocupacionesLineasActivas").doc(releasedLineId).get()).exists).toBe(false);
    const competingJourneyId = "JORNADA-BORRADOR-COMPETIDORA-CIERRE";
    await commitWrites(firestore, [
      (batch) => batch.set(firestore.collection("jornadas").doc(competingJourneyId), {
        id: competingJourneyId,
        nombreVisible: "Borrador que compite durante cierre",
        estadoAdministrativo: "BORRADOR",
        creadaPorUsuarioId: ACTOR_ID,
        version: 1
      }),
      (batch) => batch.set(firestore.collection("seleccionesLineasJornada").doc(competingJourneyId), {
        id: competingJourneyId,
        jornadaId: competingJourneyId,
        lineaIds: [releasedLineId],
        cantidadLineas: 1,
        versionJornada: 1
      }),
      (batch) => batch.set(firestore.collection("seleccionesParticipantesJornada").doc(competingJourneyId), {
        id: competingJourneyId,
        jornadaId: competingJourneyId,
        participantes: [{
          usuarioId: ACTOR_ID,
          nombreVisible: "Administrador de prueba por fases",
          rol: "ADMINISTRADOR",
          puedeContar: true
        }],
        cantidadParticipantes: 1,
        versionJornada: 1
      })
    ]);
    await expect(new ActivateJourneyService(firestore).execute({
      jornadaId: competingJourneyId,
      versionJornadaEsperada: 1,
      versionSeleccionLineasEsperada: 1,
      versionSeleccionParticipantesEsperada: 1,
      claveIdempotencia: "activar-mientras-otra-jornada-cierra"
    }, {actorId: ACTOR_ID})).rejects.toMatchObject({code: "ACTIVATION_LINE_OCCUPIED"});
    expect((await firestore.collection("jornadas").doc(competingJourneyId).get()).data())
      .toMatchObject({estadoAdministrativo: "BORRADOR", version: 1});
    const result = await worker.processUntilComplete(journeyId);
    expect(await service.execute(request, {actorId: ACTOR_ID})).toEqual(result);

    expect(result).toMatchObject({
      jornadaId: journeyId,
      estado: "INACTIVA",
      version: 2,
      cantidadLineas: 271,
      cantidadAutorizaciones: 2,
      ocupacionesLiberadas: 271
    });
    const job = (await firestore.collection("trabajosCierreJornada").doc(journeyId).get())
      .data() as CloseJourneyJobDocument;
    expect(job).toMatchObject({
      estado: "COMPLETADO",
      fase: "COMPLETADO",
      lineasProcesadas: 271,
      ocupacionesProcesadas: 271,
      autorizacionesProcesadas: 2,
      intentos: 8
    });
    const report = await firestore.collection("informesInventario").doc(journeyId).get();
    expect(report.data()?.lineas).toHaveLength(271);
    expect(DISTRIBUTION.map((_, index) => report.data()?.lineas.filter(
      (line: {ubicacion?: {modulo?: string}}) => line.ubicacion?.modulo === `MODULO ${index + 1}`
    ).length)).toEqual(DISTRIBUTION);
    expect((await firestore.collection("ocupacionesLineasActivas").get()).empty).toBe(true);
    expect((await firestore.collection("jornadaLineas").where("jornadaId", "==", journeyId).get())
      .docs.every((line) => line.data().activa === false)).toBe(true);
    expect((await firestore.collection("auditoria").where("tipo", "==", "JORNADA_CERRADA").get()).size)
      .toBe(1);
    const idempotencies = await firestore.collection("idempotencia")
      .where("operacion", "==", "CERRAR_JORNADA").get();
    expect(idempotencies.size).toBe(1);
    expect(idempotencies.docs[0]?.data()).toMatchObject({estado: "COMPLETADO", resultado: result});
  }, 30_000);

  it("reanuda despues de cada lote sin repetir progreso, auditoria ni informe", async () => {
    const firestore = database();
    const journeyId = "JORNADA-CIERRE-INTERRUMPIDA-271";
    await seedLargeJourney(firestore, journeyId, false);
    const interruptingWorker = () => new ProcessCloseJourneyService(firestore, {
      afterBatch: async () => {
        throw new Error("INTERRUPCION_FICTICIA_DESPUES_DEL_LOTE");
      }
    });
    await expect(new CloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 1,
      claveIdempotencia: "cerrar-interrumpido-etapa-26"
    }, {actorId: ACTOR_ID})).resolves.toMatchObject({estado: "CERRANDO"});
    await expect(interruptingWorker().processOneBatch(journeyId)).rejects.toThrow("INTERRUPCION_FICTICIA");

    const firstError = (await firestore.collection("trabajosCierreJornada").doc(journeyId).get())
      .data() as CloseJourneyJobDocument;
    expect(firstError).toMatchObject({
      estado: "ERROR",
      fase: "LINEAS",
      cursor: 100,
      lineasProcesadas: 100,
      intentos: 1,
      errorCodigo: "JOURNEY_CLOSE_PROCESSING_FAILED"
    });
    expect(firstError.errorMensaje).not.toContain("INTERRUPCION_FICTICIA");
    expect(firstError.errorMensaje).not.toContain("Error:");
    const closeIdempotency = (await firestore.collection("idempotencia")
      .where("operacion", "==", "CERRAR_JORNADA").get()).docs[0];
    expect(closeIdempotency?.data()).toMatchObject({
      estado: "EN_PROCESO",
      resultado: {estado: "CERRANDO", lineasProcesadas: 0}
    });
    await expect(new RetryCloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 2,
      claveIdempotencia: "reintento-no-autorizado-aux-etapa-26"
    }, {actorId: "uid-aux-cierre-fases"})).rejects.toMatchObject({code: "PERMISSION_DENIED"});
    await expect(new RetryCloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 2,
      claveIdempotencia: "reintento-supervisor-ajeno-etapa-26"
    }, {actorId: "uid-supervisor-ajeno-cierre-fases"}))
      .rejects.toMatchObject({code: "JOURNEY_CLOSE_ACCESS_DENIED"});

    const observedProgress: Array<[number, number, number]> = [];
    for (let retry = 1; retry <= 10; retry += 1) {
      const snapshot = await firestore.collection("trabajosCierreJornada").doc(journeyId).get();
      const job = snapshot.data() as CloseJourneyJobDocument;
      expect(job.estado).toBe("ERROR");
      observedProgress.push([
        job.lineasProcesadas,
        job.ocupacionesProcesadas,
        job.autorizacionesProcesadas
      ]);
      if (job.fase === "FINALIZAR") break;
      await expect(new RetryCloseJourneyService(firestore).execute({
        jornadaId: journeyId,
        versionEsperada: 2,
        claveIdempotencia: `reintentar-cierre-lote-${retry}-etapa-26`
      }, {actorId: ACTOR_ID})).resolves.toMatchObject({estado: "CERRANDO"});
      await expect(interruptingWorker().processOneBatch(journeyId)).rejects.toThrow("INTERRUPCION_FICTICIA");
    }
    expect(observedProgress).toEqual([
      [100, 0, 0],
      [200, 0, 0],
      [271, 0, 0],
      [271, 100, 0],
      [271, 200, 0],
      [271, 271, 0],
      [271, 271, 2]
    ]);

    const finalRetry = new RetryCloseJourneyService(firestore);
    const finalRequest = {
      jornadaId: journeyId,
      versionEsperada: 2,
      claveIdempotencia: "reintentar-cierre-final-etapa-26"
    } as const;
    const requeued = await finalRetry.execute(finalRequest, {actorId: ACTOR_ID});
    expect(requeued).toMatchObject({estado: "CERRANDO", fase: "FINALIZAR"});
    expect(await finalRetry.execute(finalRequest, {actorId: ACTOR_ID})).toEqual(requeued);
    const result = await new ProcessCloseJourneyService(firestore).processUntilComplete(journeyId);
    expect(result).toMatchObject({estado: "INACTIVA", cantidadLineas: 271});
    expect((await firestore.collection("auditoria").where("tipo", "==", "JORNADA_CERRADA").get()).size)
      .toBe(1);
    expect((await firestore.collection("informesInventario").get()).empty).toBe(true);
    expect((await firestore.collection("ocupacionesLineasActivas").get()).empty).toBe(true);
    const job = (await firestore.collection("trabajosCierreJornada").doc(journeyId).get())
      .data() as CloseJourneyJobDocument;
    expect(job).toMatchObject({
      estado: "COMPLETADO",
      lineasProcesadas: 271,
      ocupacionesProcesadas: 271,
      autorizacionesProcesadas: 2,
      intentos: 8
    });
    expect(closeIdempotency?.ref ? (await closeIdempotency.ref.get()).data() : undefined)
      .toMatchObject({estado: "COMPLETADO", resultado: result});
  }, 30_000);

  it("no abandona un lease por crash y permite reclamarlo solo despues de vencer", async () => {
    const firestore = database();
    const journeyId = "JORNADA-CIERRE-LEASE-271";
    await seedLargeJourney(firestore, journeyId, false);
    await new CloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 1,
      claveIdempotencia: "cerrar-lease-crash-etapa-26"
    }, {actorId: ACTOR_ID});
    const jobRef = firestore.collection("trabajosCierreJornada").doc(journeyId);
    const scopeHash = (await jobRef.get()).data()?.huellaAlcance as string;
    await jobRef.update({
      estado: "PROCESANDO",
      procesamientoId: "worker-que-fallo",
      procesandoEn: Timestamp.now()
    });
    const worker = new ProcessCloseJourneyService(firestore);
    await expect(worker.processTriggered(journeyId, scopeHash))
      .rejects.toThrow("lease del cierre sigue activo");
    await expect(new RetryCloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 2,
      claveIdempotencia: "reintentar-lease-activo-etapa-26"
    }, {actorId: ACTOR_ID})).rejects.toMatchObject({code: "JOURNEY_CLOSE_NOT_RETRYABLE"});

    await jobRef.update({
      procesandoEn: Timestamp.fromMillis(Date.now() - (16 * 60 * 1000))
    });
    await worker.processTriggered(journeyId, scopeHash);
    expect((await jobRef.get()).data()).toMatchObject({
      estado: "PENDIENTE",
      fase: "LINEAS",
      cursor: 100,
      lineasProcesadas: 100,
      intentos: 1
    });

    await jobRef.update({
      estado: "PROCESANDO",
      procesamientoId: "segundo-worker-que-fallo",
      procesandoEn: Timestamp.fromMillis(Date.now() - (16 * 60 * 1000))
    });
    await expect(new RetryCloseJourneyService(firestore).execute({
      jornadaId: journeyId,
      versionEsperada: 2,
      claveIdempotencia: "reintentar-lease-vencido-etapa-26"
    }, {actorId: ACTOR_ID})).resolves.toMatchObject({
      estado: "CERRANDO",
      fase: "LINEAS",
      cursor: 100,
      lineasProcesadas: 100
    });
    expect((await jobRef.get()).data()).toMatchObject({estado: "PENDIENTE", cursor: 100});
    await expect(worker.processUntilComplete(journeyId)).resolves.toMatchObject({
      estado: "INACTIVA",
      cantidadLineas: 271
    });
  }, 30_000);
});
