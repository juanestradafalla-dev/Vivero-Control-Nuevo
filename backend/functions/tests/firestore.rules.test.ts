import {readFileSync} from "node:fs";
import {join} from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where} from "firebase/firestore";
import {afterAll, beforeAll, describe, it} from "vitest";

import {ACTIVE_JOURNEY_ID, journeyLineId} from "../scripts/demoData.mjs";

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: "demo-vivero-control-etapa3",
    firestore: {rules: readFileSync(join(__dirname, "../../firestore.rules"), "utf8")}
  });
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, "conteos/CONTEO-AUXILIAR-1"), {
      id: "CONTEO-AUXILIAR-1",
      jornadaId: ACTIVE_JOURNEY_ID,
      jornadaLineaId: journeyLineId(1),
      autorUsuarioId: "uid-auxiliar-1",
      total: 980
    });
    await setDoc(doc(database, "conteos/CONTEO-AUXILIAR-2"), {
      id: "CONTEO-AUXILIAR-2",
      jornadaId: ACTIVE_JOURNEY_ID,
      jornadaLineaId: journeyLineId(2),
      autorUsuarioId: "uid-auxiliar-2",
      total: 1000
    });
    await setDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-1"), {
      id: "DECISION-AUXILIAR-1",
      jornadaId: ACTIVE_JOURNEY_ID,
      autorUsuarioId: "uid-auxiliar-1",
      decision: "APROBAR"
    });
    await setDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-2"), {
      id: "DECISION-AUXILIAR-2",
      jornadaId: ACTIVE_JOURNEY_ID,
      autorUsuarioId: "uid-auxiliar-2",
      decision: "DEVOLVER"
    });
    await setDoc(doc(database, "inventarioOficialLineas/LINEA-PRUEBA-1"), {
      id: "LINEA-PRUEBA-1",
      jornadaId: ACTIVE_JOURNEY_ID,
      lineaId: "LINEA-PRUEBA-1",
      total: 1000
    });
    await setDoc(doc(database, "movimientosInventario/MOVIMIENTO-PRUEBA-1"), {
      id: "MOVIMIENTO-PRUEBA-1",
      jornadaId: ACTIVE_JOURNEY_ID,
      lineaId: "LINEA-PRUEBA-1",
      conteoAprobadoId: "CONTEO-AUXILIAR-1"
    });
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("lecturas mínimas y escrituras críticas cerradas en la ETAPA 5", () => {
  it("permite al auxiliar leer su perfil, jornada y líneas autorizadas", async () => {
    const database = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertSucceeds(getDoc(doc(database, "usuarios/uid-auxiliar-1")));
    await assertSucceeds(getDoc(doc(database, `jornadas/${ACTIVE_JOURNEY_ID}`)));
    await assertSucceeds(getDoc(doc(database, `jornadaLineas/${journeyLineId(1)}`)));
    await assertSucceeds(
      getDocs(query(collection(database, "jornadaLineas"), where("jornadaId", "==", ACTIVE_JOURNEY_ID)))
    );
  });

  it("rechaza perfil ajeno y autorización ajena para auxiliar", async () => {
    const database = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertFails(getDoc(doc(database, "usuarios/uid-auxiliar-2")));
    await assertFails(
      getDoc(doc(database, `jornadas/${ACTIVE_JOURNEY_ID}/autorizaciones/uid-auxiliar-2`))
    );
  });

  it("permite la reserva propia y rechaza la ajena para auxiliar", async () => {
    const ownerDatabase = testEnvironment.authenticatedContext("uid-auxiliar-2").firestore();
    const otherDatabase = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertSucceeds(getDoc(doc(ownerDatabase, "reservas/RESERVA-PRUEBA-PREEXISTENTE")));
    await assertFails(getDoc(doc(otherDatabase, "reservas/RESERVA-PRUEBA-PREEXISTENTE")));
  });

  it("permite al supervisor leer reservas de su jornada", async () => {
    const database = testEnvironment.authenticatedContext("uid-supervisor").firestore();
    await assertSucceeds(getDoc(doc(database, "reservas/RESERVA-PRUEBA-PREEXISTENTE")));
    await assertSucceeds(
      getDocs(query(collection(database, "reservas"), where("jornadaId", "==", ACTIVE_JOURNEY_ID)))
    );
  });

  it("rechaza lecturas sin autenticación o con usuario inactivo", async () => {
    const anonymous = testEnvironment.unauthenticatedContext().firestore();
    const inactive = testEnvironment.authenticatedContext("uid-inactivo-prueba").firestore();
    await assertFails(getDoc(doc(anonymous, `jornadas/${ACTIVE_JOURNEY_ID}`)));
    await assertFails(getDoc(doc(inactive, `jornadas/${ACTIVE_JOURNEY_ID}`)));
  });

  it("rechaza auditoría e idempotencia desde cualquier cliente", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(getDoc(doc(database, "auditoria/evento-cualquiera")));
    await assertFails(getDoc(doc(database, "idempotencia/resultado-cualquiera")));
  });

  it("permite al autor leer y consultar únicamente sus conteos", async () => {
    const database = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertSucceeds(getDoc(doc(database, "conteos/CONTEO-AUXILIAR-1")));
    await assertFails(getDoc(doc(database, "conteos/CONTEO-AUXILIAR-2")));
    await assertSucceeds(
      getDocs(query(collection(database, "conteos"), where("autorUsuarioId", "==", "uid-auxiliar-1")))
    );
    await assertFails(getDocs(query(collection(database, "conteos"), where("jornadaId", "==", ACTIVE_JOURNEY_ID))));
  });

  it("permite a supervisor y administrador autorizados leer conteos de la jornada", async () => {
    for (const uid of ["uid-supervisor", "uid-administrador"]) {
      const database = testEnvironment.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(database, "conteos/CONTEO-AUXILIAR-1")));
      await assertSucceeds(
        getDocs(query(collection(database, "conteos"), where("jornadaId", "==", ACTIVE_JOURNEY_ID)))
      );
    }
  });

  it("rechaza crear, editar o eliminar conteos desde cualquier cliente", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(setDoc(doc(database, "conteos/CONTEO-DIRECTO"), {jornadaId: ACTIVE_JOURNEY_ID}));
    await assertFails(updateDoc(doc(database, "conteos/CONTEO-AUXILIAR-1"), {total: 1}));
    await assertFails(deleteDoc(doc(database, "conteos/CONTEO-AUXILIAR-1")));
  });

  it("permite al auxiliar leer únicamente las decisiones de sus conteos", async () => {
    const database = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertSucceeds(getDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-1")));
    await assertFails(getDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-2")));
    await assertSucceeds(getDocs(query(
      collection(database, "decisionesRevision"),
      where("autorUsuarioId", "==", "uid-auxiliar-1")
    )));
    await assertFails(getDoc(doc(database, "inventarioOficialLineas/LINEA-PRUEBA-1")));
    await assertFails(getDoc(doc(database, "movimientosInventario/MOVIMIENTO-PRUEBA-1")));
  });

  it("permite a supervisor y administrador autorizados leer decisiones e inventario", async () => {
    for (const uid of ["uid-supervisor", "uid-administrador"]) {
      const database = testEnvironment.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-1")));
      await assertSucceeds(getDoc(doc(database, "inventarioOficialLineas/LINEA-PRUEBA-1")));
      await assertSucceeds(getDoc(doc(database, "movimientosInventario/MOVIMIENTO-PRUEBA-1")));
    }
  });

  it("rechaza escrituras directas de decisiones, inventario y movimientos", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(setDoc(doc(database, "decisionesRevision/DECISION-DIRECTA"), {decision: "APROBAR"}));
    await assertFails(updateDoc(doc(database, "inventarioOficialLineas/LINEA-PRUEBA-1"), {total: 1}));
    await assertFails(setDoc(doc(database, "movimientosInventario/MOVIMIENTO-DIRECTO"), {total: 1}));
    await assertFails(deleteDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-1")));
  });

  it("rechaza todas las escrituras directas de estado, reserva, auditoría e idempotencia", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(setDoc(doc(database, `jornadaLineas/${journeyLineId(1)}`), {estadoCentral: "EN_CONTEO"}));
    await assertFails(setDoc(doc(database, "reservas/reserva-directa"), {usuarioId: "uid-administrador"}));
    await assertFails(setDoc(doc(database, "auditoria/evento-directo"), {tipo: "NO_PERMITIDO"}));
    await assertFails(setDoc(doc(database, "idempotencia/resultado-directo"), {operacion: "NO_PERMITIDA"}));
  });
});
