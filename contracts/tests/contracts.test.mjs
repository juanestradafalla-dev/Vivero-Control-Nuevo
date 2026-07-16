import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {validateContract} from "../src/contract-validator.mjs";
import {createSchemaRegistry} from "../src/schema-registry.mjs";

const root = new URL("../", import.meta.url);
const registry = await createSchemaRegistry();

async function example(filename) {
  return JSON.parse(await readFile(new URL(`examples/${filename}`, root), "utf8"));
}

async function assertValid(schemaFilename, exampleFilename) {
  const result = validateContract(registry, schemaFilename, await example(exampleFilename));
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
}

async function assertInvalid(schemaFilename, exampleFilename) {
  const result = validateContract(registry, schemaFilename, await example(exampleFilename));
  assert.equal(result.valid, false, `Se esperaba rechazo para ${exampleFilename}`);
  return result;
}

test("compila todos los esquemas Draft 2020-12 y resuelve sus referencias", () => {
  assert.equal(registry.entityCount, 86);
  assert.equal(registry.schemaCount, 87);
  assert.equal(registry.enumCount, 5);
});

test("acepta un conteo válido con total calculado", async () => {
  await assertValid("conteo.schema.json", "conteo-valido.json");
});

test("rechaza un conteo con total incorrecto", async () => {
  const result = await assertInvalid("conteo.schema.json", "conteo-total-incorrecto.json");
  assert.match(result.invariantErrors.join(" "), /conteo\.total/);
});

test("rechaza un conteo negativo", async () => {
  const result = await assertInvalid("conteo.schema.json", "conteo-negativo.json");
  assert.ok(result.schemaErrors.length > 0);
});

test("acepta una fotografía válida de inventario", async () => {
  await assertValid("inventario-oficial-linea.schema.json", "inventario-valido.json");
});

test("acepta el movimiento histórico obligatorio por categorías", async () => {
  await assertValid("movimiento-historico.schema.json", "movimiento-valido.json");
});

test("rechaza un movimiento con diferencia incorrecta", async () => {
  const result = await assertInvalid(
    "movimiento-historico.schema.json",
    "movimiento-diferencia-incorrecta.json"
  );
  assert.match(result.invariantErrors.join(" "), /diferencias\.hembras/);
});

test("rechaza una devolución sin motivo", async () => {
  const result = await assertInvalid("decision-revision.schema.json", "devolucion-sin-motivo.json");
  assert.ok(result.schemaErrors.length > 0);
});

test("rechaza una autorrevisión administrativa sin motivo", async () => {
  const result = await assertInvalid(
    "decision-revision.schema.json",
    "autorrevision-sin-motivo.json"
  );
  assert.ok(result.schemaErrors.length > 0);
});

test("rechaza una reserva liberada sin motivo", async () => {
  const result = await assertInvalid("reserva.schema.json", "reserva-liberada-sin-motivo.json");
  assert.ok(result.schemaErrors.length > 0);
});

test("acepta el payload de reservarLinea utilizado por Vivero Campo", async () => {
  await assertValid("reserve-line-request.schema.json", "etapa-03/campo-reserve-line-request.json");
});

test("rechaza identidad agregada por el cliente a reservarLinea", async () => {
  const result = await assertInvalid(
    "reserve-line-request.schema.json",
    "etapa-03/reserve-line-request-con-actor.json"
  );
  assert.ok(result.schemaErrors.length > 0);
});

test("acepta el resultado compartido por backend, Campo y Maestro", async () => {
  await assertValid("reserve-line-result.schema.json", "etapa-03/reserve-line-result.json");
});

test("acepta errores controlados sin detalles internos", async () => {
  await assertValid("error-controlado.schema.json", "etapa-03/error-linea-no-disponible.json");
});

test("acepta una autorización central de jornada", async () => {
  await assertValid("jornada-autorizacion.schema.json", "etapa-03/autorizacion-jornada.json");
});

test("acepta el resultado idempotente persistido", async () => {
  await assertValid("resultado-idempotente.schema.json", "etapa-03/resultado-idempotente.json");
});

test("acepta el payload congelado de enviarConteo usado por Campo", async () => {
  await assertValid("send-count-request.schema.json", "etapa-04/campo-send-count-request.json");
});

test("acepta técnicamente un conteo total cero", async () => {
  await assertValid("send-count-request.schema.json", "etapa-04/send-count-request-cero.json");
});

test("rechaza el total calculado agregado por el cliente", async () => {
  const result = await assertInvalid(
    "send-count-request.schema.json",
    "etapa-04/send-count-request-con-total.json"
  );
  assert.ok(result.schemaErrors.length > 0);
});

test("acepta el resultado de enviarConteo sin token de reserva", async () => {
  const payload = await example("etapa-04/send-count-result.json");
  const result = validateContract(registry, "send-count-result.schema.json", payload);
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
  assert.equal(Object.hasOwn(payload, "tokenReserva"), false);
});

