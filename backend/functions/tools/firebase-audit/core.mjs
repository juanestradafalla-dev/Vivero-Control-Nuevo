import {createHash} from "node:crypto";
import {resolve, sep} from "node:path";

export const PRODUCTION_PROJECT_ID = "viverocontrol-3f83f";

export const CLASSIFICATION = Object.freeze({
  KEEP: "CONSERVAR",
  CONFIRMED_FIXTURE: "FICTICIO_CONFIRMADO",
  REVIEW: "REQUIERE_REVISION",
  INCONSISTENT: "INCONSISTENTE",
  NOT_DEPLOYED: "NO_DESPLEGADO",
});

export const EXPECTED_TOP_LEVEL_COLLECTIONS = Object.freeze([
  "usuarios",
  "ubicaciones",
  "lineas",
  "bloqueosCodigosCatalogo",
  "jornadas",
  "jornadaLineas",
  "seleccionesLineasJornada",
  "seleccionesParticipantesJornada",
  "ocupacionesLineasActivas",
  "reservas",
  "conteos",
  "decisionesRevision",
  "reasignacionesCorreccion",
  "liberacionesReserva",
  "inventarioOficialLineas",
  "cargasInventarioInicial",
  "importacionesMigracion",
  "bloqueosHashesMigracion",
  "movimientosInventario",
  "idempotencia",
  "auditoria",
]);

const SAFE_TECHNICAL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const FIXTURE_ID = /^(?:JORNADA|LINEA)-PRUEBA-/u;
const FORBIDDEN_OUTPUT_KEYS = new Set([
  "apiKey",
  "appId",
  "accessToken",
  "refreshToken",
  "token",
  "password",
  "email",
  "uid",
  "fileContents",
  "document",
  "documents",
  "fields",
  "raw",
]);

export function assertProjectId(projectId) {
  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error("PROJECT_ID_NO_AUTORIZADO");
  }
  return projectId;
}

export function stableHash(value) {
  const hash = createHash("sha256");
  hash.write(String(value), "utf8");
  return hash.digest("hex");
}

export function maskIdentifier(value) {
  if (value === undefined || value === null || String(value).length === 0) {
    return "no-disponible";
  }
  return `sha256:${stableHash(value).slice(0, 12)}`;
}

export function sanitizeTechnicalName(value) {
  const candidate = String(value ?? "");
  if (SAFE_TECHNICAL_NAME.test(candidate)) return candidate;
  return `masked-${stableHash(candidate).slice(0, 12)}`;
}

export function classifyAccount(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  return normalized.endsWith("@prueba.local")
    ? CLASSIFICATION.CONFIRMED_FIXTURE
    : CLASSIFICATION.REVIEW;
}

export function classifyDocumentMarker({id, source}) {
  if (typeof id === "string" && FIXTURE_ID.test(id)) {
    return CLASSIFICATION.CONFIRMED_FIXTURE;
  }
  if (typeof source === "string" && source.trim().toUpperCase() === "EMULATOR") {
    return CLASSIFICATION.CONFIRMED_FIXTURE;
  }
  return CLASSIFICATION.REVIEW;
}

export function assertPrivateOutputPath(repoRoot, outputPath) {
  const privateRoot = resolve(repoRoot, ".private");
  const resolvedOutput = resolve(outputPath);
  if (!resolvedOutput.startsWith(`${privateRoot}${sep}`) || !resolvedOutput.endsWith(".json")) {
    throw new Error("SALIDA_PRIVADA_REQUERIDA");
  }
  return resolvedOutput;
}

