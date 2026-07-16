import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getAuth as getAdminAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ListManageableUsersResult,
  ReleaseReservationRequest,
  ReleaseReservationResult,
  ReserveLineRequest,
  ReserveLineResult,
  UpdateUserRoleRequest,
  UpdateUserRoleResult,
  UpdateUserStatusRequest,
  UpdateUserStatusResult
} from "../src/domain/contracts.js";
import {DEMO_PASSWORD, journeyLineId} from "../scripts/demoData.mjs";
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
    appId: `admin-users-${name}`,
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

function adminApp() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  return getAdminApps().find((candidate) => candidate.name === "admin-users-tests") ??
    initializeAdminApp({projectId}, "admin-users-tests");
}

function database() {
  return getFirestore(adminApp());
}

async function listUsers(client: Client): Promise<ListManageableUsersResult> {
  const callable = httpsCallable<Record<string, never>, ListManageableUsersResult>(
    client.functions,
    "listarUsuariosAdministrables"
  );
  return (await callable({})).data;
}

async function updateStatus(
  client: Client,
  userId: string,
  version: number,
  state: "ACTIVO" | "INACTIVO",
  key = `estado-usuario-${crypto.randomUUID()}`,
  reason = "Cambio administrativo ficticio y controlado."
): Promise<UpdateUserStatusResult> {
  const callable = httpsCallable<UpdateUserStatusRequest, UpdateUserStatusResult>(
    client.functions,
    "actualizarEstadoUsuario"
  );
  return (await callable({
    usuarioId: userId,
    versionEsperada: version,
    nuevoEstado: state,
    motivo: reason,
    claveIdempotencia: key
  })).data;
}