test("acepta el resultado idempotente de ENVIAR_CONTEO", async () => {
  await assertValid(
    "resultado-idempotente.schema.json",
    "etapa-04/resultado-idempotente-conteo.json"
  );
});

test("acepta reserva CONSUMIDA con hora central", async () => {
  await assertValid("reserva.schema.json", "etapa-04/reserva-consumida.json");
});

test("acepta solicitudes mínimas de aprobación y devolución", async () => {
  await assertValid("approve-count-request.schema.json", "etapa-05/approve-count-request.json");
  await assertValid("approve-count-request.schema.json", "etapa-05/approve-own-count-request.json");
  await assertValid("return-count-request.schema.json", "etapa-05/return-count-request.json");
});

test("rechaza una solicitud de devolución sin motivo", async () => {
  await assertInvalid("return-count-request.schema.json", "etapa-05/return-count-request-without-reason.json");
});

test("acepta el resultado de aprobación con diferencias coherentes", async () => {
  await assertValid("approve-count-result.schema.json", "etapa-05/approve-count-result.json");
});

test("acepta el resultado de devolución sin datos de inventario", async () => {
  await assertValid("return-count-result.schema.json", "etapa-05/return-count-result.json");
});

test("acepta decisiones separadas de aprobación y devolución", async () => {
  await assertValid("decision-revision.schema.json", "etapa-05/decision-approval.json");
  await assertValid("decision-revision.schema.json", "etapa-05/decision-return.json");
});

test("acepta resultados idempotentes de aprobación y devolución", async () => {
  await assertValid("resultado-idempotente.schema.json", "etapa-05/idempotent-approval-result.json");
  await assertValid("resultado-idempotente.schema.json", "etapa-05/idempotent-return-result.json");
});

test("acepta iniciar una corrección y su resultado idempotente", async () => {
  await assertValid(
    "initiate-count-correction-request.schema.json",
    "etapa-06/initiate-count-correction-request.json"
  );
  await assertValid(
    "initiate-count-correction-result.schema.json",
    "etapa-06/initiate-count-correction-result.json"
  );
  await assertValid(
    "resultado-idempotente.schema.json",
    "etapa-06/resultado-idempotente-correccion.json"
  );
});

test("acepta una versión 2 que apunta al conteo anterior", async () => {
  await assertValid("conteo.schema.json", "etapa-06/conteo-version-2.json");
  await assertValid("reserva.schema.json", "etapa-06/reserva-correccion.json");
});

test("acepta la reasignacion supervisada y su resultado idempotente", async () => {
  await assertValid(
    "reassign-count-correction-request.schema.json",
    "etapa-07/reassign-count-correction-request.json"
  );
  await assertValid(
    "reassign-count-correction-result.schema.json",
    "etapa-07/reassign-count-correction-result.json"
  );
  await assertValid("correction-reassignment.schema.json", "etapa-07/correction-reassignment.json");
  await assertValid(
    "resultado-idempotente.schema.json",
    "etapa-07/idempotent-reassignment-result.json"
  );
});

test("rechaza una reasignacion sin motivo", async () => {
  await assertInvalid(
    "reassign-count-correction-request.schema.json",
    "etapa-07/reassign-count-correction-request-empty-reason.json"
  );
});

test("acepta la liberacion manual y su resultado idempotente", async () => {
  await assertValid("release-reservation-request.schema.json", "etapa-08/release-reservation-request.json");
  await assertValid("release-reservation-result.schema.json", "etapa-08/release-reservation-result.json");
  await assertValid("reservation-release.schema.json", "etapa-08/reservation-release.json");
  await assertValid("reserva.schema.json", "etapa-08/reservation-released.json");
  await assertValid("resultado-idempotente.schema.json", "etapa-08/idempotent-release-result.json");
});

test("rechaza una liberacion sin motivo", async () => {
  await assertInvalid(
    "release-reservation-request.schema.json",
    "etapa-08/release-reservation-request-empty-reason.json"
  );
});

test("acepta listar jornadas sin identidad del cliente y su resultado", async () => {
  await assertValid("list-active-journeys-request.schema.json", "etapa-09/list-active-journeys-request.json");
  await assertValid("list-active-journeys-result.schema.json", "etapa-09/list-active-journeys-result.json");
});

test("rechaza solicitar jornadas para otro usuario", async () => {
  await assertInvalid(
    "list-active-journeys-request.schema.json",
    "etapa-09/list-active-journeys-request-with-user.json"
  );
});

