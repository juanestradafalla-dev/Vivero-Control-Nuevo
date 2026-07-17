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
  httpsCallable: vi.fn(),
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
});