export function assertAllowedRemoteRead(urlValue, method = "GET") {
  const url = new URL(urlValue);
  const normalizedMethod = String(method).toUpperCase();
  if (url.protocol !== "https:") throw new Error("LECTURA_REMOTA_NO_PERMITIDA");
  if (url.searchParams.has("project") && url.searchParams.get("project") !== PRODUCTION_PROJECT_ID) {
    throw new Error("PROJECT_ID_NO_AUTORIZADO");
  }

  const escapedProject = PRODUCTION_PROJECT_ID;
  const getRoutes = [
    ["cloudresourcemanager.googleapis.com", new RegExp(`^/v1/projects/${escapedProject}$`, "u")],
    ["serviceusage.googleapis.com", /^\/v1\/projects\/\d+\/services(?:\/[^/]+\/consumerQuotaMetrics)?$/u],
    ["secretmanager.googleapis.com", new RegExp(`^/v1/projects/${escapedProject}/secrets$`, "u")],
    ["cloudbilling.googleapis.com", new RegExp(`^/v1/projects/${escapedProject}/billingInfo$`, "u")],
    ["billingbudgets.googleapis.com", /^\/v1\/billingAccounts\/[^/]+\/budgets$/u],
    ["firebaserules.googleapis.com", new RegExp(`^/v1/projects/${escapedProject}/(?:releases|rulesets/[^/]+)$`, "u")],
    ["firestore.googleapis.com", new RegExp(`^/v1/projects/${escapedProject}/databases/\\(default\\)/documents(?:/[^/]+)?$`, "u")],
    ["identitytoolkit.googleapis.com", new RegExp(`^/admin/v2/projects/${escapedProject}/(?:config|defaultSupportedIdpConfigs|inboundSamlConfigs|oauthIdpConfigs)$`, "u")],
    ["storage.googleapis.com", /^\/storage\/v1\/b(?:\/[^/]+\/o)?$/u],
  ];

  const isAllowedGet = normalizedMethod === "GET" && getRoutes.some(
    ([host, path]) => url.hostname === host && path.test(url.pathname),
  );
  const isAllowedPolicyQuery = normalizedMethod === "POST" &&
    url.hostname === "cloudresourcemanager.googleapis.com" &&
    url.pathname === `/v1/projects/${PRODUCTION_PROJECT_ID}:getIamPolicy`;
  const isAllowedCollectionIdQuery = normalizedMethod === "POST" &&
    url.hostname === "firestore.googleapis.com" &&
    new RegExp(
      `^/v1/projects/${escapedProject}/databases/\\(default\\)/documents(?:/[^/]+/[^/]+)?:listCollectionIds$`,
      "u",
    ).test(url.pathname);

  if (!isAllowedGet && !isAllowedPolicyQuery && !isAllowedCollectionIdQuery) {
    throw new Error("LECTURA_REMOTA_NO_PERMITIDA");
  }
  return true;
}

export function assertSafeReport(value, path = "report") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeReport(item, `${path}[${index}]`));
    return true;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_OUTPUT_KEYS.has(key)) throw new Error(`CAMPO_PRIVADO_PROHIBIDO:${path}.${key}`);
      assertSafeReport(item, `${path}.${key}`);
    }
    return true;
  }
  if (typeof value === "string") {
    if (/\bAIza[0-9A-Za-z_-]{20,}\b/u.test(value)) throw new Error("API_KEY_PROHIBIDA");
    if (/\bya29\.[0-9A-Za-z._-]+\b/u.test(value)) throw new Error("TOKEN_PROHIBIDO");
    if (/\b1:\d+:(?:android|web|ios):[0-9a-f]+\b/iu.test(value)) throw new Error("APP_ID_PROHIBIDO");
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)) throw new Error("CORREO_PROHIBIDO");
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value)) throw new Error("LLAVE_PROHIBIDA");
  }
  return true;
}

export function parseAuditArguments(args) {
  const parsed = {project: "", output: ""};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project") parsed.project = args[index + 1] ?? "";
    if (args[index] === "--output") parsed.output = args[index + 1] ?? "";
  }
  assertProjectId(parsed.project);
  if (!parsed.output) throw new Error("SALIDA_PRIVADA_REQUERIDA");
  return parsed;
}
