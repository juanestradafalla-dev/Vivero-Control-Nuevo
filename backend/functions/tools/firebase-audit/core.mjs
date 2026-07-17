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
const FIRESTORE_DOCUMENT_ROOT =
  `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents`;
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

export function summarizeFirestoreDocumentNames(documentNames) {
  let confirmedFixtures = 0;
  for (const name of documentNames) {
    const documentId = String(name).split("/").at(-1) ?? "";
    if (classifyDocumentMarker({id: documentId}) === CLASSIFICATION.CONFIRMED_FIXTURE) {
      confirmedFixtures += 1;
    }
  }
  return {
    total: documentNames.length,
    confirmedFixtures,
    reviewRequired: documentNames.length - confirmedFixtures,
  };
}

export function firestoreNestedCollectionPath(documentName, collectionId) {
  const prefix = `${FIRESTORE_DOCUMENT_ROOT}/`;
  const name = String(documentName ?? "");
  const nestedCollectionId = String(collectionId ?? "");
  const relativeDocumentPath = name.startsWith(prefix) ? name.slice(prefix.length) : "";
  const documentSegments = relativeDocumentPath.split("/");
  if (
    relativeDocumentPath.length === 0 ||
    documentSegments.length % 2 !== 0 ||
    documentSegments.some((segment) => segment.length === 0) ||
    nestedCollectionId.length === 0 ||
    nestedCollectionId.includes("/")
  ) {
    throw new Error("RUTA_FIRESTORE_NO_PERMITIDA");
  }
  return `${relativeDocumentPath}/${nestedCollectionId}`;
}

export async function inspectFirestoreSubcollections({
  documentNames,
  sampleLimit,
  listCollectionIds,
  listDocumentNames,
}) {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 1) {
    throw new Error("LIMITE_MUESTRA_NO_VALIDO");
  }
  const sampledNames = documentNames.slice(0, sampleLimit);
  const summaries = {};
  for (const documentName of sampledNames) {
    const nestedCollectionIds = await listCollectionIds(documentName);
    for (const collectionId of nestedCollectionIds) {
      const collectionPath = firestoreNestedCollectionPath(documentName, collectionId);
      const nestedDocumentNames = await listDocumentNames(collectionPath);
      const nestedSummary = summarizeFirestoreDocumentNames(nestedDocumentNames);
      const outputName = sanitizeTechnicalName(collectionId);
      const current = summaries[outputName] ?? {
        name: outputName,
        total: 0,
        confirmedFixtures: 0,
        reviewRequired: 0,
      };
      current.total += nestedSummary.total;
      current.confirmedFixtures += nestedSummary.confirmedFixtures;
      current.reviewRequired += nestedSummary.reviewRequired;
      summaries[outputName] = current;
    }
  }

  const collections = Object.values(summaries).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  return {
    total: collections.reduce((sum, collection) => sum + collection.total, 0),
    confirmedFixtures: collections.reduce(
      (sum, collection) => sum + collection.confirmedFixtures,
      0,
    ),
    reviewRequired: collections.reduce(
      (sum, collection) => sum + collection.reviewRequired,
      0,
    ),
    collections,
    sampledForSubcollections: sampledNames.length,
    scan: documentNames.length > sampledNames.length ? "MUESTRA_PARCIAL" : "COMPLETA",
  };
}

export function matchesRulesRelease(releaseName, service) {
  const marker = "/releases/";
  const name = String(releaseName ?? "");
  const markerIndex = name.lastIndexOf(marker);
  if (markerIndex < 0) return false;
  const deployedService = name.slice(markerIndex + marker.length);
  if (service === "firebase.storage") {
    return deployedService === service || deployedService.startsWith(`${service}/`);
  }
  return deployedService === service;
}

export function assertPrivateOutputPath(repoRoot, outputPath) {
  const privateRoot = resolve(repoRoot, ".private");
  const resolvedOutput = resolve(outputPath);
  if (!resolvedOutput.startsWith(`${privateRoot}${sep}`) || !resolvedOutput.endsWith(".json")) {
    throw new Error("SALIDA_PRIVADA_REQUERIDA");
  }
  return resolvedOutput;
}

function isAllowedFirestoreDocumentList(url) {
  const prefix =
    `/v1/projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/`;
  if (url.hostname !== "firestore.googleapis.com" || !url.pathname.startsWith(prefix)) {
    return false;
  }
  const segments = url.pathname.slice(prefix.length).split("/");
  if (segments.length % 2 === 0) return false;
  return segments.every((segment) => {
    if (segment.length === 0) return false;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded.length > 0 && !decoded.includes("/");
    } catch {
      return false;
    }
  });
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
    ["identitytoolkit.googleapis.com", new RegExp(`^/admin/v2/projects/${escapedProject}/(?:config|defaultSupportedIdpConfigs|inboundSamlConfigs|oauthIdpConfigs)$`, "u")],
    ["storage.googleapis.com", /^\/storage\/v1\/b(?:\/[^/]+\/o)?$/u],
  ];

  const isAllowedGet = normalizedMethod === "GET" && (
    getRoutes.some(([host, path]) => url.hostname === host && path.test(url.pathname)) ||
    isAllowedFirestoreDocumentList(url)
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
