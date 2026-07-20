import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  CompleteGoogleDriveOAuthRequest,
  CompleteGoogleDriveOAuthResult,
  GoogleDriveConnectionStatusResult,
  RevokeGoogleDriveOAuthRequest,
  RevokeGoogleDriveOAuthResult,
  StartGoogleDriveOAuthRequest,
  StartGoogleDriveOAuthResult
} from "../src/domain/contracts.js";
import {
  CompleteGoogleDriveOAuthService,
  DRIVE_FILE_SCOPE,
  FakeDriveOAuthProvider,
  pkceChallenge,
  StartGoogleDriveOAuthService
} from "../src/domain/driveOAuth.js";
import {DEMO_PASSWORD} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const redirectUri = "http://127.0.0.1:54321/";
const verifier = "v".repeat(64);
const clientApps: FirebaseApp[] = [];

interface Client {readonly auth: Auth; readonly functions: Functions}

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `drive-oauth-${name}`,
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

function database() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getAdminApps().find((candidate) => candidate.name === "drive-oauth-tests") ??
    initializeAdminApp({projectId}, "drive-oauth-tests");
  return getFirestore(app);
}

function startRequest(
  selection: StartGoogleDriveOAuthRequest["tipoSeleccion"],
  key = `oauth-inicio-${crypto.randomUUID()}`
): StartGoogleDriveOAuthRequest {
  return {
    tipoSeleccion: selection,
    uriRedireccion: redirectUri,
    desafioCodigo: pkceChallenge(verifier),
    claveIdempotencia: key
  };
}

async function start(client: Client, request: StartGoogleDriveOAuthRequest): Promise<StartGoogleDriveOAuthResult> {
  const callable = httpsCallable<StartGoogleDriveOAuthRequest, StartGoogleDriveOAuthResult>(
    client.functions, "iniciarConexionGoogleDrive"
  );
  return (await callable(request)).data;
}

function completeRequest(started: StartGoogleDriveOAuthResult, selectedId: string): CompleteGoogleDriveOAuthRequest {
  const state = new URL(started.urlAutorizacion).searchParams.get("state");
  if (!state) throw new Error("La URL OAuth ficticia no contiene state.");
  return {
    estado: state,
    codigoAutorizacion: `codigo-${crypto.randomUUID()}`,
    verificadorCodigo: verifier,
    uriRedireccion: redirectUri,
    idsSeleccionados: [selectedId],
    alcanceConcedido: DRIVE_FILE_SCOPE
  };
}

async function complete(
  client: Client,
  request: CompleteGoogleDriveOAuthRequest
): Promise<CompleteGoogleDriveOAuthResult> {
  const callable = httpsCallable<CompleteGoogleDriveOAuthRequest, CompleteGoogleDriveOAuthResult>(
    client.functions, "completarConexionGoogleDrive"
  );
  return (await callable(request)).data;
}

async function status(client: Client): Promise<GoogleDriveConnectionStatusResult> {
  const callable = httpsCallable<Record<string, never>, GoogleDriveConnectionStatusResult>(
    client.functions, "obtenerEstadoConexionGoogleDrive"
  );
  return (await callable({})).data;
}