test("acepta crear y listar jornadas en borrador sin identidad del cliente", async () => {
  await assertValid("create-draft-journey-request.schema.json", "etapa-10/create-draft-journey-request.json");
  await assertValid("create-draft-journey-result.schema.json", "etapa-10/create-draft-journey-result.json");
  await assertValid("list-manageable-journeys-request.schema.json", "etapa-10/list-manageable-journeys-request.json");
  await assertValid("list-manageable-journeys-result.schema.json", "etapa-10/list-manageable-journeys-result.json");
});

test("rechaza nombre vacio y lineas duplicadas en solicitudes de borrador", async () => {
  await assertInvalid(
    "create-draft-journey-request.schema.json",
    "etapa-10/create-draft-journey-request-empty-name.json"
  );
  await assertInvalid(
    "update-draft-journey-lines-request.schema.json",
    "etapa-10/update-draft-journey-lines-request-duplicates.json"
  );
});

test("acepta seleccion preparatoria de lineas separada del estado operativo", async () => {
  await assertValid(
    "update-draft-journey-lines-request.schema.json",
    "etapa-10/update-draft-journey-lines-request.json"
  );
  await assertValid(
    "update-draft-journey-lines-result.schema.json",
    "etapa-10/update-draft-journey-lines-result.json"
  );
  await assertValid(
    "draft-journey-line-selection.schema.json",
    "etapa-10/draft-journey-line-selection.json"
  );
  await assertValid("jornada.schema.json", "etapa-10/draft-journey.json");
});

test("acepta listar y actualizar participantes de un borrador", async () => {
  await assertValid(
    "list-draft-journey-participants-request.schema.json",
    "etapa-11/list-draft-journey-participants-request.json"
  );
  await assertValid(
    "list-draft-journey-participants-result.schema.json",
    "etapa-11/list-draft-journey-participants-result.json"
  );
  await assertValid(
    "update-draft-journey-participants-request.schema.json",
    "etapa-11/update-draft-journey-participants-request.json"
  );
  await assertValid(
    "update-draft-journey-participants-result.schema.json",
    "etapa-11/update-draft-journey-participants-result.json"
  );
});

test("rechaza participantes duplicados y datos centrales agregados por el cliente", async () => {
  await assertInvalid(
    "update-draft-journey-participants-request.schema.json",
    "etapa-11/update-draft-journey-participants-request-duplicates.json"
  );
  await assertInvalid(
    "update-draft-journey-participants-request.schema.json",
    "etapa-11/update-draft-journey-participants-request-extra-field.json"
  );
});

test("acepta seleccion preparatoria e idempotencia de participantes", async () => {
  await assertValid(
    "draft-journey-participant-selection.schema.json",
    "etapa-11/draft-journey-participant-selection.json"
  );
  await assertValid(
    "resultado-idempotente.schema.json",
    "etapa-11/idempotent-draft-participants-result.json"
  );
});

test("acepta activar una jornada con versiones observadas y resultado central", async () => {
  await assertValid("activate-journey-request.schema.json", "etapa-12/activate-journey-request.json");
  await assertValid("activate-journey-result.schema.json", "etapa-12/activate-journey-result.json");
  await assertValid("active-line-occupation.schema.json", "etapa-12/active-line-occupation.json");
  await assertValid(
    "resultado-idempotente.schema.json",
    "etapa-12/idempotent-activate-journey-result.json"
  );
});

test("rechaza identidad o campos adicionales al activar", async () => {
  await assertInvalid(
    "activate-journey-request.schema.json",
    "etapa-12/activate-journey-request-extra-field.json"
  );
});

test("acepta cerrar una jornada con version observada y resultado central", async () => {
  await assertValid("close-journey-request.schema.json", "etapa-13/close-journey-request.json");
  await assertValid("close-journey-result.schema.json", "etapa-13/close-journey-result.json");
  await assertValid("resultado-idempotente.schema.json", "etapa-13/idempotent-close-journey-result.json");
});

test("rechaza identidad o campos adicionales al cerrar", async () => {
  await assertInvalid("close-journey-request.schema.json", "etapa-13/close-journey-request-extra-field.json");
});

test("acepta cancelar y reabrir un borrador con trazabilidad", async () => {
  await assertValid("cancel-draft-journey-request.schema.json", "etapa-14/cancel-draft-journey-request.json");
  await assertValid("cancel-draft-journey-result.schema.json", "etapa-14/cancel-draft-journey-result.json");
  await assertValid("reopen-cancelled-journey-request.schema.json", "etapa-14/reopen-cancelled-journey-request.json");
  await assertValid("reopen-cancelled-journey-result.schema.json", "etapa-14/reopen-cancelled-journey-result.json");
  await assertValid("cancelled-draft-journey-summary.schema.json", "etapa-14/cancelled-draft-journey-summary.json");
  await assertValid("draft-journey-cancellation.schema.json", "etapa-14/draft-journey-cancellation.json");
  await assertValid("resultado-idempotente.schema.json", "etapa-14/idempotent-cancel-draft-result.json");
  await assertValid("resultado-idempotente.schema.json", "etapa-14/idempotent-reopen-draft-result.json");
});

