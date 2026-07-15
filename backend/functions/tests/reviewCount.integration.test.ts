import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ApproveCountRequest,
  ApproveCountResult,
  ReserveLineRequest,
  ReserveLineResult,
  ReturnCountRequest,
  ReturnCountResult,
  SendCountRequest,
  SendCountResult
} from "../src/domain/contracts.js";
import {DEMO_PASSWORD, journeyLineId} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const deviceId = "DISPOSITIVO-REVISION-001";
const clientApps: FirebaseApp[] = [];

function createClient(name: string): {auth: Auth; functions: Functions} {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `demo-review-${name}`,
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

async function createPendingCount(
  authorEmail = "auxiliar1@prueba.local",
  lineNumber = 1,
  quantities = {hembras: 450, machos: 320, patrones: 210}
): Promise<{author: {auth: Auth; functions: Functions}; count: SendCountResult}> {
  const author = await authenticatedClient(authorEmail, `author-${lineNumber}`);
  const reserve = httpsCallable<ReserveLineRequest, ReserveLineResult>(author.functions, "reservarLinea");
  const reservation = (await reserve({
    jornadaLineaId: journeyLineId(lineNumber),
    dispositivoId: deviceId,
    claveIdempotencia: `reservar-revision-${crypto.randomUUID()}`
  })).data;
  const send = httpsCallable<SendCountRequest, SendCountResult>(author.functions, "enviarConteo");
  const count = (await send({
    reservaId: reservation.reservaId,
    tokenReserva: reservation.tokenReserva,
    dispositivoId: deviceId,
    ...quantities,
    observaciones: "Conteo ficticio para revisión transaccional.",
    timestampDispositivo: "2026-07-14T08:00:00.000-05:00",
    claveIdempotencia: `enviar-revision-${crypto.randomUUID()}`
  })).data;
  return {author, count};
}

async function approve(
  functions: Functions,
  request: ApproveCountRequest | Record<string, unknown>
): Promise<ApproveCountResult> {
  const callable = httpsCallable<ApproveCountRequest | Record<string, unknown>, ApproveCountResult>(
    functions,
    "aprobarConteo"
  );
  return (await callable(request)).data;
}

async function returnCount(
  functions: Functions,
  request: ReturnCountRequest | Record<string, unknown>
): Promise<ReturnCountResult> {
  const callable = httpsCallable<ReturnCountRequest | Record<string, unknown>, ReturnCountResult>(
    functions,
    "devolverConteo"
  );
  return (await callable(request)).data;
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

function adminDatabase() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getAdminApps().find((candidate) => candidate.name === "review-count-tests") ??
    initializeAdminApp({projectId}, "review-count-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("aprobarConteo y devolverConteo mediante emuladores reales", () => {
  it("aprueba, reemplaza la fotografía y registra diferencias una sola vez", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "supervisor-approve");
    const database = adminDatabase();
    const originalCount = await database.collection("conteos").doc(count.conteoId).get();
    await database.collection("jornadaLineas").doc(journeyLineId(1)).update({
      responsableCorreccionUsuarioId: "uid-auxiliar-1",
      responsableCorreccionNombreVisible: "Auxiliar ficticio 1",
      reasignacionActivaId: "REASIGNACION-YA-CORREGIDA",
      reasignadaPorUsuarioId: "uid-supervisor",
      reasignadaPorNombreVisible: "Supervisor ficticio",
      motivoReasignacion: "Metadatos activos que deben cerrarse al aprobar."
    });
    const result = await approve(reviewer.functions, {
      conteoId: count.conteoId,
      claveIdempotencia: "aprobar-valido-etapa-05-0001"
    });

    expect(result).toMatchObject({
      conteoId: count.conteoId,
      jornadaLineaId: journeyLineId(1),
      estadoCentral: "APROBADA",
      inventarioAnterior: {hembras: 500, machos: 300, patrones: 200, total: 1000},
      inventarioNuevo: {hembras: 450, machos: 320, patrones: 210, total: 980},
      diferencias: {hembras: -50, machos: 20, patrones: 10, total: -20},
      versionInventario: 2,
      versionLinea: 3
    });
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toMatchObject({hembras: 450, machos: 320, patrones: 210, total: 980, version: 2});
    expect((await database.collection("jornadaLineas").doc(journeyLineId(1)).get()).data())
      .toMatchObject({
        estadoCentral: "APROBADA",
        version: 3,
        decisionVigenteId: result.decisionId,
        responsableCorreccionUsuarioId: null,
        reasignacionActivaId: null
      });
    expect((await database.collection("conteos").doc(count.conteoId).get()).data()).toEqual(originalCount.data());
    expect((await database.collection("decisionesRevision").get()).size).toBe(1);
    expect((await database.collection("movimientosInventario").get()).size).toBe(1);
    expect((await database.collection("auditoria").where("tipo", "==", "CONTEO_APROBADO").get()).size).toBe(1);
  });

  it("devuelve con motivo sin cambiar inventario ni crear movimiento", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "supervisor-return");
    const database = adminDatabase();
    const inventoryBefore = (await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data();
    const result = await returnCount(reviewer.functions, {
      conteoId: count.conteoId,
      motivo: "Repetir la categoría de patrones en esta prueba.",
      claveIdempotencia: "devolver-valido-etapa-05-0001"
    });

    expect(result).toMatchObject({estadoCentral: "DEVUELTA", versionLinea: 3});
    expect((await database.collection("jornadaLineas").doc(journeyLineId(1)).get()).data())
      .toMatchObject({estadoCentral: "DEVUELTA", version: 3, decisionVigenteId: result.decisionId});
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toEqual(inventoryBefore);
    expect((await database.collection("movimientosInventario").get()).empty).toBe(true);
  });

  it("exige motivo de devolución y rechaza campos adicionales", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "return-validation");
    await expectRejectCode(returnCount(reviewer.functions, {
      conteoId: count.conteoId,
      claveIdempotencia: "devolver-sin-motivo-0001"
    }), "RETURN_REASON_REQUIRED");
    await expectRejectCode(approve(reviewer.functions, {
      conteoId: count.conteoId,
      claveIdempotencia: "aprobar-campo-extra-0001",
      usuarioId: "uid-supervisor"
    }), "INVALID_ARGUMENT");
  });

  it("impide revisar al auxiliar y aprobar el propio conteo al supervisor", async () => {
    const auxiliaryCount = await createPendingCount();
    await expectRejectCode(approve(auxiliaryCount.author.functions, {
      conteoId: auxiliaryCount.count.conteoId,
      claveIdempotencia: "auxiliar-no-revisa-0001"
    }), "REVIEW_NOT_ALLOWED");

    await seedEmulator();
    const supervisorCount = await createPendingCount("supervisor@prueba.local");
    await expectRejectCode(approve(supervisorCount.author.functions, {
      conteoId: supervisorCount.count.conteoId,
      claveIdempotencia: "supervisor-autorrevision-0001"
    }), "SELF_APPROVAL_FORBIDDEN");
  });

  it("permite autorrevisión administrativa únicamente con motivo explícito", async () => {
    const {author, count} = await createPendingCount("administrador@prueba.local");
    await expectRejectCode(approve(author.functions, {
      conteoId: count.conteoId,
      claveIdempotencia: "admin-autorrevision-sin-motivo-0001"
    }), "EXCEPTION_REASON_REQUIRED");
    const result = await approve(author.functions, {
      conteoId: count.conteoId,
      motivoExcepcion: "Única cuenta maestra disponible durante esta prueba ficticia.",
      claveIdempotencia: "admin-autorrevision-con-motivo-0001"
    });
    expect(result.estadoCentral).toBe("APROBADA");
    expect((await adminDatabase().collection("decisionesRevision").doc(result.decisionId).get()).data())
      .toMatchObject({autorrevisionAdministrativa: true, rolEfectivoRevisor: "ADMINISTRADOR"});
  });

  it("rechaza revisor inactivo, autorización revocada y jornada inactiva", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "revoked-reviewer");
    const database = adminDatabase();
    const request = {conteoId: count.conteoId, claveIdempotencia: "aprobar-autorizacion-0001"};
    await database.collection("usuarios").doc("uid-supervisor").update({activo: false});
    await expectRejectCode(approve(reviewer.functions, request), "USER_INACTIVE");
    await database.collection("usuarios").doc("uid-supervisor").update({activo: true});
    await database.collection("jornadas").doc("JORNADA-PRUEBA-ETAPA-3")
      .collection("autorizaciones").doc("uid-supervisor").update({activa: false});
    await expectRejectCode(approve(reviewer.functions, request), "REVIEW_NOT_ALLOWED");
    await database.collection("jornadas").doc("JORNADA-PRUEBA-ETAPA-3")
      .collection("autorizaciones").doc("uid-supervisor").update({activa: true});
    await database.collection("jornadas").doc("JORNADA-PRUEBA-ETAPA-3").update({estadoAdministrativo: "INACTIVA"});
    await expectRejectCode(approve(reviewer.functions, request), "JOURNEY_NOT_ACTIVE");
  });

  it("rechaza conteo inexistente, ya revisado, línea incorrecta y estado incorrecto", async () => {
    const reviewer = await authenticatedClient("supervisor@prueba.local", "invalid-review-state");
    await expectRejectCode(approve(reviewer.functions, {
      conteoId: "CONTEO-INEXISTENTE",
      claveIdempotencia: "aprobar-inexistente-0001"
    }), "COUNT_NOT_FOUND");

    const {count} = await createPendingCount();
    await returnCount(reviewer.functions, {
      conteoId: count.conteoId,
      motivo: "Cierre de prueba.",
      claveIdempotencia: "devolver-antes-de-aprobar-0001"
    });
    await expectRejectCode(approve(reviewer.functions, {
      conteoId: count.conteoId,
      claveIdempotencia: "aprobar-ya-revisado-0001"
    }), "COUNT_NOT_PENDING_REVIEW");

    await seedEmulator();
    const mismatch = await createPendingCount();
    await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).update({conteoVigenteId: "otro-conteo"});
    await expectRejectCode(approve(reviewer.functions, {
      conteoId: mismatch.count.conteoId,
      claveIdempotencia: "aprobar-linea-incorrecta-0001"
    }), "COUNT_LINE_MISMATCH");

    await seedEmulator();
    const wrongState = await createPendingCount();
    await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).update({estadoCentral: "EN_CONTEO"});
    await expectRejectCode(approve(reviewer.functions, {
      conteoId: wrongState.count.conteoId,
      claveIdempotencia: "aprobar-estado-incorrecto-0001"
    }), "COUNT_NOT_PENDING_REVIEW");
  });

  it("rechaza inventario inexistente y revierte todas las escrituras", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "missing-inventory");
    const database = adminDatabase();
    await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").delete();
    await expectRejectCode(approve(reviewer.functions, {
      conteoId: count.conteoId,
      claveIdempotencia: "aprobar-sin-inventario-0001"
    }), "INVENTORY_NOT_FOUND");
    expect((await database.collection("decisionesRevision").get()).empty).toBe(true);
    expect((await database.collection("movimientosInventario").get()).empty).toBe(true);
    expect((await database.collection("auditoria").where("tipo", "==", "CONTEO_APROBADO").get()).empty).toBe(true);
    expect((await database.collection("jornadaLineas").doc(journeyLineId(1)).get()).data())
      .toMatchObject({estadoCentral: "PENDIENTE_REVISION", version: 2});
  });

  it("recupera exactamente el resultado idempotente sin duplicar efectos", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "idempotent-review");
    const request = {
      conteoId: count.conteoId,
      claveIdempotencia: "aprobar-idempotente-etapa-05-0001"
    };
    const first = await approve(reviewer.functions, request);
    const recovered = await approve(reviewer.functions, request);
    const database = adminDatabase();
    expect(recovered).toEqual(first);
    expect((await database.collection("decisionesRevision").get()).size).toBe(1);
    expect((await database.collection("movimientosInventario").get()).size).toBe(1);
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toMatchObject({version: 2});
    expect((await database.collection("jornadaLineas").doc(journeyLineId(1)).get()).data())
      .toMatchObject({version: 3});
  });

  it("recupera una devolución perdida y detecta cambio de motivo con la misma clave", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "idempotent-return");
    const request = {
      conteoId: count.conteoId,
      motivo: "Repetir el conteo ficticio.",
      claveIdempotencia: "devolver-idempotente-etapa-05-0001"
    };
    const first = await returnCount(reviewer.functions, request);
    const recovered = await returnCount(reviewer.functions, request);
    expect(recovered).toEqual(first);
    await expectRejectCode(returnCount(reviewer.functions, {
      ...request,
      motivo: "Otro motivo para la misma clave."
    }), "IDEMPOTENCY_CONFLICT");
    const database = adminDatabase();
    expect((await database.collection("decisionesRevision").get()).size).toBe(1);
    expect((await database.collection("movimientosInventario").get()).empty).toBe(true);
    expect((await database.collection("auditoria").where("tipo", "==", "CONTEO_DEVUELTO").get()).size).toBe(1);
  });

  it("detecta conflicto cuando la misma clave representa otro payload", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("administrador@prueba.local", "idempotency-conflict-review");
    const key = "aprobar-conflicto-etapa-05-0001";
    await approve(reviewer.functions, {conteoId: count.conteoId, claveIdempotencia: key});
    await expectRejectCode(approve(reviewer.functions, {
      conteoId: count.conteoId,
      claveIdempotencia: key,
      motivoExcepcion: "Payload diferente"
    }), "IDEMPOTENCY_CONFLICT");
  });

  it("dos aprobaciones simultáneas aplican inventario, movimiento y versión una sola vez", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "concurrent-approve");
    const attempts = await Promise.allSettled([
      approve(reviewer.functions, {conteoId: count.conteoId, claveIdempotencia: "aprobar-concurrente-a-0001"}),
      approve(reviewer.functions, {conteoId: count.conteoId, claveIdempotencia: "aprobar-concurrente-b-0001"})
    ]);
    const database = adminDatabase();
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect((await database.collection("decisionesRevision").get()).size).toBe(1);
    expect((await database.collection("movimientosInventario").get()).size).toBe(1);
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toMatchObject({version: 2});
    expect((await database.collection("jornadaLineas").doc(journeyLineId(1)).get()).data())
      .toMatchObject({estadoCentral: "APROBADA", version: 3});
  });

  it("aprobación y devolución simultáneas crean exactamente una decisión", async () => {
    const {count} = await createPendingCount();
    const reviewer = await authenticatedClient("supervisor@prueba.local", "concurrent-decision");
    const attempts = await Promise.allSettled([
      approve(reviewer.functions, {conteoId: count.conteoId, claveIdempotencia: "decision-concurrente-a-0001"}),
      returnCount(reviewer.functions, {
        conteoId: count.conteoId,
        motivo: "Devolución concurrente ficticia.",
        claveIdempotencia: "decision-concurrente-b-0001"
      })
    ]);
    const database = adminDatabase();
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect((await database.collection("decisionesRevision").get()).size).toBe(1);
    expect((await database.collection("jornadaLineas").doc(journeyLineId(1)).get()).data())
      .toMatchObject({version: 3});
    const reviewAudits = await database.collection("auditoria").where("tipo", "in", ["CONTEO_APROBADO", "CONTEO_DEVUELTO"]).get();
    expect(reviewAudits.size).toBe(1);
    expect((await database.collection("movimientosInventario").get()).size).toBeLessThanOrEqual(1);
  });
});