beforeEach(async () => {
  process.env.FUNCTIONS_EMULATOR = "true";
  FakeDriveOAuthProvider.reset();
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("OAuth de usuario para Google Drive", () => {
  it("niega acceso sin autenticacion y a roles no administradores", async () => {
    const anonymous = createClient("anonimo");
    await expect(start(anonymous, startRequest("PLANTILLA")))
      .rejects.toMatchObject({code: "functions/unauthenticated"});

    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor");
    await expect(start(supervisor, startRequest("PLANTILLA")))
      .rejects.toMatchObject({details: expect.objectContaining({code: "PERMISSION_DENIED"})});
  });

  it("selecciona plantilla y carpeta, conserva el token fuera de Firestore y revoca", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "admin-flow");
    const templateStart = await start(administrator, startRequest("PLANTILLA"));
    expect(new URL(templateStart.urlAutorizacion).searchParams.get("scope")).toBe(DRIVE_FILE_SCOPE);
    const templateRequest = completeRequest(templateStart, "plantilla-ficticia");
    const templateResult = await complete(administrator, templateRequest);
    expect(templateResult).toMatchObject({estado: "CONECTADO_INCOMPLETO", tipoSeleccion: "PLANTILLA"});
    expect(await complete(administrator, templateRequest)).toEqual(templateResult);

    const folderStart = await start(administrator, startRequest("CARPETA_SALIDA"));
    const folderResult = await complete(administrator, completeRequest(folderStart, "carpeta-ficticia"));
    expect(folderResult).toMatchObject({estado: "LISTO", tipoSeleccion: "CARPETA_SALIDA"});
    expect(await status(administrator)).toMatchObject({
      estado: "LISTO",
      plantillaNombre: "INVENTARIO PRUEBA.xlsx",
      carpetaNombre: "INVENTARIOS PRUEBA"
    });

    const snapshots = await Promise.all([
      database().collection("sesionesOAuthDrive").get(),
      database().collection("configuracionesIntegraciones").get(),
      database().collection("idempotencia").get(),
      database().collection("auditoria").get()
    ]);
    const serialized = JSON.stringify(snapshots.flatMap((snapshot) =>
      snapshot.docs.map((document) => document.data())
    ));
    expect(serialized).not.toContain("refresh-token-ficticio-no-real");
    expect(serialized).not.toContain("codigo-ficticio");

    const revoke = httpsCallable<RevokeGoogleDriveOAuthRequest, RevokeGoogleDriveOAuthResult>(
      administrator.functions, "revocarConexionGoogleDrive"
    );
    const key = `oauth-revocar-${crypto.randomUUID()}`;
    const first = (await revoke({claveIdempotencia: key})).data;
    expect((await revoke({claveIdempotencia: key})).data).toEqual(first);
    expect(await status(administrator)).toMatchObject({estado: "REVOCADO"});

    const reconnectStart = await start(administrator, startRequest("PLANTILLA"));
    await complete(administrator, completeRequest(reconnectStart, "plantilla-ficticia-nueva"));
    const reconnectStatus = await status(administrator);
    expect(reconnectStatus).toMatchObject({estado: "CONECTADO_INCOMPLETO"});
    expect(reconnectStatus).not.toHaveProperty("carpetaNombre");
  });

  it("recupera inicio idempotente y detecta conflicto de payload", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "admin-idempotency");
    const key = `oauth-inicio-${crypto.randomUUID()}`;
    const request = startRequest("PLANTILLA", key);
    const first = await start(administrator, request);
    expect(await start(administrator, request)).toEqual(first);
    await expect(start(administrator, {...request, tipoSeleccion: "CARPETA_SALIDA"}))
      .rejects.toMatchObject({details: expect.objectContaining({code: "IDEMPOTENCY_CONFLICT"})});
  });

  it("revoca y rechaza una cuenta OAuth distinta antes de persistir la seleccion", async () => {
    class MismatchedProvider extends FakeDriveOAuthProvider {
      override expectedAccountEmail(): string {
        return "cuenta-esperada@example.invalid";
      }

      override async exchangeAndValidate(input: Parameters<FakeDriveOAuthProvider["exchangeAndValidate"]>[0]) {
        const result = await super.exchangeAndValidate(input);
        return {...result, accountEmail: "otra-cuenta@example.invalid"};
      }
    }
    const provider = new MismatchedProvider();
    const starter = new StartGoogleDriveOAuthService(database(), provider);
    const completer = new CompleteGoogleDriveOAuthService(database(), provider);
    const started = await starter.execute(startRequest("PLANTILLA"), {actorId: "uid-administrador"});

    await expect(completer.execute(completeRequest(started, "plantilla-ficticia"), {
      actorId: "uid-administrador"
    })).rejects.toMatchObject({code: "DRIVE_OAUTH_ACCOUNT_MISMATCH"});
    expect((await database().collection("configuracionesIntegraciones")
      .doc("googleDriveInventario").get()).exists).toBe(false);
  });

  it("sanitiza invalid_grant y exige iniciar una conexion nueva", async () => {
    const administrator = await authenticatedClient("administrador@prueba.local", "admin-invalid-grant");
    const started = await start(administrator, startRequest("PLANTILLA"));
    const request = {...completeRequest(started, "plantilla-ficticia"), codigoAutorizacion: "invalid-grant"};

    await expect(complete(administrator, request))
      .rejects.toMatchObject({details: expect.objectContaining({code: "DRIVE_OAUTH_INVALID_GRANT"})});
    expect((await database().collection("configuracionesIntegraciones")
      .doc("googleDriveInventario").get()).exists).toBe(false);
    const sessions = await database().collection("sesionesOAuthDrive")
      .where("actorUsuarioId", "==", "uid-administrador").get();
    expect(sessions.docs.some((document) => document.data().estado === "ERROR_REQUIERE_RECONEXION"))
      .toBe(true);
  });
});
