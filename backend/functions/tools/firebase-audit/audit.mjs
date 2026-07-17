import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import cliApi from "firebase-tools/lib/apiv2.js";
import cliAuth from "firebase-tools/lib/auth.js";
import cliRequireAuth from "firebase-tools/lib/requireAuth.js";

import {
  CLASSIFICATION,
  EXPECTED_TOP_LEVEL_COLLECTIONS,
  PRODUCTION_PROJECT_ID,
  assertAllowedRemoteRead,
  assertPrivateOutputPath,
  assertSafeReport,
  classifyAccount,
  inspectFirestoreSubcollections,
  maskIdentifier,
  matchesRulesRelease,
  parseAuditArguments,
  sanitizeTechnicalName,
  stableHash,
  summarizeFirestoreDocumentNames,
} from "./core.mjs";

const toolDirectory = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(toolDirectory, "../../../..");
const MAX_SUBCOLLECTION_SAMPLE = 50;
const MAX_STORAGE_OBJECTS = 10_000;

class ReadUnavailableError extends Error {
  constructor(section, status) {
    super("LECTURA_NO_DISPONIBLE");
    this.section = section;
    this.status = status;
  }
}

function safeReason(error) {
  if (error instanceof ReadUnavailableError) return `HTTP_${error.status}`;
  const code = String(error?.code ?? "");
  if (/^[A-Za-z0-9_-]{1,40}$/u.test(code)) return `SDK_${code}`;
  return "LECTURA_NO_DISPONIBLE";
}

async function safeSection(name, warnings, operation) {
  try {
    return await operation();
  } catch (error) {
    const reason = safeReason(error);
    warnings.push({section: name, reason});
    return {status: "NO_CONSULTABLE", reason};
  }
}

async function readJson(accessToken, section, url, {method = "GET", body} = {}) {
  assertAllowedRemoteRead(url, method);
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
  if (!response.ok) throw new ReadUnavailableError(section, response.status);
  return response.json();
}

