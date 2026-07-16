import {afterEach, describe, expect, it} from "vitest";

import {assertEmulatorOnly} from "../src/index.js";

const originalFunctionsEmulator = process.env.FUNCTIONS_EMULATOR;
const originalProject = process.env.GCLOUD_PROJECT;
const originalGoogleProject = process.env.GOOGLE_CLOUD_PROJECT;

afterEach(() => {
  process.env.FUNCTIONS_EMULATOR = originalFunctionsEmulator;
  process.env.GCLOUD_PROJECT = originalProject;
  process.env.GOOGLE_CLOUD_PROJECT = originalGoogleProject;
});

describe("bloqueo emulator-only compartido", () => {
  it("rechaza proyecto real aunque FUNCTIONS_EMULATOR esté activo", () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.GCLOUD_PROJECT = "vivero-productivo-prohibido";
    expect(() => assertEmulatorOnly()).toThrow(expect.objectContaining({code: "EMULATOR_ONLY"}));
  });

  it("rechaza un proyecto demo fuera de Functions Emulator", () => {
    process.env.FUNCTIONS_EMULATOR = "false";
    process.env.GCLOUD_PROJECT = "demo-vivero-control-etapa3";
    expect(() => assertEmulatorOnly()).toThrow(expect.objectContaining({code: "EMULATOR_ONLY"}));
  });

  it("acepta únicamente la combinación demo y emulador", () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.GCLOUD_PROJECT = "demo-vivero-control-etapa3";
    expect(() => assertEmulatorOnly()).not.toThrow();
  });
});
