import {beforeEach, describe, expect, it, vi} from "vitest";

import type {FirebaseRuntimeConfig} from "../core/firebaseConfig";

const firebase = vi.hoisted(() => ({
  app: {name: "vivero-maestro-prueba"},
  auth: {},
  firestore: {},
  functions: {},
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  getFunctions: vi.fn(),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock("firebase/app", () => ({getApps: firebase.getApps, initializeApp: firebase.initializeApp}));
vi.mock("firebase/auth", () => ({
  connectAuthEmulator: firebase.connectAuthEmulator,
  getAuth: firebase.getAuth,
  signInWithEmailAndPassword: vi.fn(),
}));
vi.mock("firebase/functions", () => ({
  connectFunctionsEmulator: firebase.connectFunctionsEmulator,
  getFunctions: firebase.getFunctions,
  httpsCallable: firebase.httpsCallable,
}));
vi.mock("firebase/firestore", () => ({
  Timestamp: class Timestamp {},
  collection: vi.fn(),
  connectFirestoreEmulator: firebase.connectFirestoreEmulator,
  doc: vi.fn(),
  getDoc: vi.fn(),
  getFirestore: firebase.getFirestore,
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import {FirebaseMonitorRepository} from "./FirebaseMonitorRepository";

const config = (environment: "EMULATOR" | "PRODUCTION"): FirebaseRuntimeConfig => ({
  environment,
  projectId: environment === "EMULATOR" ? "demo-vivero-control-etapa3" : "viverocontrol-3f83f",
  apiKey: "valor-ficticio",
  appId: "app-ficticia",
  authDomain: "dominio-ficticio",
  useEmulators: environment === "EMULATOR",
  emulatorHost: "127.0.0.1",
});

beforeEach(() => {
  vi.clearAllMocks();
  firebase.getApps.mockReturnValue([]);
  firebase.initializeApp.mockReturnValue(firebase.app);
  firebase.getAuth.mockReturnValue(firebase.auth);
  firebase.getFirestore.mockReturnValue(firebase.firestore);
  firebase.getFunctions.mockReturnValue(firebase.functions);
});

describe("conexión Firebase de Maestro", () => {
  it("conecta los tres emuladores en modo emulator", () => {
    FirebaseMonitorRepository.create(config("EMULATOR"));

    expect(firebase.connectAuthEmulator).toHaveBeenCalledOnce();
    expect(firebase.connectFirestoreEmulator).toHaveBeenCalledOnce();
    expect(firebase.connectFunctionsEmulator).toHaveBeenCalledOnce();
  });

  it("no conecta ningún emulador en production y conserva us-central1", () => {
    const repository = FirebaseMonitorRepository.create(config("PRODUCTION"));

    expect(repository.environment).toBe("PRODUCTION");
    expect(firebase.connectAuthEmulator).not.toHaveBeenCalled();
    expect(firebase.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(firebase.connectFunctionsEmulator).not.toHaveBeenCalled();
    expect(firebase.getFunctions).toHaveBeenCalledWith(firebase.app, "us-central1");
  });

  it("crea un usuario mediante la Callable administrativa y convierte el resultado", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        operacion: "USUARIO_CREADO",
        usuarioId: "uid-nuevo",
        nombreVisible: "Usuario Nuevo",
        rol: "SUPERVISOR",
        activo: true,
        version: 1,
        puedeCambiarRol: true,
        resumenTrabajoActivo: {
          jornadasActivas: 0,
          reservasActivas: 0,
          correccionesPendientes: 0,
          tieneTrabajoActivo: false,
          bloqueosCambioRol: [],
        },
        creadoEn: "2026-07-18T12:00:00.000Z",
      },
    });
    firebase.httpsCallable.mockReturnValue(invoke);
    const repository = FirebaseMonitorRepository.create(config("EMULATOR"));

    await expect(repository.createManageableUser(
      "Usuario Nuevo",
      "nuevo@example.test",
      "clave-ficticia-8",
      "SUPERVISOR",
      "idempotencia-usuario-0001",
    )).resolves.toMatchObject({
      id: "uid-nuevo",
      displayName: "Usuario Nuevo",
      role: "SUPERVISOR",
      active: true,
      version: 1,
    });
    expect(firebase.httpsCallable).toHaveBeenCalledWith(firebase.functions, "crearUsuarioAdministrable");
    expect(invoke).toHaveBeenCalledWith({
      nombreVisible: "Usuario Nuevo",
      correo: "nuevo@example.test",
      password: "clave-ficticia-8",
      rol: "SUPERVISOR",
      claveIdempotencia: "idempotencia-usuario-0001",
    });
  });

  it("presenta mensajes controlados para correo duplicado y contraseña débil", async () => {
    const invoke = vi.fn()
      .mockRejectedValueOnce({
        code: "functions/already-exists",
        message: "No fue posible crear la cuenta.",
        details: {code: "USER_EMAIL_ALREADY_EXISTS"},
      })
      .mockRejectedValueOnce({
        code: "functions/invalid-argument",
        message: "No fue posible crear la cuenta.",
        details: {code: "USER_PASSWORD_WEAK"},
      });
    firebase.httpsCallable.mockReturnValue(invoke);
    const repository = FirebaseMonitorRepository.create(config("EMULATOR"));
    const create = () => repository.createManageableUser(
      "Usuario Nuevo", "nuevo@example.test", "clave-ficticia-8", "AUXILIAR", "idempotencia-usuario-0001",
    );

    await expect(create()).rejects.toThrow("El correo ya está registrado.");
    await expect(create()).rejects.toThrow("La contraseña no cumple los requisitos de seguridad.");
  });
});
