import {afterEach, describe, expect, it} from "vitest";

import {assertActiveJourneysReadEnvironment, assertEmulatorOnly} from "../src/index.js";

const original = {
  functionsEmulator: process.env.FUNCTIONS_EMULATOR,
  project: process.env.GCLOUD_PROJECT,
  googleProject: process.env.GOOGLE_CLOUD_PROJECT,
  appEnv: process.env.APP_ENV
};

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("FUNCTIONS_EMULATOR", original.functionsEmulator);
  restore("GCLOUD_PROJECT", original.project);
  restore("GOOGLE_CLOUD_PROJECT", original.googleProject);
  restore("APP_ENV", original.appEnv);
});

function staging(projectId = "viverocontrol-3f83f", appEnv: string | undefined = "staging"): void {
  delete process.env.FUNCTIONS_EMULATOR;
  process.env.GCLOUD_PROJECT = projectId;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  restore("APP_ENV", appEnv);
}

describe("frontera de Firebase staging", () => {
  it("mantiene listarJornadasActivas disponible en el emulador", () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.GCLOUD_PROJECT = "demo-vivero-control-etapa3";
    delete process.env.APP_ENV;

    expect(() => assertActiveJourneysReadEnvironment()).not.toThrow();
  });

  it("permite la lectura solo en el proyecto staging y APP_ENV exactos", () => {
    staging();

    expect(() => assertActiveJourneysReadEnvironment()).not.toThrow();
  });

  it("rechaza otro proyecto real y staging sin APP_ENV", () => {
    staging("otro-proyecto-real");
    expect(() => assertActiveJourneysReadEnvironment())
      .toThrow(expect.objectContaining({code: "EMULATOR_ONLY"}));

    staging();
    delete process.env.APP_ENV;
    expect(() => assertActiveJourneysReadEnvironment())
      .toThrow(expect.objectContaining({code: "EMULATOR_ONLY"}));
  });

  it("mantiene todas las operaciones mutables cerradas en staging", () => {
    staging();

    expect(() => assertEmulatorOnly()).toThrow(expect.objectContaining({code: "EMULATOR_ONLY"}));
  });
});
