import {readFileSync} from "node:fs";
import {join} from "node:path";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {doc, getDoc, setDoc} from "firebase/firestore";
import {afterAll, beforeAll, describe, it} from "vitest";

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: "demo-vivero-control-tests",
    firestore: {
      rules: readFileSync(join(__dirname, "../../firestore.rules"), "utf8")
    }
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("reglas cerradas de la ETAPA 2", () => {
  it("rechaza lecturas sin autenticación", async () => {
    const database = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(database, "lineas/linea-prueba")));
  });

  it("rechaza escrituras sin autenticación", async () => {
    const database = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(database, "lineas/linea-prueba"), {cantidad: 10}));
  });
});
