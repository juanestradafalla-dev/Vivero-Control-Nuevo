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
  assert.equal(registry.entityCount, 11);
  assert.equal(registry.schemaCount, 12);
  assert.equal(registry.enumCount, 4);
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
