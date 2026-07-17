import {describe, expect, it} from "vitest";

import {PRODUCTION_PROJECT_ID, loadFirebaseConfig} from "./firebaseConfig";

const emulatorEnvironment = {
  VITE_APP_ENV: "emulator",
  VITE_FIREBASE_PROJECT_ID: "demo-vivero-control-etapa3",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:1234567890:web:demo-etapa3",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-vivero-control-etapa3.firebaseapp.com",
  VITE_USE_FIREBASE_EMULATORS: "true",
};

const productionEnvironment = {
  ...emulatorEnvironment,
  VITE_APP_ENV: "production",
  VITE_FIREBASE_PROJECT_ID: PRODUCTION_PROJECT_ID,
  VITE_USE_FIREBASE_EMULATORS: "false",
};

describe("configuración Firebase de Maestro", () => {
  it("conserva emulator para proyectos demo", () => {
    expect(loadFirebaseConfig(emulatorEnvironment)).toMatchObject({
      environment: "EMULATOR",
      projectId: "demo-vivero-control-etapa3",
      useEmulators: true,
    });
  });

  it("admite production únicamente en el proyecto autorizado y sin emuladores", () => {
    expect(loadFirebaseConfig(productionEnvironment)).toMatchObject({
      environment: "PRODUCTION",
      projectId: PRODUCTION_PROJECT_ID,
      useEmulators: false,
    });
  });

  it("rechaza otro proyecto real", () => {
    expect(() => loadFirebaseConfig({
      ...productionEnvironment,
      VITE_FIREBASE_PROJECT_ID: "otro-proyecto-real",
    })).toThrow(/viverocontrol-3f83f/);
  });

  it("rechaza production con emuladores o configuración incompleta", () => {
    expect(() => loadFirebaseConfig({
      ...productionEnvironment,
      VITE_USE_FIREBASE_EMULATORS: "true",
    })).toThrow(/sin emuladores/);
    expect(() => loadFirebaseConfig({...productionEnvironment, VITE_FIREBASE_API_KEY: ""}))
      .toThrow(/VITE_FIREBASE_API_KEY/);
  });

  it("rechaza cualquier tercer ambiente", () => {
    expect(() => loadFirebaseConfig({...emulatorEnvironment, VITE_APP_ENV: "legacy"}))
      .toThrow(/emulator o production/);
  });
});
