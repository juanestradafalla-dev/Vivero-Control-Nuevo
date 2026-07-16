import {readdir, readFile} from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../", import.meta.url);

export const expectedSchemas = [
  "usuario.schema.json",
  "ubicacion.schema.json",
  "linea.schema.json",
  "jornada.schema.json",
  "linea-jornada.schema.json",
  "reserva.schema.json",
  "conteo.schema.json",
  "decision-revision.schema.json",
  "inventario-oficial-linea.schema.json",
  "movimiento-historico.schema.json",
  "evento-auditoria.schema.json",
  "reserve-line-request.schema.json",
  "reserve-line-result.schema.json",
  "error-controlado.schema.json",
  "jornada-autorizacion.schema.json",
  "resultado-idempotente.schema.json",
  "send-count-request.schema.json",
  "send-count-result.schema.json",
  "approve-count-request.schema.json",
  "approve-count-result.schema.json",
  "return-count-request.schema.json",
  "return-count-result.schema.json",
  "initiate-count-correction-request.schema.json",
  "initiate-count-correction-result.schema.json",
  "reassign-count-correction-request.schema.json",
  "reassign-count-correction-result.schema.json",
  "correction-reassignment.schema.json",
  "release-reservation-request.schema.json",
  "release-reservation-result.schema.json",
  "reservation-release.schema.json",
  "list-active-journeys-request.schema.json",
  "list-active-journeys-result.schema.json",
  "create-draft-journey-request.schema.json",
  "draft-journey-summary.schema.json",
  "create-draft-journey-result.schema.json",
  "update-draft-journey-lines-request.schema.json",
  "update-draft-journey-lines-result.schema.json",
  "list-manageable-journeys-request.schema.json",
  "list-manageable-journeys-result.schema.json",
  "draft-journey-line-selection.schema.json",
  "draft-catalog-line.schema.json",
  "draft-participant-input.schema.json",
  "draft-participant.schema.json",
  "draft-participant-catalog-entry.schema.json",
  "draft-journey-participant-selection.schema.json",
  "list-draft-journey-participants-request.schema.json",
  "list-draft-journey-participants-result.schema.json",
  "update-draft-journey-participants-request.schema.json",
  "update-draft-journey-participants-result.schema.json",
  "activate-journey-request.schema.json",
  "activate-journey-result.schema.json",
  "active-line-occupation.schema.json",
  "close-journey-request.schema.json",
  "close-journey-result.schema.json",
  "cancel-draft-journey-request.schema.json",
  "cancel-draft-journey-result.schema.json",
  "reopen-cancelled-journey-request.schema.json",
  "reopen-cancelled-journey-result.schema.json",
  "cancelled-draft-journey-summary.schema.json",
  "draft-journey-cancellation.schema.json",
  "list-manageable-users-request.schema.json",
  "list-manageable-users-result.schema.json",
  "manageable-user-summary.schema.json",
  "user-active-work-summary.schema.json",
  "update-user-status-request.schema.json",
  "update-user-status-result.schema.json",
  "update-user-role-request.schema.json",
  "update-user-role-result.schema.json",
  "catalog-location-summary.schema.json",
  "catalog-line-summary.schema.json",
  "catalog-line-inventory-summary.schema.json",
  "list-manageable-catalog-request.schema.json",
  "list-manageable-catalog-result.schema.json",
  "create-catalog-location-request.schema.json",
  "update-catalog-location-request.schema.json",
  "catalog-location-result.schema.json",
  "create-catalog-line-request.schema.json",
  "update-catalog-line-request.schema.json",
  "catalog-line-result.schema.json",
  "catalog-uniqueness-lock.schema.json",
  "register-initial-inventory-request.schema.json",
  "register-initial-inventory-result.schema.json",
  "initial-inventory-load.schema.json",
  "migration-catalog-package-v1.schema.json",
  "migration-validation-issue.schema.json",
  "migration-validation-result.schema.json"
];

export const expectedEnums = new Map([
  ["estados-jornada.json", ["BORRADOR", "ACTIVA", "INACTIVA"]],
  ["estados-linea.json", ["DISPONIBLE", "EN_CONTEO", "PENDIENTE_REVISION", "DEVUELTA", "APROBADA"]],
  ["estados-sincronizacion.json", ["PENDIENTE", "SINCRONIZANDO", "ENVIADA", "ERROR"]],
  ["estados-reserva.json", ["ACTIVA", "CONSUMIDA", "LIBERADA"]],
  ["roles.json", ["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]]
]);

async function loadDirectory(directory) {
  const filenames = (await readdir(new URL(`${directory}/`, root)))
    .filter((name) => name.endsWith(".json"))
    .sort();

  return Promise.all(
    filenames.map(async (filename) => {
      const content = await readFile(new URL(`${directory}/${filename}`, root), "utf8");
      const schema = JSON.parse(content);
      if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
        throw new Error(`${directory}/${filename} no declara JSON Schema Draft 2020-12`);
      }
      if (typeof schema.$id !== "string" || schema.$id.length === 0) {
        throw new Error(`${directory}/${filename} no contiene un $id válido`);
      }
      return {directory, filename, key: `${directory}/${filename}`, schema};
    })
  );
}

function requireFiles(documents, directory, expectedFilenames) {
  const available = new Set(
    documents.filter((document) => document.directory === directory).map((document) => document.filename)
  );
  for (const filename of expectedFilenames) {
    if (!available.has(filename)) {
      throw new Error(`Falta el contrato obligatorio ${directory}/${filename}`);
    }
  }
}

export async function createSchemaRegistry() {
  const documents = [...(await loadDirectory("schemas")), ...(await loadDirectory("enums"))];
  requireFiles(documents, "schemas", expectedSchemas);
  requireFiles(documents, "enums", [...expectedEnums.keys()]);

  for (const [filename, values] of expectedEnums) {
    const document = documents.find((candidate) => candidate.key === `enums/${filename}`);
    if (JSON.stringify(document?.schema.enum) !== JSON.stringify(values)) {
      throw new Error(`Los valores de enums/${filename} no coinciden con los contratos aprobados`);
    }
  }

  const ajv = new Ajv2020({allErrors: true, strict: true, validateFormats: true});
  addFormats(ajv);
  for (const document of documents) {
    ajv.addSchema(document.schema);
  }

  const validators = new Map();
  for (const document of documents) {
    const validator = ajv.getSchema(document.schema.$id);
    if (!validator) {
      throw new Error(`Ajv no compiló ${document.key}`);
    }
    validators.set(document.key, validator);
  }

  return {
    validators,
    schemaCount: documents.filter((document) => document.directory === "schemas").length,
    entityCount: expectedSchemas.length,
    enumCount: documents.filter((document) => document.directory === "enums").length
  };
}
