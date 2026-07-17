import {mkdir, writeFile} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import cliApi from "firebase-tools/lib/apiv2.js";
import cliAuth from "firebase-tools/lib/auth.js";
import cliRequireAuth from "firebase-tools/lib/requireAuth.js";

import {
  PRODUCTION_PROJECT_ID,
  assertProjectId,
  maskIdentifier,
  stableHash,
} from "./core.mjs";
import {
  ALLOWED_CLASSIFICATIONS,
  BACKUP_BLOCK,
  assertPreparationRemoteRead,
  assertPrivateDataPath,
  collectExactIdentifierReferences,
  initialApplicationClassification,
  redactKnownIdentifiers,
  summarizePrivateDocument,
  validateResourceClassification,
} from "./preparation-core.mjs";

const toolDirectory = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(toolDirectory, "../../../..");
const MAX_FIRESTORE_DOCUMENTS = 10_000;
const MAX_FIRESTORE_DEPTH = 12;
const ADMINISTRATIVE_ROLES = new Set([
  "roles/owner",
  "roles/editor",
  "roles/firebase.admin",
  "roles/firebaseauth.admin",
  "roles/iam.securityAdmin",
  "roles/resourcemanager.projectIamAdmin",
]);

class ReadUnavailableError extends Error {
  constructor(status) {
    super("LECTURA_NO_DISPONIBLE");
    this.status = status;
  }
}

class StageReadError extends Error {
  constructor(stage, reason) {
    super(`${stage}_${reason}`);
  }
}

function safeReason(error) {
  if (error instanceof ReadUnavailableError) return `HTTP_${error.status}`;
  if (error instanceof StageReadError) return error.message;
  const code = String(error?.code ?? "").replaceAll(/[^A-Z0-9_-]/giu, "_").slice(0, 50);
  if (code) return `SDK_${code}`;
  const name = String(error?.name ?? "").replaceAll(/[^A-Z0-9_-]/giu, "_").slice(0, 40);
  return name ? `ERROR_${name}` : "LECTURA_NO_DISPONIBLE";
}

async function readStage(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new StageReadError(stage, safeReason(error));
  }
}

function parseArguments(args) {
  const parsed = {project: "", output: ""};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project") parsed.project = args[index + 1] ?? "";
    if (args[index] === "--output") parsed.output = args[index + 1] ?? "";
  }
  assertProjectId(parsed.project);
  if (!parsed.output) throw new Error("SALIDA_PRIVADA_REQUERIDA");
  return parsed;
}

async function authenticateFirebaseCli() {
  const account = cliAuth.getGlobalDefaultAccount();
  if (!account) throw new Error("SESION_FIREBASE_NO_DISPONIBLE");
  const options = {project: PRODUCTION_PROJECT_ID};
  cliAuth.setActiveAccount(options, account);
  await cliRequireAuth.requireAuth(options);
  const accessToken = await cliApi.getAccessToken();
  if (!accessToken) throw new Error("SESION_FIREBASE_NO_DISPONIBLE");
  return accessToken;
}

function adminCredential(accessToken) {
  return {
    async getAccessToken() {
      return {access_token: accessToken, expires_in: 3600};
    },
  };
}

async function readJson(accessToken, url, {method = "GET", body} = {}) {
  assertPreparationRemoteRead(url, method);
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-goog-user-project": PRODUCTION_PROJECT_ID,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ReadUnavailableError(response.status);
  return response.json();
}

function withQuery(base, entries) {
  const query = new URLSearchParams(
    entries.filter(([, value]) => value !== undefined && value !== ""),
  );
  return `${base}?${query.toString()}`;
}

