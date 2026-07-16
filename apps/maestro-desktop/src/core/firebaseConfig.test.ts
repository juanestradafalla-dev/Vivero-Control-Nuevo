import {describe, expect, it} from "vitest";

import {loadFirebaseConfig} from "./firebaseConfig";

const emulatorEnvironment = {
  VITE_APP_ENV: "emulator",
  VITE_FIREBASE_PROJECT_ID: "demo-vivero-control-etapa3",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:1234567890:web:demo-etapa3",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-vivero-control-etapa3.firebaseapp.com",
  VITE_USE_FIREBASE_EMULATORS: "true",
};

describe("configuración Firebase de Maestro", () => {
  it("conserva emulator para proyectos demo", () => {
    const config = loadFirebaseConfig(emulatorEnvironment);

    expect(config).toMatchObject({
      environment: "EMULATOR",
      projectId: "demo-vivero-control-etapa3",
      useEmulators: true,
    });
  });

  it("admite staging únicamente en el proyecto autorizado y sin emuladores", () => {
    const config = loadFirebaseConfig({
      ...emulatorEnvironment,
      VITE_APP_ENV: "staging",
      VITE_FIREBASE_PROJECT_ID: "viverocontrol-3f83f",
      VITE_USE_FIREBASE_EMULATORS: "false",
    });

    expect(config).toMatchObject({
      environment: "STAGING",
      projectId: "viverocontrol-3f83f",
      useEmulators: false,
    });
  });

  it("rechaza proyecto staging incorrecto, producción y configuración faltante", () => {
    expect(() => loadFirebaseConfig({
      ...emulatorEnvironment,
      VITE_APP_ENV: "staging",
      VITE_FIREBASE_PROJECT_ID: "otro-proyecto",
      VITE_USE_FIREBASE_EMULATORS: "false",
    })).toThrow(/viverocontrol-3f83f/);
    expect(() => loadFirebaseConfig({...emulatorEnvironment, VITE_APP_ENV: "production"})).toThrow(/emulator o staging/);
    expect(() => loadFirebaseConfig({...emulatorEnvironment, VITE_FIREBASE_API_KEY: ""})).toThrow(/VITE_FIREBASE_API_KEY/);
  });
});