async function updateRole(
  client: Client,
  userId: string,
  version: number,
  role: "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR",
  key = `rol-usuario-${crypto.randomUUID()}`,
  reason = "Cambio de rol ficticio aprobado."
): Promise<UpdateUserRoleResult> {
  const callable = httpsCallable<UpdateUserRoleRequest, UpdateUserRoleResult>(
    client.functions,
    "actualizarRolUsuario"
  );
  return (await callable({
    usuarioId: userId,
    versionEsperada: version,
    nuevoRol: role,
    motivo: reason,
    claveIdempotencia: key
  })).data;
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

beforeEach(async () => {
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("administracion central de perfiles y acceso", () => {
  it("lista solo datos administrativos necesarios con advertencias de trabajo activo", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "list");
    const result = await listUsers(admin);
    const auxiliary = result.usuarios.find((user) => user.usuarioId === "uid-auxiliar-1");

    expect(auxiliary).toMatchObject({
      nombreVisible: "Auxiliar ficticio 1",
      rol: "AUXILIAR",
      activo: true,
      version: 1,
      puedeCambiarRol: false,
      resumenTrabajoActivo: {tieneTrabajoActivo: true}
    });
    expect(auxiliary?.resumenTrabajoActivo.jornadasActivas).toBeGreaterThan(0);
    expect(Object.keys(auxiliary ?? {})).not.toContain("email");
    expect(JSON.stringify(result)).not.toMatch(/password|token|customClaims/i);
  });

  it("rechaza listado y modificaciones de supervisor y auxiliar", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor-denied");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "auxiliary-denied");
    await expectRejectCode(listUsers(supervisor), "PERMISSION_DENIED");
    await expectRejectCode(listUsers(auxiliary), "PERMISSION_DENIED");
    await expectRejectCode(updateStatus(supervisor, "uid-auxiliar-2", 1, "INACTIVO"), "PERMISSION_DENIED");
    await expectRejectCode(updateRole(auxiliary, "uid-sin-acceso-prueba", 1, "SUPERVISOR"), "PERMISSION_DENIED");
  });

  it("desactiva y reactiva sin cambiar rol ni Firebase Auth", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "status");
    const auth = getAdminAuth(adminApp());
    const authBefore = await auth.getUser("uid-auxiliar-2");

    const disabled = await updateStatus(admin, "uid-auxiliar-2", 1, "INACTIVO");
    expect(disabled).toMatchObject({activo: false, rol: "AUXILIAR", version: 2});
    const enabled = await updateStatus(admin, "uid-auxiliar-2", 2, "ACTIVO");
    expect(enabled).toMatchObject({activo: true, rol: "AUXILIAR", version: 3});

    const authAfter = await auth.getUser("uid-auxiliar-2");
    expect(authAfter.disabled).toBe(authBefore.disabled);
    expect(authAfter.email).toBe(authBefore.email);
    expect(authAfter.customClaims).toEqual(authBefore.customClaims);
    expect((await database().collection("auditoria").where("recursoId", "==", "uid-auxiliar-2").get()).size)
      .toBe(2);
  });

  it("impide autodesactivacion, retirar el ultimo administrador y retirar el propio rol", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "self-protection");
    await expectRejectCode(
      updateStatus(admin, "uid-administrador", 1, "INACTIVO"),
      "SELF_DEACTIVATION_FORBIDDEN"
    );
    await expectRejectCode(
      updateRole(admin, "uid-administrador", 1, "SUPERVISOR"),
      "LAST_ACTIVE_ADMIN_REQUIRED"
    );
    await database().collection("usuarios").doc("uid-supervisor-2").update({
      roles: ["ADMINISTRADOR"],
      version: 2
    });
    await expectRejectCode(
      updateRole(admin, "uid-administrador", 1, "SUPERVISOR"),
      "SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN"
    );
  });

  it("rechaza motivo vacio, campos adicionales, rol invalido, no cambio y version obsoleta", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "validation");
    await expectRejectCode(updateStatus(admin, "uid-auxiliar-2", 1, "INACTIVO", undefined, "   "), "INVALID_ARGUMENT");
    const statusCallable = httpsCallable<Record<string, unknown>, UpdateUserStatusResult>(
      admin.functions,
      "actualizarEstadoUsuario"
    );
    await expectRejectCode(statusCallable({
      usuarioId: "uid-auxiliar-2",
      versionEsperada: 1,
      nuevoEstado: "INACTIVO",
      motivo: "Prueba",
      claveIdempotencia: "extra-field-status-15",
      email: "no-permitido@prueba.local"
    }), "INVALID_ARGUMENT");
    const roleCallable = httpsCallable<Record<string, unknown>, UpdateUserRoleResult>(
      admin.functions,
      "actualizarRolUsuario"
    );
    await expectRejectCode(roleCallable({
      usuarioId: "uid-sin-acceso-prueba",
      versionEsperada: 1,
      nuevoRol: "OPERADOR",
      motivo: "Prueba",
      claveIdempotencia: "invalid-role-etapa-15"
    }), "INVALID_ARGUMENT");
    await expectRejectCode(updateRole(admin, "uid-sin-acceso-prueba", 1, "AUXILIAR"), "USER_PROFILE_NO_CHANGE");
    await updateStatus(admin, "uid-auxiliar-2", 1, "INACTIVO");
    await expectRejectCode(updateStatus(admin, "uid-auxiliar-2", 1, "ACTIVO"), "USER_PROFILE_STALE_VERSION");
  });

  it("bloquea cambios de rol por autorizacion, reserva o correccion activa", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "role-blockers");
    await expectRejectCode(
      updateRole(admin, "uid-auxiliar-1", 1, "SUPERVISOR"),
      "USER_ROLE_CHANGE_BLOCKED_ACTIVE_WORK"
    );
    const db = database();
    await db.collection("reservas").doc("RESERVA-BLOQUEO-ROL").set({
      id: "RESERVA-BLOQUEO-ROL",
      usuarioId: "uid-sin-acceso-prueba",
      estadoReserva: "ACTIVA"
    });
    await expectRejectCode(
      updateRole(admin, "uid-sin-acceso-prueba", 1, "SUPERVISOR"),
      "USER_ROLE_CHANGE_BLOCKED_ACTIVE_WORK"
    );
    await db.collection("reservas").doc("RESERVA-BLOQUEO-ROL").delete();
    await db.collection("jornadaLineas").doc("LINEA-CORRECCION-BLOQUEO-ROL").set({
      estadoCentral: "DEVUELTA",
      responsableCorreccionUsuarioId: "uid-sin-acceso-prueba"
    });
    await expectRejectCode(
      updateRole(admin, "uid-sin-acceso-prueba", 1, "SUPERVISOR"),
      "USER_ROLE_CHANGE_BLOCKED_ACTIVE_WORK"
    );
  });

  it("desactiva con trabajo activo sin modificarlo, bloquea nuevas operaciones y permite liberacion supervisada", async () => {
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "active-work-owner");
    const reserve = httpsCallable<ReserveLineRequest, ReserveLineResult>(auxiliary.functions, "reservarLinea");
    const reservation = (await reserve({
      jornadaLineaId: journeyLineId(1),
      dispositivoId: "dispositivo-etapa-15",
      claveIdempotencia: "reserva-previa-etapa-15"
    })).data;
    const db = database();
    const reservationBefore = (await db.collection("reservas").doc(reservation.reservaId).get()).data();
    const lineBefore = (await db.collection("jornadaLineas").doc(journeyLineId(1)).get()).data();
    const admin = await authenticatedClient("administrador@prueba.local", "deactivate-active-work");
    const disabled = await updateStatus(admin, "uid-auxiliar-1", 1, "INACTIVO");
    expect(disabled.resumenTrabajoActivo.reservasActivas).toBe(1);
    expect((await db.collection("reservas").doc(reservation.reservaId).get()).data()).toEqual(reservationBefore);
    expect((await db.collection("jornadaLineas").doc(journeyLineId(1)).get()).data()).toEqual(lineBefore);

    const listActive = httpsCallable<Record<string, never>, unknown>(auxiliary.functions, "listarJornadasActivas");
    await expectRejectCode(listActive({}), "USER_INACTIVE");

    const supervisor = await authenticatedClient("supervisor@prueba.local", "release-preserved-work");
    const release = httpsCallable<ReleaseReservationRequest, ReleaseReservationResult>(
      supervisor.functions,
      "liberarReservaLinea"
    );
    const released = (await release({
      reservaId: reservation.reservaId,
      motivo: "Liberacion supervisada posterior a la desactivacion.",
      claveIdempotencia: "liberar-trabajo-etapa-15"
    })).data;
    expect(released.estadoReserva).toBe("LIBERADA");
  });

  it("cambia un rol seguro sin modificar nombres o roles historicos", async () => {
    const db = database();
    const historical = {
      usuarioId: "uid-sin-acceso-prueba",
      usuarioNombreVisible: "Nombre historico conservado",
      rolEfectivo: "AUXILIAR",
      estadoReserva: "CONSUMIDA"
    };
    await db.collection("reservas").doc("RESERVA-HISTORICA-ETAPA-15").set(historical);
    await db.collection("auditoria").doc("AUDITORIA-HISTORICA-ETAPA-15").set({
      actorUsuarioId: "uid-sin-acceso-prueba",
      actorNombreVisible: "Nombre historico conservado",
      rolEfectivo: "AUXILIAR"
    });
    const admin = await authenticatedClient("administrador@prueba.local", "safe-role");
    const result = await updateRole(admin, "uid-sin-acceso-prueba", 1, "SUPERVISOR");
    expect(result).toMatchObject({rol: "SUPERVISOR", version: 2, puedeCambiarRol: true});
    expect((await db.collection("reservas").doc("RESERVA-HISTORICA-ETAPA-15").get()).data()).toEqual(historical);
    expect((await db.collection("auditoria").doc("AUDITORIA-HISTORICA-ETAPA-15").get()).data())
      .toMatchObject({actorNombreVisible: "Nombre historico conservado", rolEfectivo: "AUXILIAR"});
  });

  it("recupera el mismo resultado idempotente y rechaza otro payload", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "idempotency");
    const key = "estado-idempotente-etapa-15";
    const first = await updateStatus(admin, "uid-auxiliar-2", 1, "INACTIVO", key);
    const repeated = await updateStatus(admin, "uid-auxiliar-2", 1, "INACTIVO", key);
    expect(repeated).toEqual(first);
    await expectRejectCode(
      updateStatus(admin, "uid-auxiliar-2", 1, "INACTIVO", key, "Otro motivo"),
      "IDEMPOTENCY_CONFLICT"
    );
    expect((await database().collection("auditoria").where("recursoId", "==", "uid-auxiliar-2").get()).size)
      .toBe(1);
  });

  it("serializa carreras entre dos administradores con un solo ganador", async () => {
    const db = database();
    await db.collection("usuarios").doc("uid-supervisor-2").update({roles: ["ADMINISTRADOR"], version: 2});
    const firstAdmin = await authenticatedClient("administrador@prueba.local", "race-admin-1");
    const secondAdmin = await authenticatedClient("supervisor2@prueba.local", "race-admin-2");
    const attempts = await Promise.allSettled([
      updateStatus(firstAdmin, "uid-auxiliar-2", 1, "INACTIVO", "race-status-admin-1"),
      updateStatus(secondAdmin, "uid-auxiliar-2", 1, "INACTIVO", "race-status-admin-2")
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    expect(errorCode(rejected?.reason)).toBe("USER_PROFILE_STALE_VERSION");
    expect((await db.collection("usuarios").doc("uid-auxiliar-2").get()).data()).toMatchObject({
      activo: false,
      version: 2
    });
    expect((await db.collection("auditoria").where("recursoId", "==", "uid-auxiliar-2").get()).size).toBe(1);
  });
});
