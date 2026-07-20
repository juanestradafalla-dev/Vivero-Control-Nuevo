import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {
  CALLABLE_NAMES,
  PRODUCTION_PROJECT_ID,
  assertRuntimeEnvironment,
} from "../src/runtimeEnvironment.js";

const originalEnvironment = {
  functionsEmulator: process.env.FUNCTIONS_EMULATOR,
  gcloudProject: process.env.GCLOUD_PROJECT,
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
  appEnv: process.env.APP_ENV,
};

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("FUNCTIONS_EMULATOR", originalEnvironment.functionsEmulator);
  restore("GCLOUD_PROJECT", originalEnvironment.gcloudProject);
  restore("GOOGLE_CLOUD_PROJECT", originalEnvironment.googleCloudProject);
  restore("APP_ENV", originalEnvironment.appEnv);
});

function configureEmulator(projectId = "demo-vivero-control-etapa3"): void {
  process.env.FUNCTIONS_EMULATOR = "true";
  process.env.GCLOUD_PROJECT = projectId;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.APP_ENV;
}

function configureProduction(
  projectId = PRODUCTION_PROJECT_ID,
  appEnv: string | null = "production",
): void {
  delete process.env.FUNCTIONS_EMULATOR;
  process.env.GCLOUD_PROJECT = projectId;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  restore("APP_ENV", appEnv ?? undefined);
}

describe("frontera central de ambientes", () => {
  it("mantiene disponible el emulador con un proyecto demo", () => {
    configureEmulator();

    expect(assertRuntimeEnvironment()).toBe("EMULATOR");
  });

  it("acepta producción solo con el proyecto y APP_ENV exactos", () => {
    configureProduction();

    expect(assertRuntimeEnvironment()).toBe("PRODUCTION");
  });

  it("rechaza cualquier otro proyecto real", () => {
    configureProduction("otro-proyecto-real");

    expect(() => assertRuntimeEnvironment())
      .toThrow(expect.objectContaining({code: "ENVIRONMENT_NOT_ALLOWED"}));
  });

  it("rechaza el proyecto correcto sin APP_ENV=production", () => {
    configureProduction(PRODUCTION_PROJECT_ID, null);
    expect(() => assertRuntimeEnvironment())
      .toThrow(expect.objectContaining({code: "ENVIRONMENT_NOT_ALLOWED"}));

    configureProduction(PRODUCTION_PROJECT_ID, "legacy");
    expect(() => assertRuntimeEnvironment())
      .toThrow(expect.objectContaining({code: "ENVIRONMENT_NOT_ALLOWED"}));
  });

  it("no convierte el emulador en producción aunque APP_ENV lo declare", () => {
    configureEmulator();
    process.env.APP_ENV = "production";

    expect(assertRuntimeEnvironment()).toBe("EMULATOR");
  });

  it("rechaza mezclar el emulador con el proyecto real", () => {
    configureEmulator(PRODUCTION_PROJECT_ID);

    expect(() => assertRuntimeEnvironment())
      .toThrow(expect.objectContaining({code: "ENVIRONMENT_NOT_ALLOWED"}));
  });

  it("rechaza identificadores de proyecto contradictorios", () => {
    configureProduction();
    process.env.GOOGLE_CLOUD_PROJECT = "otro-proyecto-real";

    expect(() => assertRuntimeEnvironment())
      .toThrow(expect.objectContaining({code: "ENVIRONMENT_NOT_ALLOWED"}));
  });
});

describe("cobertura de Callables", () => {
  const indexSource = readFileSync(resolve("src/index.ts"), "utf8");
  const exportedCallables = Array.from(
    indexSource.matchAll(/export const ([A-Za-z]+) = onCall\(/gu),
    (match) => match[1],
  );

  it("declara exactamente las 42 Callables operativas", () => {
    expect(CALLABLE_NAMES).toHaveLength(42);
    expect(exportedCallables).toEqual(CALLABLE_NAMES);
  });

  it("aplica la frontera antes de autenticar en todas las Callables", () => {
    for (const callableName of CALLABLE_NAMES) {
      const start = indexSource.indexOf(`export const ${callableName} = onCall(`);
      const next = indexSource.indexOf("\nexport const ", start + 1);
      const callableSource = indexSource.slice(start, next === -1 ? undefined : next);
      const boundaryPosition = callableSource.indexOf("assertRuntimeEnvironment();");
      const authenticationPosition = callableSource.indexOf("if (!request.auth?.uid)");

      expect(start, `${callableName} debe estar exportada`).toBeGreaterThanOrEqual(0);
      expect(boundaryPosition, `${callableName} debe usar la frontera central`).toBeGreaterThanOrEqual(0);
      expect(authenticationPosition, `${callableName} debe conservar autenticación`).toBeGreaterThan(boundaryPosition);
    }
  });

  it("exporta el trigger de informe fuera del registro de Callables", () => {
    expect(indexSource).toContain("export const procesarInformeInventario = onDocumentWritten(");
    expect(CALLABLE_NAMES).not.toContain("procesarInformeInventario");
  });
});
