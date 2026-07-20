import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ReserveLineRequest,
  ReserveLineResult,
  SendCountRequest,
  SendCountResult
} from "../src/domain/contracts.js";
import {ACTIVE_JOURNEY_ID, DEMO_PASSWORD, journeyLineId} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const deviceId = "DISPOSITIVO-EMULADOR-001";
const clientApps: FirebaseApp[] = [];

function createClient(name: string): {auth: Auth; functions: Functions} {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `demo-app-count-${name}`,
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

async function authenticatedClient(email = "auxiliar1@prueba.local", name = "count") {
  const client = createClient(name);
  await signInWithEmailAndPassword(client.auth, email, DEMO_PASSWORD);
  return client;
}

async function reserve(functions: Functions, lineNumber = 1): Promise<ReserveLineResult> {
  const callable = httpsCallable<ReserveLineRequest, ReserveLineResult>(functions, "reservarLinea");
  return (await callable({
    jornadaLineaId: journeyLineId(lineNumber),
    dispositivoId: deviceId,
    claveIdempotencia: `reservar-${crypto.randomUUID()}`
  })).data;
}

function payload(
  reservation: Pick<ReserveLineResult, "reservaId" | "tokenReserva">,
  key = `enviar-${crypto.randomUUID()}`
): SendCountRequest {
  return {
    reservaId: reservation.reservaId,
    tokenReserva: reservation.tokenReserva,
    dispositivoId: deviceId,
    hembras: 450,
    machos: 320,
    patrones: 210,
    observaciones: "Conteo ficticio realizado en emulador.",
    timestampDispositivo: "2026-07-13T19:30:00.000-05:00",
    claveIdempotencia: key
  };
}

async function send(functions: Functions, request: SendCountRequest | Record<string, unknown>): Promise<SendCountResult> {
  const callable = httpsCallable<SendCountRequest | Record<string, unknown>, SendCountResult>(functions, "enviarConteo");
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
  const app = getAdminApps().find((candidate) => candidate.name === "send-count-tests") ??
    initializeAdminApp({projectId}, "send-count-tests");
  return getFirestore(app);
}

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("enviarConteo mediante Auth, Functions y Firestore Emulator", () => {
  it("rechaza una solicitud sin Authentication", async () => {
    const client = createClient("send-no-auth");
    await expectRejectCode(send(client.functions, {
      reservaId: "RESERVA-INEXISTENTE",
      tokenReserva: "x".repeat(43),
      dispositivoId: deviceId,
      hembras: 0,
      machos: 0,
      patrones: 0,
      timestampDispositivo: "2026-07-13T20:00:00.000Z",
      claveIdempotencia: "clave-sin-autenticacion"
    }), "UNAUTHENTICATED");
  });

  it("reserva primero y confirma un conteo completo en una sola transición", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    const request = payload(reservation, "enviar-conteo-valido-0001");
    const result = await send(client.functions, request);
    const database = adminDatabase();
    const count = await database.collection("conteos").doc(result.conteoId).get();
    const line = await database.collection("jornadaLineas").doc(journeyLineId(1)).get();
    const consumed = await database.collection("reservas").doc(reservation.reservaId).get();
    const audits = await database.collection("auditoria").where("tipo", "==", "CONTEO_ENVIADO").get();

    expect(result).toEqual({
      conteoId: result.conteoId,
      jornadaLineaId: journeyLineId(1),
      estadoCentral: "PENDIENTE_REVISION",
      hembras: 450,
      machos: 320,
      patrones: 210,
      total: 980,
      versionConteo: 1,
      versionLinea: 2,
      recibidoEn: result.recibidoEn
    });
    expect(result).not.toHaveProperty("tokenReserva");
    expect(count.data()).toMatchObject({total: 980, versionNumero: 1, conteoAnteriorId: null, inmutable: true});
    expect(count.data()).not.toHaveProperty("tokenReserva");
    expect(line.data()).toMatchObject({
      estadoCentral: "PENDIENTE_REVISION",
      conteoVigenteId: result.conteoId,
      reservaActivaId: null,
      version: 2
    });
    expect(consumed.data()).toMatchObject({estadoReserva: "CONSUMIDA"});
    expect(audits.size).toBe(1);
  });

  it("acepta técnicamente un conteo total cero", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    const result = await send(client.functions, {...payload(reservation), hembras: 0, machos: 0, patrones: 0});
    expect(result.total).toBe(0);
  });

  it("exige y congela plantas muertas solo para CONTEO_FISICO sin alterar el total vivo", async () => {
    const client = await authenticatedClient();
    await adminDatabase().collection("jornadas").doc(ACTIVE_JOURNEY_ID).update({
      configuracionInformeInventario: {
        habilitado: true,
        mes: 7,
        anio: 2026,
        fuentePlantasMuertas: "CONTEO_FISICO"
      }
    });
    const reservation = await reserve(client.functions);
    await expectRejectCode(send(client.functions, payload(
      reservation, "enviar-fisico-sin-muertas-0001"
    )), "COUNT_DEAD_PLANTS_REQUIRED");

    const result = await send(client.functions, {
      ...payload(reservation, "enviar-fisico-con-muertas-0001"),
      plantasMuertas: 27
    });
    const count = await adminDatabase().collection("conteos").doc(result.conteoId).get();
    expect(result).toMatchObject({plantasMuertas: 27, total: 980});
    expect(count.data()).toMatchObject({plantasMuertas: 27, total: 980, inmutable: true});
  });

  it("rechaza plantas muertas para DESCARTES_APROBADOS y jornadas antiguas", async () => {
    const client = await authenticatedClient();
    const database = adminDatabase();
    await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).update({
      configuracionInformeInventario: {
        habilitado: true,
        mes: 7,
        anio: 2026,
        fuentePlantasMuertas: "DESCARTES_APROBADOS"
      }
    });
    let reservation = await reserve(client.functions);
    await expectRejectCode(send(client.functions, {
      ...payload(reservation, "enviar-descartes-con-muertas-0001"),
      plantasMuertas: 1
    }), "COUNT_DEAD_PLANTS_NOT_ALLOWED");
    await expect(send(client.functions, payload(
      reservation, "enviar-descartes-sin-muertas-0001"
    ))).resolves.not.toHaveProperty("plantasMuertas");

    await seedEmulator();
    reservation = await reserve(client.functions);
    await expectRejectCode(send(client.functions, {
      ...payload(reservation, "enviar-antigua-con-muertas-0001"),
      plantasMuertas: 1
    }), "COUNT_DEAD_PLANTS_NOT_ALLOWED");
  });

  it.each([
    ["negativos", {hembras: -1}],
    ["decimales", {machos: 1.5}],
    ["desbordamiento", {hembras: Number.MAX_SAFE_INTEGER, machos: 1}]
  ])("rechaza cantidades %s", async (_name, change) => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    await expectRejectCode(send(client.functions, {...payload(reservation), ...change}), "INVALID_ARGUMENT");
  });

  it("rechaza campos adicionales y un total calculado por el cliente", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    await expectRejectCode(send(client.functions, {...payload(reservation), usuarioId: "uid-auxiliar-1"}), "INVALID_ARGUMENT");
    await expectRejectCode(send(client.functions, {...payload(reservation), total: 980}), "INVALID_ARGUMENT");
  });

  it("rechaza token, cuenta y dispositivo diferentes", async () => {
    const owner = await authenticatedClient("auxiliar1@prueba.local", "owner");
    const other = await authenticatedClient("auxiliar2@prueba.local", "other");
    const reservation = await reserve(owner.functions);
    await expectRejectCode(send(owner.functions, {...payload(reservation), tokenReserva: "x".repeat(43)}), "INVALID_RESERVATION_TOKEN");
    await expectRejectCode(send(other.functions, payload(reservation)), "RESERVATION_ACCESS_DENIED");
    await expectRejectCode(send(owner.functions, {...payload(reservation), dispositivoId: "DISPOSITIVO-EMULADOR-OTRO"}), "DEVICE_MISMATCH");
  });

  it("rechaza usuario inactivo, autorización revocada y jornada inactiva", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    const database = adminDatabase();
    await database.collection("usuarios").doc("uid-auxiliar-1").update({activo: false});
    await expectRejectCode(send(client.functions, payload(reservation)), "USER_INACTIVE");
    await database.collection("usuarios").doc("uid-auxiliar-1").update({activo: true});
    await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).collection("autorizaciones").doc("uid-auxiliar-1").update({activa: false});
    await expectRejectCode(send(client.functions, payload(reservation)), "JOURNEY_ACCESS_DENIED");
    await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).collection("autorizaciones").doc("uid-auxiliar-1").update({activa: true});
    await database.collection("jornadas").doc(ACTIVE_JOURNEY_ID).update({estadoAdministrativo: "INACTIVA"});
    await expectRejectCode(send(client.functions, payload(reservation)), "JOURNEY_NOT_ACTIVE");
  });

  it("rechaza reserva inexistente, consumida y no vigente", async () => {
    const client = await authenticatedClient();
    const missing = {
      ...payload({reservaId: "RESERVA-INEXISTENTE", tokenReserva: "x".repeat(43)}),
      reservaId: "RESERVA-INEXISTENTE"
    };
    await expectRejectCode(send(client.functions, missing), "RESERVATION_NOT_FOUND");
    const reservation = await reserve(client.functions);
    await send(client.functions, payload(reservation, "primer-envio-consume-reserva"));
    await expectRejectCode(send(client.functions, payload(reservation, "segundo-envio-otra-clave")), "RESERVATION_NOT_ACTIVE");

    await seedEmulator();
    const activeReservation = await reserve(client.functions);
    await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).update({reservaActivaId: "OTRA-RESERVA"});
    await expectRejectCode(send(client.functions, payload(activeReservation)), "LINE_RESERVATION_MISMATCH");
  });

  it("rechaza una línea que ya no está EN_CONTEO", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    await adminDatabase().collection("jornadaLineas").doc(journeyLineId(1)).update({estadoCentral: "PENDIENTE_REVISION"});
    await expectRejectCode(send(client.functions, payload(reservation)), "LINE_NOT_IN_COUNT");
  });

  it("devuelve exactamente el resultado anterior para misma clave y payload", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    const request = payload(reservation, "reintento-respuesta-perdida-0001");
    const first = await send(client.functions, request);
    const second = await send(client.functions, request);
    const database = adminDatabase();
    const counts = await database.collection("conteos").where("reservaId", "==", reservation.reservaId).get();
    const audits = await database.collection("auditoria").where("tipo", "==", "CONTEO_ENVIADO").get();
    expect(second).toEqual(first);
    expect(counts.size).toBe(1);
    expect(audits.size).toBe(1);
  });

  it("rechaza la misma clave con payload diferente", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    const request = payload(reservation, "conflicto-enviar-payload-0001");
    await send(client.functions, request);
    await expectRejectCode(send(client.functions, {...request, hembras: 451}), "IDEMPOTENCY_CONFLICT");
  });

  it("acepta exactamente una de dos claves concurrentes para la misma reserva", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    const attempts = await Promise.allSettled([
      send(client.functions, payload(reservation, "concurrencia-conteo-clave-1")),
      send(client.functions, payload(reservation, "concurrencia-conteo-clave-2"))
    ]);
    const winners = attempts.filter((attempt) => attempt.status === "fulfilled");
    const losers = attempts.filter((attempt) => attempt.status === "rejected") as PromiseRejectedResult[];
    const database = adminDatabase();
    const counts = await database.collection("conteos").where("reservaId", "==", reservation.reservaId).get();
    const audits = await database.collection("auditoria").where("tipo", "==", "CONTEO_ENVIADO").get();
    const line = await database.collection("jornadaLineas").doc(journeyLineId(1)).get();
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(["RESERVATION_NOT_ACTIVE", "LINE_NOT_IN_COUNT"]).toContain(errorCode(losers[0]?.reason));
    expect(counts.size).toBe(1);
    expect(audits.size).toBe(1);
    expect(line.data()?.version).toBe(2);
  });

  it("no crea ni modifica inventario oficial ni movimientos", async () => {
    const client = await authenticatedClient();
    const reservation = await reserve(client.functions);
    const database = adminDatabase();
    const inventoryBefore = (await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data();
    await send(client.functions, payload(reservation));
    expect((await database.collection("inventarioOficialLineas").doc("LINEA-PRUEBA-1").get()).data())
      .toEqual(inventoryBefore);
    expect((await database.collection("inventarioOficialLineas").get()).size).toBe(3);
    expect((await database.collection("movimientosInventario").get()).empty).toBe(true);
  });
});