async function listFirebaseApps(accessToken) {
  const configurations = [
    ["ANDROID", "androidApps"],
    ["WEB", "webApps"],
    ["IOS", "iosApps"],
  ];
  const items = [];
  for (const [platform, resource] of configurations) {
    let pageToken = "";
    do {
      const url = withQuery(
        `https://firebase.googleapis.com/v1beta1/projects/${PRODUCTION_PROJECT_ID}/${resource}`,
        [["pageSize", "100"], ["pageToken", pageToken]],
      );
      const page = await readJson(accessToken, url);
      for (const app of page.apps ?? []) {
        const packageName = app.packageName ?? app.bundleId ?? "";
        items.push({
          localIndex: items.length + 1,
          platform,
          displayName: String(app.displayName ?? "SIN_NOMBRE_VISIBLE"),
          packageName: String(packageName),
          state: String(app.state ?? "ESTADO_NO_DISPONIBLE"),
          appIdMasked: maskIdentifier(app.appId),
          resourceNameMasked: maskIdentifier(app.name),
          classification: initialApplicationClassification({
            displayName: app.displayName,
            packageName,
          }),
          ownerDecisionRequired: true,
        });
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  return items;
}

async function listFunctions(accessToken) {
  const items = [];
  let pageToken = "";
  do {
    const url = withQuery(
      `https://cloudfunctions.googleapis.com/v2/projects/${PRODUCTION_PROJECT_ID}/locations/us-central1/functions`,
      [
        ["pageSize", "1000"],
        ["pageToken", pageToken],
        ["fields", "functions(name,state,environment,buildConfig/runtime),nextPageToken"],
      ],
    );
    const page = await readJson(accessToken, url);
    for (const functionValue of page.functions ?? []) {
      items.push({
        name: String(functionValue.name ?? "").split("/").at(-1),
        region: "us-central1",
        state: String(functionValue.state ?? "ESTADO_NO_DISPONIBLE"),
        environment: String(functionValue.environment ?? "ENTORNO_NO_DISPONIBLE"),
        runtime: String(functionValue.buildConfig?.runtime ?? "RUNTIME_NO_DISPONIBLE"),
        classification: "CONSERVAR_HASTA_REEMPLAZO_CONTROLADO",
      });
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

function isTechnicalFunctionsBucket(name) {
  const candidate = String(name ?? "").toLocaleLowerCase("en-US");
  return candidate.includes("gcf-v2-sources-") || candidate.includes("gcf-v2-uploads-");
}

async function listStorageBuckets(accessToken) {
  const items = [];
  let pageToken = "";
  do {
    const url = withQuery("https://storage.googleapis.com/storage/v1/b", [
      ["project", PRODUCTION_PROJECT_ID],
      ["fields", "items(name,location,storageClass),nextPageToken"],
      ["pageToken", pageToken],
    ]);
    const page = await readJson(accessToken, url);
    for (const bucket of page.items ?? []) {
      items.push({
        name: String(bucket.name ?? ""),
        location: String(bucket.location ?? "UBICACION_NO_DISPONIBLE"),
        storageClass: String(bucket.storageClass ?? "CLASE_NO_DISPONIBLE"),
        technicalFunctionsBucket: isTechnicalFunctionsBucket(bucket.name),
        classification: isTechnicalFunctionsBucket(bucket.name) ? "CONSERVAR" : "REQUIERE_REVISION",
      });
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

async function listAdministrativePrincipals(accessToken) {
  const policy = await readJson(
    accessToken,
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}:getIamPolicy`,
    {method: "POST", body: {options: {requestedPolicyVersion: 3}}},
  );
  const byPrincipal = new Map();
  for (const binding of policy.bindings ?? []) {
    if (!ADMINISTRATIVE_ROLES.has(binding.role)) continue;
    for (const principal of binding.members ?? []) {
      const roles = byPrincipal.get(principal) ?? new Set();
      roles.add(binding.role);
      byPrincipal.set(principal, roles);
    }
  }
  return [...byPrincipal.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([principal, roles], index) => ({
      localIndex: index + 1,
      principal,
      principalMasked: maskIdentifier(principal),
      roles: [...roles].sort(),
      classification: "REQUIERE_REVISION",
      ownerDecisionRequired: true,
    }),
  );
}

async function listAuthUsers(app) {
  const users = [];
  let pageToken;
  do {
    const page = await getAuth(app).listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users.sort((left, right) => {
    const createdComparison = String(left.metadata.creationTime ?? "").localeCompare(
      String(right.metadata.creationTime ?? ""),
    );
    if (createdComparison !== 0) return createdComparison;
    return String(left.email ?? "").localeCompare(String(right.email ?? ""));
  });
}

function profileSummary(profile) {
  if (!profile) return {exists: false, roles: [], status: "SIN_PERFIL"};
  const roles = Array.isArray(profile.roles)
    ? profile.roles.map(String)
    : (typeof profile.rol === "string" ? [profile.rol] : []);
  let status = "ESTADO_NO_DISPONIBLE";
  if (profile.activo === true) status = "ACTIVO";
  else if (profile.activo === false) status = "INACTIVO";
  else if (typeof profile.estado === "string") status = profile.estado;
  return {exists: true, roles, status};
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return String(value.stringValue);
  if ("booleanValue" in value) return value.booleanValue === true;
  if ("integerValue" in value) {
    const numeric = Number(value.integerValue);
    return Number.isSafeInteger(numeric) ? numeric : String(value.integerValue);
  }
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return String(value.timestampValue);
  if ("referenceValue" in value) return String(value.referenceValue);
  if ("bytesValue" in value) return "BYTES_REDACTADOS";
  if ("geoPointValue" in value) {
    return {
      latitude: Number(value.geoPointValue?.latitude),
      longitude: Number(value.geoPointValue?.longitude),
    };
  }
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue?.fields ?? {});
  return "TIPO_FIRESTORE_NO_INTERPRETABLE";
}

function decodeFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );
}

async function listFirestoreCollectionIds(accessToken, parentResource) {
  const collectionIds = [];
  let pageToken = "";
  do {
    const page = await readJson(
      accessToken,
      `https://firestore.googleapis.com/v1/${parentResource}:listCollectionIds`,
      {
        method: "POST",
        body: pageToken ? {pageSize: 100, pageToken} : {pageSize: 100},
      },
    );
    collectionIds.push(...(page.collectionIds ?? []).map(String));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return collectionIds.sort((left, right) => left.localeCompare(right));
}

async function listFirestoreDocuments(accessToken, collectionPath) {
  const documents = [];
  let pageToken = "";
  do {
    const encodedPath = collectionPath.split("/").map(encodeURIComponent).join("/");
    const url = withQuery(
      `https://firestore.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/${encodedPath}`,
      [["pageSize", "1000"], ["pageToken", pageToken], ["showMissing", "false"]],
    );
    const page = await readJson(accessToken, url);
    documents.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

async function inventoryFirestore(accessToken, authUsers) {
  const identifiers = authUsers.map((user) => user.uid);
  const profileByIdentifier = new Map();
  const referencesByIdentifier = new Map(identifiers.map((identifier) => [identifier, []]));
  const groups = [];
  let documentCount = 0;

  const documentRoot =
    `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/`;
  const walkCollection = async (collectionPath, depth) => {
    if (depth > MAX_FIRESTORE_DEPTH) throw new Error("PROFUNDIDAD_FIRESTORE_EXCEDIDA");
    const documents = await listFirestoreDocuments(accessToken, collectionPath);
    const group = {
      collectionPath: redactKnownIdentifiers(collectionPath, identifiers),
      topLevelCollection: collectionPath.split("/")[0],
      depth,
      classification: "REQUIERE_REVISION",
      ownerDecisionRequired: true,
      documents: [],
    };
    groups.push(group);
    for (const documentValue of documents) {
      documentCount += 1;
      if (documentCount > MAX_FIRESTORE_DOCUMENTS) {
        throw new Error("LIMITE_DOCUMENTOS_FIRESTORE_EXCEDIDO");
      }
      const resourceName = String(documentValue.name ?? "");
      if (!resourceName.startsWith(documentRoot)) throw new Error("RUTA_FIRESTORE_INVALIDA");
      const rawPath = resourceName.slice(documentRoot.length);
      const documentId = rawPath.split("/").at(-1);
      const rawData = decodeFirestoreFields(documentValue.fields ?? {});
      if (rawPath.startsWith("usuarios/") && identifiers.includes(documentId)) {
        profileByIdentifier.set(documentId, rawData);
      }
      for (const match of collectExactIdentifierReferences(rawData, identifiers)) {
        const references = referencesByIdentifier.get(match.identifier);
        references.push({
          documentPath: redactKnownIdentifiers(rawPath, identifiers),
          field: match.field,
        });
      }
      const summary = redactKnownIdentifiers(
        summarizePrivateDocument(documentId, rawData),
        identifiers,
      );
      group.documents.push({
        documentId: identifiers.includes(documentId) ? maskIdentifier(documentId) : documentId,
        path: redactKnownIdentifiers(rawPath, identifiers),
        pathHash: `sha256:${stableHash(rawPath).slice(0, 12)}`,
        classification: "REQUIERE_REVISION",
        ...summary,
      });
      const nestedCollections = await listFirestoreCollectionIds(accessToken, resourceName);
      for (const nested of nestedCollections) {
        await walkCollection(`${rawPath}/${nested}`, depth + 1);
      }
    }
  };

  const rootResource =
    `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents`;
  const rootCollections = await listFirestoreCollectionIds(accessToken, rootResource);
  for (const collection of rootCollections) {
    await walkCollection(collection, 0);
  }
  groups.forEach((group) => {
    group.documentCount = group.documents.length;
  });
  return {groups, documentCount, profileByIdentifier, referencesByIdentifier};
}

function buildAccountClassification(authUsers, firestoreInventory) {
  return authUsers.map((user, index) => {
    const profile = profileSummary(firestoreInventory.profileByIdentifier.get(user.uid));
    const profilePath = `usuarios/${maskIdentifier(user.uid)}`;
    const operationalReferences = (firestoreInventory.referencesByIdentifier.get(user.uid) ?? [])
      .filter((reference) => reference.documentPath !== profilePath)
      .sort((left, right) => {
        const pathComparison = left.documentPath.localeCompare(right.documentPath);
        return pathComparison || left.field.localeCompare(right.field);
      });
    return {
      localIndex: index + 1,
      email: String(user.email ?? "CORREO_NO_DISPONIBLE"),
      uidMasked: maskIdentifier(user.uid),
      createdAt: String(user.metadata.creationTime ?? "FECHA_NO_DISPONIBLE"),
      lastSignInAt: String(user.metadata.lastSignInTime ?? "FECHA_NO_DISPONIBLE"),
      providers: user.providerData.map((provider) => String(provider.providerId)).sort(),
      disabled: user.disabled === true,
      profileExists: profile.exists,
      profileRoles: profile.roles,
      profileStatus: profile.status,
      operationalReferences,
      classification: "REQUIERE_REVISION",
      ownerDecisionRequired: true,
    };
  });
}

async function main() {
  if (process.env.CI) throw new Error("FIREBASE_REAL_PROHIBIDO_EN_CI");
  const args = parseArguments(process.argv.slice(2));
  const outputPath = assertPrivateDataPath(repoRoot, resolve(repoRoot, args.output), [".json"]);
  const accessToken = await authenticateFirebaseCli();
  const app = initializeApp({
    credential: adminCredential(accessToken),
    projectId: PRODUCTION_PROJECT_ID,
  }, "etapa-21-private-preparation-read-only");

  const authUsers = await readStage("AUTH_USERS", () => listAuthUsers(app));
  const firestoreInventory = await readStage(
    "FIRESTORE_INVENTORY",
    () => inventoryFirestore(accessToken, authUsers),
  );
  const applications = await readStage("FIREBASE_APPS", () => listFirebaseApps(accessToken));
  const principals = await readStage("IAM", () => listAdministrativePrincipals(accessToken));
  const functions = await readStage("FUNCTIONS", () => listFunctions(accessToken));
  const buckets = await readStage("STORAGE_BUCKETS", () => listStorageBuckets(accessToken));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectId: PRODUCTION_PROJECT_ID,
    cleanupBlock: BACKUP_BLOCK,
    safety: {
      mode: "READ_ONLY",
      privateOutput: true,
      ciRealFirebaseAllowed: false,
      remoteMutationCount: 0,
      storageObjectsOpened: 0,
      storageObjectsDownloaded: 0,
    },
    applications: {
      allowedClassifications: ALLOWED_CLASSIFICATIONS.applications,
      items: applications,
    },
    authentication: {
      allowedClassifications: ALLOWED_CLASSIFICATIONS.accounts,
      accounts: buildAccountClassification(authUsers, firestoreInventory),
    },
    firestore: {
      allowedClassifications: ALLOWED_CLASSIFICATIONS.firestore,
      totalDocuments: firestoreInventory.documentCount,
      groups: firestoreInventory.groups,
    },
    iam: {
      allowedClassifications: ALLOWED_CLASSIFICATIONS.iam,
      principals,
    },
    functions: {
      fixedDecision: "CONSERVAR_HASTA_REEMPLAZO_CONTROLADO",
      items: functions,
    },
    storage: {
      buckets,
      objects: {
        classification: "CONSERVAR",
        inspection: "NO_ENUMERADOS_NO_ABIERTOS_NO_DESCARGADOS",
      },
    },
    ownerInstructions: {
      classificationRequired: true,
      noDeletionAuthorized: true,
      noRemoteChangesAuthorized: true,
      backupRequiredBeforeCleanup: true,
    },
  };
  const classificationValidation = validateResourceClassification(report);
  if (!classificationValidation.valid) throw new Error("CLASIFICACION_PRIVADA_INVALIDA");
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log("PREPARATION_AUDIT_STATUS=complete");
  console.log(`PREPARATION_AUDIT_OUTPUT=${relative(repoRoot, outputPath).replaceAll("\\", "/")}`);
  console.log(`APPLICATIONS=${report.applications.items.length}`);
  console.log(`AUTH_ACCOUNTS=${report.authentication.accounts.length}`);
  console.log(`FIRESTORE_GROUPS=${report.firestore.groups.length}`);
  console.log(`FIRESTORE_DOCUMENTS=${report.firestore.totalDocuments}`);
  console.log(`IAM_PRINCIPALS=${report.iam.principals.length}`);
  console.log(`FUNCTIONS=${report.functions.items.length}`);
  console.log(`STORAGE_BUCKETS=${report.storage.buckets.length}`);
  console.log("REMOTE_MUTATIONS=0");
  console.log("STORAGE_OBJECTS_OPENED=0");
}

main().catch((error) => {
  console.error(`PREPARATION_AUDIT_STATUS=failed reason=${safeReason(error)}`);
  process.exitCode = 1;
});
