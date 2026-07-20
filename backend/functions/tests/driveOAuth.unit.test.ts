import {afterEach, beforeEach, describe, expect, it} from "vitest";

import {
  buildGoogleDriveAuthorizationUrl,
  DRIVE_FILE_SCOPE,
  driveOAuthRuntimeConfigurationFromEnvironment,
  driveOAuthServiceAccountsFromEnvironment,
  DriveOAuthConfigurationError,
  pkceChallenge
} from "../src/domain/driveOAuth.js";
import {
  parseCompleteGoogleDriveOAuthRequest,
  parseStartGoogleDriveOAuthRequest
} from "../src/domain/validation.js";

const environmentNames = [
  "APP_ENV",
  "CI",
  "FUNCTIONS_EMULATOR",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_DRIVE_INVENTORY_PRIMARY_EMAIL",
  "GOOGLE_DRIVE_OAUTH_CLIENT_ID",
  "GOOGLE_DRIVE_OAUTH_MODE",
  "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN_SECRET",
  "GOOGLE_DRIVE_OAUTH_WRITER_SERVICE_ACCOUNT",
  "GOOGLE_DRIVE_REPORT_SERVICE_ACCOUNT"
] as const;
const originalEnvironment = new Map(environmentNames.map((name) => [name, process.env[name]]));
const fictitiousServiceAccount = (name: string): string =>
  [name, "viverocontrol-3f83f.iam.gserviceaccount.com"].join("@");

function clearEnvironment(): void {
  for (const name of environmentNames) delete process.env[name];
}

function restoreEnvironment(): void {
  for (const name of environmentNames) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

beforeEach(clearEnvironment);
afterEach(restoreEnvironment);

describe("frontera OAuth de Google Drive", () => {
  it("usa solamente drive.file, PKCE S256 y seleccion explicita", () => {
    const configuration = {
      projectId: "demo-prueba",
      mode: "oauth-user" as const,
      clientId: "cliente-ficticio.apps.googleusercontent.com",
      primaryEmail: "cuenta-prueba@example.invalid",
      refreshTokenSecret: "oauth-token-ficticio"
    };
    const url = new URL(buildGoogleDriveAuthorizationUrl(configuration, {
      redirectUri: "http://127.0.0.1:54321/",
      codeChallenge: "a".repeat(43),
      state: `00000000-0000-4000-8000-000000000000.${"b".repeat(43)}.${"c".repeat(43)}`,
      selectionKind: "CARPETA_SALIDA"
    }));

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(DRIVE_FILE_SCOPE);
    expect(url.searchParams.get("scope")).not.toBe("https://www.googleapis.com/auth/drive");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("trigger_onepick")).toBe("true");
    expect(url.searchParams.get("allow_folder_selection")).toBe("true");
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("calcula un challenge PKCE base64url determinista", () => {
    const challenge = pkceChallenge("verificador-ficticio-seguro-123456789012345678901234567890");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(challenge).toBe(pkceChallenge("verificador-ficticio-seguro-123456789012345678901234567890"));
  });

  it("acepta fake solo en emulador y produccion solo con el proyecto exacto", () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(driveOAuthRuntimeConfigurationFromEnvironment().mode).toBe("fake");

    clearEnvironment();
    process.env.APP_ENV = "production";
    process.env.GCLOUD_PROJECT = "viverocontrol-3f83f";
    process.env.GOOGLE_DRIVE_OAUTH_MODE = "oauth-user";
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID = "cliente-ficticio.apps.googleusercontent.com";
    process.env.GOOGLE_DRIVE_INVENTORY_PRIMARY_EMAIL = "cuenta-prueba@example.invalid";
    process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN_SECRET = "oauth-refresh-token";
    process.env.GOOGLE_DRIVE_OAUTH_WRITER_SERVICE_ACCOUNT =
      fictitiousServiceAccount("drive-oauth-writer");
    process.env.GOOGLE_DRIVE_REPORT_SERVICE_ACCOUNT =
      fictitiousServiceAccount("drive-report-runtime");
    expect(driveOAuthRuntimeConfigurationFromEnvironment()).toMatchObject({
      projectId: "viverocontrol-3f83f",
      mode: "oauth-user",
      primaryEmail: "cuenta-prueba@example.invalid"
    });

    delete process.env.GOOGLE_DRIVE_REPORT_SERVICE_ACCOUNT;
    expect(() => driveOAuthServiceAccountsFromEnvironment())
      .toThrow(DriveOAuthConfigurationError);
    process.env.GOOGLE_DRIVE_REPORT_SERVICE_ACCOUNT =
      process.env.GOOGLE_DRIVE_OAUTH_WRITER_SERVICE_ACCOUNT;
    expect(() => driveOAuthServiceAccountsFromEnvironment())
      .toThrow(DriveOAuthConfigurationError);
    process.env.GOOGLE_DRIVE_REPORT_SERVICE_ACCOUNT =
      fictitiousServiceAccount("drive-report-runtime");

    process.env.GCLOUD_PROJECT = "otro-proyecto";
    expect(() => driveOAuthRuntimeConfigurationFromEnvironment())
      .toThrow(DriveOAuthConfigurationError);
  });

  it("rechaza redirect distinto del loopback exacto, scopes amplios y campos adicionales", () => {
    const start = {
      tipoSeleccion: "PLANTILLA",
      uriRedireccion: "http://127.0.0.1:54321/",
      desafioCodigo: "a".repeat(43),
      claveIdempotencia: "oauth-inicio-prueba-123456"
    };
    expect(parseStartGoogleDriveOAuthRequest(start)).toEqual(start);
    expect(() => parseStartGoogleDriveOAuthRequest({...start, uriRedireccion: "http://localhost:54321/"}))
      .toThrow(expect.objectContaining({code: "INVALID_ARGUMENT"}));
    expect(() => parseStartGoogleDriveOAuthRequest({...start, secreto: "no-permitido"}))
      .toThrow(expect.objectContaining({code: "INVALID_ARGUMENT"}));

    const complete = {
      estado: `00000000-0000-4000-8000-000000000000.${"b".repeat(43)}.${"c".repeat(43)}`,
      codigoAutorizacion: "codigo-ficticio",
      verificadorCodigo: "v".repeat(64),
      uriRedireccion: start.uriRedireccion,
      idsSeleccionados: ["archivo-ficticio"],
      alcanceConcedido: DRIVE_FILE_SCOPE
    };
    expect(parseCompleteGoogleDriveOAuthRequest(complete).alcanceConcedido).toBe(DRIVE_FILE_SCOPE);
    expect(() => parseCompleteGoogleDriveOAuthRequest({
      ...complete,
      alcanceConcedido: "https://www.googleapis.com/auth/drive"
    })).toThrow(expect.objectContaining({code: "INVALID_ARGUMENT"}));
  });
});