test("rechaza identidad o campos adicionales al cancelar un borrador", async () => {
  await assertInvalid(
    "cancel-draft-journey-request.schema.json",
    "etapa-14/cancel-draft-journey-request-extra-field.json"
  );
});

test("acepta listado y actualizaciones administrativas de perfiles", async () => {
  await assertValid(
    "list-manageable-users-request.schema.json",
    "etapa-15/list-manageable-users-request.json"
  );
  await assertValid(
    "list-manageable-users-result.schema.json",
    "etapa-15/list-manageable-users-result.json"
  );
  await assertValid("update-user-status-request.schema.json", "etapa-15/update-user-status-request.json");
  await assertValid("update-user-status-result.schema.json", "etapa-15/update-user-status-result.json");
  await assertValid("update-user-role-request.schema.json", "etapa-15/update-user-role-request.json");
  await assertValid("update-user-role-result.schema.json", "etapa-15/update-user-role-result.json");
  await assertValid(
    "resultado-idempotente.schema.json",
    "etapa-15/idempotent-update-user-status-result.json"
  );
});

test("rechaza campos adicionales y roles administrativos inexistentes", async () => {
  await assertInvalid(
    "update-user-status-request.schema.json",
    "etapa-15/update-user-status-request-extra-field.json"
  );
  await assertInvalid(
    "update-user-role-request.schema.json",
    "etapa-15/update-user-role-request-invalid-role.json"
  );
});

test("acepta listar, crear y actualizar el catálogo central", async () => {
  await assertValid("list-manageable-catalog-request.schema.json", "etapa-16/list-manageable-catalog-request.json");
  await assertValid("list-manageable-catalog-result.schema.json", "etapa-16/list-manageable-catalog-result.json");
  await assertValid("create-catalog-location-request.schema.json", "etapa-16/create-catalog-location-request.json");
  await assertValid("update-catalog-location-request.schema.json", "etapa-16/update-catalog-location-request.json");
  await assertValid("catalog-location-result.schema.json", "etapa-16/catalog-location-result.json");
  await assertValid("create-catalog-line-request.schema.json", "etapa-16/create-catalog-line-request.json");
  await assertValid("update-catalog-line-request.schema.json", "etapa-16/update-catalog-line-request.json");
  await assertValid("catalog-line-result.schema.json", "etapa-16/catalog-line-result.json");
  await assertValid("resultado-idempotente.schema.json", "etapa-16/idempotent-create-line-result.json");
  await assertValid("catalog-uniqueness-lock.schema.json", "etapa-16/catalog-uniqueness-lock.json");
});

test("rechaza cambiar campos inmutables de una línea", async () => {
  await assertInvalid(
    "update-catalog-line-request.schema.json",
    "etapa-16/update-catalog-line-request-extra-immutable.json"
  );
});

test("acepta los contratos de inventario inicial controlado", async () => {
  await assertValid("register-initial-inventory-request.schema.json", "etapa-17/register-initial-inventory-request.json");
  await assertValid("register-initial-inventory-result.schema.json", "etapa-17/register-initial-inventory-result.json");
  await assertValid("initial-inventory-load.schema.json", "etapa-17/initial-inventory-load.json");
  await assertValid("resultado-idempotente.schema.json", "etapa-17/idempotent-initial-inventory-result.json");
});

test("rechaza total enviado por el cliente en la carga inicial", async () => {
  await assertInvalid(
    "register-initial-inventory-request.schema.json",
    "etapa-17/register-initial-inventory-request-with-total.json"
  );
});

test("acepta la plantilla ficticia versionada de migración y su informe", async () => {
  const template = JSON.parse(await readFile(
    new URL("../data/templates/paquete-migracion-catalogo-v1.example.json", root),
    "utf8"
  ));
  const packageResult = validateContract(registry, "migration-catalog-package-v1.schema.json", template);
  assert.equal(packageResult.valid, true, JSON.stringify(packageResult, null, 2));
  await assertValid("migration-validation-result.schema.json", "etapa-18/migration-validation-result.json");
});

test("rechaza IDs internos, total calculado y campos adicionales en el paquete", async () => {
  const template = JSON.parse(await readFile(
    new URL("../data/templates/paquete-migracion-catalogo-v1.example.json", root),
    "utf8"
  ));
  template.lineas[0].lineaId = "ID-FIRESTORE-PROHIBIDO";
  template.inventariosIniciales[0].total = 210;
  const result = validateContract(registry, "migration-catalog-package-v1.schema.json", template);
  assert.equal(result.valid, false);
  assert.ok(result.schemaErrors.length >= 2);
});