function withQuery(base, entries) {
  const params = new URLSearchParams(
    entries.filter(([, value]) => value !== undefined && value !== ""),
  );
  return `${base}?${params.toString()}`;
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

async function auditUsers(app) {
  let pageToken;
  let total = 0;
  let confirmedFixtures = 0;
  let reviewRequired = 0;
  const providerUsage = new Set();
  do {
    const page = await getAuth(app).listUsers(1000, pageToken);
    for (const user of page.users) {
      total += 1;
      if (classifyAccount(user.email) === CLASSIFICATION.CONFIRMED_FIXTURE) confirmedFixtures += 1;
      else reviewRequired += 1;
      for (const provider of user.providerData) {
        providerUsage.add(sanitizeTechnicalName(provider.providerId));
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return {
    status: "CONSULTADO",
    total,
    confirmedFixtures,
    reviewRequired,
    providerUsage: [...providerUsage].sort(),
  };
}

async function listCollectionIds(accessToken, parentResource) {
  const collectionIds = [];
  let pageToken = "";
  do {
    const body = pageToken ? {pageSize: 100, pageToken} : {pageSize: 100};
    const page = await readJson(
      accessToken,
      "firestore-collection-ids",
      `https://firestore.googleapis.com/v1/${parentResource}:listCollectionIds`,
      {method: "POST", body},
    );
    collectionIds.push(...(page.collectionIds ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return collectionIds;
}

async function listDocumentNames(accessToken, collectionName) {
  const documentNames = [];
  let pageToken = "";
  do {
    const encodedCollectionPath = collectionName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const url = withQuery(
      `https://firestore.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/${encodedCollectionPath}`,
      [
        ["pageSize", "1000"],
        ["pageToken", pageToken],
        ["mask.fieldPaths", "campo_inexistente_etapa21_solo_lectura_7f4c9d"],
      ],
    );
    const page = await readJson(accessToken, "firestore-document-names", url);
    documentNames.push(...(page.documents ?? []).map((document) => String(document.name ?? "")));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return documentNames;
}

async function auditFirestore(accessToken) {
  const rootResource = `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents`;
  const collectionIds = await listCollectionIds(accessToken, rootResource);
  const collections = [];
  let totalDocuments = 0;
  let topLevelDocuments = 0;
  let documentCountStatus = "COMPLETO";

  for (const collectionId of collectionIds.sort((left, right) => left.localeCompare(right))) {
    const documentNames = await listDocumentNames(accessToken, collectionId);
    const topLevelSummary = summarizeFirestoreDocumentNames(documentNames);
    let subcollectionSummary = {
      total: 0,
      confirmedFixtures: 0,
      reviewRequired: 0,
      collections: [],
      sampledForSubcollections: 0,
      scan: "NO_CONSULTABLE",
    };
    try {
      subcollectionSummary = await inspectFirestoreSubcollections({
        documentNames,
        sampleLimit: MAX_SUBCOLLECTION_SAMPLE,
        listCollectionIds: (documentName) => listCollectionIds(accessToken, documentName),
        listDocumentNames: (collectionPath) => listDocumentNames(accessToken, collectionPath),
      });
    } catch {
      documentCountStatus = "MINIMO_NO_CONSULTABLE";
    }

    if (
      subcollectionSummary.scan === "MUESTRA_PARCIAL" &&
      documentCountStatus === "COMPLETO"
    ) {
      documentCountStatus = "MINIMO_PARCIAL";
    }
    const total = topLevelSummary.total + subcollectionSummary.total;
    const confirmedFixtures =
      topLevelSummary.confirmedFixtures + subcollectionSummary.confirmedFixtures;
    const reviewRequired = topLevelSummary.reviewRequired + subcollectionSummary.reviewRequired;
    topLevelDocuments += topLevelSummary.total;
    totalDocuments += total;
    collections.push({
      name: sanitizeTechnicalName(collectionId),
      topLevelTotal: topLevelSummary.total,
      subcollectionTotal: subcollectionSummary.total,
      total,
      structureClassification: EXPECTED_TOP_LEVEL_COLLECTIONS.includes(collectionId)
        ? CLASSIFICATION.KEEP
        : CLASSIFICATION.REVIEW,
      confirmedFixtures,
      reviewRequired,
      subcollections: subcollectionSummary.collections.map((collection) => collection.name),
      subcollectionCounts: subcollectionSummary.collections,
      subcollectionScan: subcollectionSummary.scan,
      sampledForSubcollections: subcollectionSummary.sampledForSubcollections,
    });
  }

  const deployedNames = new Set(collectionIds);
  const missingExpectedCollections = EXPECTED_TOP_LEVEL_COLLECTIONS
    .filter((name) => !deployedNames.has(name))
    .map((name) => ({name, classification: CLASSIFICATION.NOT_DEPLOYED}));

  return {
    status: "CONSULTADO",
    documentCountStatus,
    topLevelDocuments,
    totalDocuments,
    byteVolume: "NO_CONSULTABLE_SIN_METRICA",
    collections,
    missingExpectedCollections,
  };
}

async function auditIdentityConfiguration(accessToken, warnings) {
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PRODUCTION_PROJECT_ID}`;
  const config = await readJson(accessToken, "auth-config", `${base}/config`);
  const enabledProviders = [];
  if (config.signIn?.email?.enabled === true) enabledProviders.push("password");
  if (config.signIn?.phoneNumber?.enabled === true) enabledProviders.push("phone");
  if (config.signIn?.anonymous?.enabled === true) enabledProviders.push("anonymous");

  const providerCollections = [
    ["defaultSupportedIdpConfigs", "defaultSupportedIdpConfigs"],
    ["inboundSamlConfigs", "inboundSamlConfigs"],
    ["oauthIdpConfigs", "oauthIdpConfigs"],
  ];
  for (const [path, key] of providerCollections) {
    try {
      const result = await readJson(accessToken, `auth-${path}`, `${base}/${path}?pageSize=100`);
      for (const provider of result[key] ?? []) {
        if (provider.enabled === false) continue;
        enabledProviders.push(sanitizeTechnicalName(String(provider.name ?? "").split("/").at(-1)));
      }
    } catch (error) {
      warnings.push({section: `auth-${path}`, reason: safeReason(error)});
    }
  }
  return {
    status: "CONSULTADO",
    emailPasswordEnabled: config.signIn?.email?.enabled === true,
    passwordRequired: config.signIn?.email?.passwordRequired !== false,
    enabledProviders: [...new Set(enabledProviders)].sort(),
  };
}

async function auditRules(accessToken) {
  const base = `https://firebaserules.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}`;
  const releases = [];
  let pageToken = "";
  do {
    const url = withQuery(`${base}/releases`, [
      ["pageSize", "100"],
      ["pageToken", pageToken],
    ]);
    const page = await readJson(accessToken, "rules-releases", url);
    releases.push(...(page.releases ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  const results = [];
  for (const service of ["cloud.firestore", "firebase.storage"]) {
    const release = releases.find((candidate) => matchesRulesRelease(candidate.name, service));
    if (!release?.rulesetName) {
      results.push({
        service,
        status: "NO_CONFIGURADO",
        classification: service === "cloud.firestore"
          ? CLASSIFICATION.NOT_DEPLOYED
          : CLASSIFICATION.REVIEW,
      });
      continue;
    }
    const rulesetId = String(release.rulesetName).split("/").at(-1);
    const ruleset = await readJson(accessToken, `rules-${service}`, `${base}/rulesets/${rulesetId}`);
    const files = [...(ruleset.source?.files ?? [])].sort(
      (left, right) => String(left.name).localeCompare(String(right.name)),
    );
    const remoteSource = files.map((file) => String(file.content ?? "")).join("\n");
    const result = {
      service,
      status: "DESPLEGADO",
      rulesetHash: maskIdentifier(release.rulesetName),
      sourceHash: stableHash(remoteSource),
      sourceFileCount: files.length,
    };
    if (service === "cloud.firestore") {
      const localSource = await readFile(resolve(repoRoot, "backend/firestore.rules"), "utf8");
      result.localSourceHash = stableHash(localSource.replaceAll("\r\n", "\n").trimEnd());
      result.remoteNormalizedHash = stableHash(remoteSource.replaceAll("\r\n", "\n").trimEnd());
      result.matchesLocal = result.localSourceHash === result.remoteNormalizedHash;
    }
    results.push(result);
  }
  return {status: "CONSULTADO", services: results};
}

async function auditStorage(accessToken) {
  const bucketUrl = withQuery("https://storage.googleapis.com/storage/v1/b", [
    ["project", PRODUCTION_PROJECT_ID],
    ["fields", "items(name,location,storageClass),nextPageToken"],
  ]);
  const bucketPage = await readJson(accessToken, "storage-buckets", bucketUrl);
  const buckets = [];
  for (const bucket of bucketPage.items ?? []) {
    let pageToken = "";
    let objectCount = 0;
    let sizeBytes = 0n;
    let truncated = false;
    const topLevelPathHashes = new Set();
    do {
      const objectUrl = withQuery(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket.name)}/o`,
        [
          ["maxResults", "1000"],
          ["fields", "items(name,size),nextPageToken"],
          ["userProject", PRODUCTION_PROJECT_ID],
          ["pageToken", pageToken],
        ],
      );
      const page = await readJson(accessToken, "storage-objects", objectUrl);
      for (const object of page.items ?? []) {
        objectCount += 1;
        sizeBytes += BigInt(object.size ?? "0");
        const topLevel = String(object.name ?? "").split("/")[0];
        if (topLevel) topLevelPathHashes.add(maskIdentifier(topLevel));
        if (objectCount >= MAX_STORAGE_OBJECTS) {
          truncated = true;
          break;
        }
      }
      pageToken = truncated ? "" : (page.nextPageToken ?? "");
    } while (pageToken);
    buckets.push({
      name: sanitizeTechnicalName(bucket.name),
      location: sanitizeTechnicalName(bucket.location),
      storageClass: sanitizeTechnicalName(bucket.storageClass),
      objectCount,
      sizeBytes: sizeBytes.toString(),
      truncated,
      topLevelPathHashes: [...topLevelPathHashes].sort(),
    });
  }
  return {status: "CONSULTADO", buckets};
}

async function auditProjectAndServices(accessToken) {
  const project = await readJson(
    accessToken,
    "project",
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}`,
  );
  const projectNumber = String(project.projectNumber ?? "");
  const enabledServices = [];
  let pageToken = "";
  do {
    const url = withQuery(`https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services`, [
      ["filter", "state:ENABLED"],
      ["pageSize", "200"],
      ["pageToken", pageToken],
    ]);
    const page = await readJson(accessToken, "enabled-services", url);
    enabledServices.push(...(page.services ?? []).map((service) => String(service.config?.name ?? "")));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  const relevantNames = new Set([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudfunctions.googleapis.com",
    "eventarc.googleapis.com",
    "firebase.googleapis.com",
    "firebaserules.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
  ]);
  return {
    projectNumber,
    summary: {
      status: "CONSULTADO",
      projectId: PRODUCTION_PROJECT_ID,
      projectNumberMasked: maskIdentifier(projectNumber),
      displayName: sanitizeTechnicalName(project.name ?? project.projectId ?? PRODUCTION_PROJECT_ID),
      lifecycleState: sanitizeTechnicalName(project.lifecycleState),
    },
    enabledServiceNames: enabledServices,
    relevantServices: [...relevantNames].sort().map((name) => ({
      name,
      enabled: enabledServices.includes(name),
    })),
  };
}

async function auditSecrets(accessToken) {
  const names = [];
  let pageToken = "";
  do {
    const url = withQuery(
      `https://secretmanager.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/secrets`,
      [["pageSize", "100"], ["pageToken", pageToken]],
    );
    const page = await readJson(accessToken, "secrets", url);
    names.push(...(page.secrets ?? []).map(
      (secret) => sanitizeTechnicalName(String(secret.name ?? "").split("/").at(-1)),
    ));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return {status: "CONSULTADO", names: names.sort(), valuesRead: false};
}

async function auditIam(accessToken) {
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}:getIamPolicy`;
  const policy = await readJson(accessToken, "iam", url, {
    method: "POST",
    body: {options: {requestedPolicyVersion: 3}},
  });
  const administrativeRoles = new Set([
    "roles/owner",
    "roles/editor",
    "roles/firebase.admin",
    "roles/firebaseauth.admin",
    "roles/iam.securityAdmin",
    "roles/resourcemanager.projectIamAdmin",
  ]);
  const principals = new Set();
  const roles = [];
  for (const binding of policy.bindings ?? []) {
    if (!administrativeRoles.has(binding.role)) continue;
    roles.push(sanitizeTechnicalName(String(binding.role).replace("roles/", "")));
    for (const member of binding.members ?? []) principals.add(maskIdentifier(member));
  }
  return {
    status: "CONSULTADO",
    administrativePrincipalCount: principals.size,
    administrativePrincipalHashes: [...principals].sort(),
    administrativeRoles: [...new Set(roles)].sort(),
  };
}

async function auditBillingAndBudgets(accessToken, warnings) {
  const billingInfo = await readJson(
    accessToken,
    "billing",
    `https://cloudbilling.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/billingInfo`,
  );
  const billingAccountName = String(billingInfo.billingAccountName ?? "");
  const result = {
    status: "CONSULTADO",
    billingEnabled: billingInfo.billingEnabled === true,
    billingAccountConfigured: billingAccountName.length > 0,
    budgetCount: "NO_CONSULTABLE",
  };
  if (!billingAccountName) return result;
  try {
    const accountId = billingAccountName.split("/").at(-1);
    const url = withQuery(
      `https://billingbudgets.googleapis.com/v1/billingAccounts/${accountId}/budgets`,
      [["pageSize", "100"]],
    );
    const budgets = await readJson(accessToken, "budgets", url);
    result.budgetCount = (budgets.budgets ?? []).length;
  } catch (error) {
    warnings.push({section: "budgets", reason: safeReason(error)});
  }
  return result;
}

async function auditQuotas(accessToken, projectNumber, enabledServiceNames) {
  const targetServices = [
    "cloudfunctions.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "storage.googleapis.com",
  ].filter((service) => enabledServiceNames.includes(service));
  let metricCount = 0;
  let zeroEffectiveLimitCount = 0;
  let overrideCount = 0;
  for (const service of targetServices) {
    let pageToken = "";
    do {
      const url = withQuery(
        `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${service}/consumerQuotaMetrics`,
        [
          ["view", "FULL"],
          ["pageSize", "200"],
          ["pageToken", pageToken],
        ],
      );
      const page = await readJson(accessToken, "quotas", url);
      const metrics = page.metrics ?? [];
      metricCount += metrics.length;
      for (const metric of metrics) {
        for (const limit of metric.consumerQuotaLimits ?? []) {
          for (const bucket of limit.quotaBuckets ?? []) {
            if (String(bucket.effectiveLimit ?? "") === "0") zeroEffectiveLimitCount += 1;
            if (bucket.adminOverride || bucket.consumerOverride) overrideCount += 1;
          }
        }
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  return {
    status: "CONSULTADO",
    servicesQueried: targetServices,
    metricCount,
    zeroEffectiveLimitCount,
    overrideCount,
    interpretation: zeroEffectiveLimitCount > 0 ? CLASSIFICATION.REVIEW : CLASSIFICATION.KEEP,
  };
}

async function main() {
  if (process.env.CI) throw new Error("FIREBASE_REAL_PROHIBIDO_EN_CI");
  const args = parseAuditArguments(process.argv.slice(2));
  const outputPath = assertPrivateOutputPath(repoRoot, resolve(repoRoot, args.output));
  const warnings = [];
  const accessToken = await authenticateFirebaseCli();
  const app = initializeApp({
    credential: adminCredential(accessToken),
    projectId: PRODUCTION_PROJECT_ID,
  }, "etapa-21-read-only-audit");

  const projectAndServices = await safeSection(
    "project-services",
    warnings,
    () => auditProjectAndServices(accessToken),
  );
  const projectNumber = projectAndServices.projectNumber ?? "";
  const enabledServiceNames = projectAndServices.enabledServiceNames ?? [];
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    safety: {
      mode: "READ_ONLY",
      projectGuard: PRODUCTION_PROJECT_ID,
      authenticatedSession: "DISPONIBLE",
      ciRealFirebaseAllowed: false,
      remoteMutationCount: 0,
      privateOutput: true,
    },
    project: projectAndServices.summary ?? projectAndServices,
    services: projectAndServices.relevantServices ?? projectAndServices,
    authentication: {
      users: await safeSection("auth-users", warnings, () => auditUsers(app)),
      configuration: await safeSection(
        "auth-configuration",
        warnings,
        () => auditIdentityConfiguration(accessToken, warnings),
      ),
    },
    firestore: await safeSection("firestore", warnings, () => auditFirestore(accessToken)),
    rules: await safeSection("rules", warnings, () => auditRules(accessToken)),
    storage: await safeSection("storage", warnings, () => auditStorage(accessToken)),
    secrets: await safeSection("secrets", warnings, () => auditSecrets(accessToken)),
    iam: await safeSection("iam", warnings, () => auditIam(accessToken)),
    billing: await safeSection(
      "billing",
      warnings,
      () => auditBillingAndBudgets(accessToken, warnings),
    ),
    quotas: projectNumber
      ? await safeSection(
        "quotas",
        warnings,
        () => auditQuotas(accessToken, projectNumber, enabledServiceNames),
      )
      : {status: "NO_CONSULTABLE", reason: "PROJECT_NUMBER_NO_DISPONIBLE"},
    operationalVisibility: {
      loggingApiEnabled: enabledServiceNames.includes("logging.googleapis.com"),
      monitoringApiEnabled: enabledServiceNames.includes("monitoring.googleapis.com"),
    },
    warnings,
  };

  assertSafeReport(report);
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {encoding: "utf8", flag: "w"});
  console.log("AUDIT_STATUS=complete");
  console.log(`AUDIT_OUTPUT=${relative(repoRoot, outputPath).replaceAll("\\", "/")}`);
  console.log(`AUDIT_WARNINGS=${warnings.length}`);
  console.log("REMOTE_MUTATIONS=0");
}

main().catch((error) => {
  console.error(`AUDIT_STATUS=failed reason=${safeReason(error)}`);
  process.exitCode = 1;
});
