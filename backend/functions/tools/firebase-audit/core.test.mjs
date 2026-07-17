import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

import {
  CLASSIFICATION,
  PRODUCTION_PROJECT_ID,
  assertAllowedRemoteRead,
  assertPrivateOutputPath,
  assertProjectId,
  assertSafeReport,
  classifyAccount,
  classifyDocumentMarker,
  inspectFirestoreSubcollections,
  maskIdentifier,
  matchesRulesRelease,
  parseAuditArguments,
} from "./core.mjs";

const toolDirectory = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(toolDirectory, "../../../..");

test("rechaza cualquier Project ID distinto del literal autorizado", () => {
  assert.equal(assertProjectId(PRODUCTION_PROJECT_ID), PRODUCTION_PROJECT_ID);
  assert.throws(() => assertProjectId("otro-proyecto"), /PROJECT_ID_NO_AUTORIZADO/u);
  assert.throws(
    () => parseAuditArguments(["--project", "demo-vivero", "--output", "x.json"]),
    /PROJECT_ID_NO_AUTORIZADO/u,
  );
});

test("solo permite una salida JSON dentro de la ruta privada ignorada", () => {
  const expected = resolve(repoRoot, ".private/etapa-21/audit.json");
  assert.equal(assertPrivateOutputPath(repoRoot, expected), expected);
  assert.throws(
    () => assertPrivateOutputPath(repoRoot, resolve(repoRoot, "docs/audit.json")),
    /SALIDA_PRIVADA_REQUERIDA/u,
  );
});

test("enmascara identificadores sin conservar el valor original", () => {
  const maskedEmail = maskIdentifier("persona@example.invalid");
  const maskedUid = maskIdentifier("uid-completo-no-publicable");
  assert.match(maskedEmail, /^sha256:[0-9a-f]{12}$/u);
  assert.match(maskedUid, /^sha256:[0-9a-f]{12}$/u);
  assert.doesNotMatch(maskedEmail, /persona/u);
  assert.doesNotMatch(maskedUid, /uid-completo/u);
});

test("clasifica solo marcadores inequívocos y protege lo desconocido", () => {
  assert.equal(classifyAccount("fixture@prueba.local"), CLASSIFICATION.CONFIRMED_FIXTURE);
  assert.equal(classifyAccount("ambigua@example.invalid"), CLASSIFICATION.REVIEW);
  assert.equal(classifyAccount(undefined), CLASSIFICATION.REVIEW);
  assert.equal(
    classifyDocumentMarker({id: "JORNADA-PRUEBA-01"}),
    CLASSIFICATION.CONFIRMED_FIXTURE,
  );
  assert.equal(
    classifyDocumentMarker({id: "LINEA-PRUEBA-01"}),
    CLASSIFICATION.CONFIRMED_FIXTURE,
  );
  assert.equal(
    classifyDocumentMarker({id: "registro-antiguo"}),
    CLASSIFICATION.REVIEW,
  );
});

test("el transporte rechaza hosts, proyectos y verbos no incluidos en la lista blanca", () => {
  assert.equal(
    assertAllowedRemoteRead(
      `https://firestore.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/jornadas/J-1/autorizaciones?mask.fieldPaths=campo_inexistente`,
    ),
    true,
  );
  assert.equal(
    assertAllowedRemoteRead(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}`,
    ),
    true,
  );
  assert.equal(
    assertAllowedRemoteRead(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}:getIamPolicy`,
      "POST",
    ),
    true,
  );
  assert.throws(
    () => assertAllowedRemoteRead("https://example.invalid/v1/projects/viverocontrol-3f83f"),
    /LECTURA_REMOTA_NO_PERMITIDA/u,
  );
  assert.throws(
    () => assertAllowedRemoteRead(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}`,
      "PATCH",
    ),
    /LECTURA_REMOTA_NO_PERMITIDA/u,
  );
});

test("cuenta y clasifica documentos dentro de subcolecciones Firestore", async () => {
  const root = `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents`;
  const parentNames = [`${root}/jornadas/J-1`, `${root}/jornadas/J-2`];
  const requestedCollectionPaths = [];
  const result = await inspectFirestoreSubcollections({
    documentNames: parentNames,
    sampleLimit: 50,
    listCollectionIds: async (documentName) => (
      documentName.endsWith("/J-1") ? ["autorizaciones"] : []
    ),
    listDocumentNames: async (collectionPath) => {
      requestedCollectionPaths.push(collectionPath);
      return [
        `${root}/${collectionPath}/usuario-sintetico-1`,
        `${root}/${collectionPath}/usuario-sintetico-2`,
      ];
    },
  });

  assert.deepEqual(requestedCollectionPaths, ["jornadas/J-1/autorizaciones"]);
  assert.equal(result.total, 2);
  assert.equal(result.reviewRequired, 2);
  assert.equal(result.confirmedFixtures, 0);
  assert.equal(result.scan, "COMPLETA");
  assert.deepEqual(result.collections, [{
    name: "autorizaciones",
    total: 2,
    confirmedFixtures: 0,
    reviewRequired: 2,
  }]);
});

test("reconoce releases de Storage con alcance de bucket", () => {
  assert.equal(
    matchesRulesRelease(
      "projects/proyecto-sintetico/releases/firebase.storage/bucket-sintetico",
      "firebase.storage",
    ),
    true,
  );
  assert.equal(
    matchesRulesRelease("projects/proyecto-sintetico/releases/cloud.firestore", "cloud.firestore"),
    true,
  );
  assert.equal(
    matchesRulesRelease("projects/proyecto-sintetico/releases/firebase.storagex", "firebase.storage"),
    false,
  );
});

test("la salida rechaza secretos, correos, UID y contenido documental", () => {
  assert.equal(assertSafeReport({counts: {total: 3}, identifiers: ["sha256:0123456789ab"]}), true);
  assert.throws(() => assertSafeReport({email: "masked"}), /CAMPO_PRIVADO_PROHIBIDO/u);
  assert.throws(() => assertSafeReport({uid: "masked"}), /CAMPO_PRIVADO_PROHIBIDO/u);
  assert.throws(() => assertSafeReport({token: "masked"}), /CAMPO_PRIVADO_PROHIBIDO/u);
  assert.throws(() => assertSafeReport({documents: []}), /CAMPO_PRIVADO_PROHIBIDO/u);
  assert.throws(() => assertSafeReport({value: "persona@example.invalid"}), /CORREO_PROHIBIDO/u);
});

test("el código de auditoría no invoca operaciones de escritura o borrado", async () => {
  const files = ["core.mjs", "audit.mjs"];
  const source = (await Promise.all(
    files.map((file) => readFile(resolve(toolDirectory, file), "utf8")),
  )).join("\n");
  assert.doesNotMatch(source, /\.\s*(?:set|update|create|delete|recursiveDelete)\s*\(/u);
  assert.doesNotMatch(source, /firebase\s+deploy|firestore\s+delete|auth:import/iu);
  assert.match(source, /process\.env\.CI/u);
  assert.match(source, /FIREBASE_REAL_PROHIBIDO_EN_CI/u);
});
