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
  assert.equal(registry.entityCount, 32);
  assert.equal(registry.schemaCount, 33);
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
