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

import {
  ACTIVE_JOURNEY_ID,
  DRAFT_JOURNEY_ID,
  SECOND_ACTIVE_JOURNEY_ID,
  UNAUTHORIZED_ACTIVE_JOURNEY_ID,
  journeyLineId,
  secondJourneyLineId
} from "../scripts/demoData.mjs";

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
      jornadaLineaId: journeyLineId(1),
      conteoId: "CONTEO-AUXILIAR-1",
      decision: "APROBAR"
    });
    await setDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-2"), {
      id: "DECISION-AUXILIAR-2",
      jornadaId: ACTIVE_JOURNEY_ID,
      autorUsuarioId: "uid-auxiliar-2",
      jornadaLineaId: journeyLineId(2),
      conteoId: "CONTEO-AUXILIAR-2",
      decision: "DEVOLVER"
    });
    await setDoc(doc(database, `jornadaLineas/${journeyLineId(1)}`), {
      id: journeyLineId(1),
      jornadaId: ACTIVE_JOURNEY_ID,
      lineaId: "LINEA-PRUEBA-1",
      activa: true,
      estadoCentral: "DEVUELTA",
      conteoVigenteId: "CONTEO-AUXILIAR-1",
      responsableCorreccionUsuarioId: "uid-auxiliar-2",
      reasignacionActivaId: "REASIGNACION-PRUEBA-1"
    });
    await setDoc(doc(database, "reasignacionesCorreccion/REASIGNACION-PRUEBA-1"), {
      id: "REASIGNACION-PRUEBA-1",
      jornadaId: ACTIVE_JOURNEY_ID,
      jornadaLineaId: journeyLineId(1),
      conteoId: "CONTEO-AUXILIAR-1",
      autorOriginalUsuarioId: "uid-auxiliar-1",
      nuevoUsuarioId: "uid-auxiliar-2",
      actorUsuarioId: "uid-supervisor",
      motivo: "Autor ausente",
      inmutable: true
    });
    await setDoc(doc(database, "liberacionesReserva/LIBERACION-PRUEBA-1"), {
      id: "LIBERACION-PRUEBA-1",
      reservaId: "RESERVA-PRUEBA-PREEXISTENTE",
      jornadaId: ACTIVE_JOURNEY_ID,
      jornadaLineaId: journeyLineId(3),
      tipoReserva: "INICIAL",
      actorUsuarioId: "uid-supervisor",
      motivo: "Liberación ficticia para reglas",
      inmutable: true
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
    await setDoc(doc(database, "cargasInventarioInicial/LINEA-PRUEBA-1"), {
      id: "LINEA-PRUEBA-1", lineaId: "LINEA-PRUEBA-1", total: 1000, inmutable: true
    });
    await setDoc(doc(database, "descartes/DESCARTE-AUXILIAR-1"), {
      id: "DESCARTE-AUXILIAR-1", lineaId: "LINEA-PRUEBA-1",
      autorUsuarioId: "uid-auxiliar-1", estado: "PENDIENTE_REVISION", totalUnico: 5
    });
    await setDoc(doc(database, "descartes/DESCARTE-AUXILIAR-2"), {
      id: "DESCARTE-AUXILIAR-2", lineaId: "LINEA-PRUEBA-2",
      autorUsuarioId: "uid-auxiliar-2", estado: "DEVUELTO", totalUnico: 3
    });
    await setDoc(doc(database, "decisionesDescartes/DECISION-DESCARTE-1"), {
      id: "DECISION-DESCARTE-1", descarteId: "DESCARTE-AUXILIAR-1",
      lineaId: "LINEA-PRUEBA-1", autorUsuarioId: "uid-auxiliar-1", decision: "APROBAR"
    });
    await setDoc(doc(database, "informesInventario/JORNADA-INFORME-REGLAS"), {
      id: "JORNADA-INFORME-REGLAS",
      jornadaId: "JORNADA-INFORME-REGLAS",
      estado: "COMPLETADO"
    });
    await setDoc(doc(database, "trabajosCierreJornada/JORNADA-CIERRE-REGLAS"), {
      id: "JORNADA-CIERRE-REGLAS",
      jornadaId: "JORNADA-CIERRE-REGLAS",
      estado: "ERROR",
      fase: "LINEAS"
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

  it("aísla lecturas entre jornadas dinámicas según la autorización central", async () => {
    const authorized = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertSucceeds(getDoc(doc(authorized, `jornadas/${SECOND_ACTIVE_JOURNEY_ID}`)));
    await assertSucceeds(getDoc(doc(authorized, `jornadaLineas/${secondJourneyLineId(1)}`)));
    await assertSucceeds(getDocs(query(
      collection(authorized, "jornadaLineas"),
      where("jornadaId", "==", SECOND_ACTIVE_JOURNEY_ID)
    )));
    await assertFails(getDoc(doc(authorized, `jornadas/${UNAUTHORIZED_ACTIVE_JOURNEY_ID}`)));

    const singleJourneyUser = testEnvironment.authenticatedContext("uid-auxiliar-2").firestore();
    await assertFails(getDoc(doc(singleJourneyUser, `jornadas/${SECOND_ACTIVE_JOURNEY_ID}`)));
    await assertFails(getDoc(doc(singleJourneyUser, `jornadaLineas/${secondJourneyLineId(1)}`)));
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

  it("rechaza lectura y escritura directa de trabajos de cierre", async () => {
    for (const uid of ["uid-auxiliar-1", "uid-supervisor", "uid-administrador"]) {
      const database = testEnvironment.authenticatedContext(uid).firestore();
      const reference = doc(database, "trabajosCierreJornada/JORNADA-CIERRE-REGLAS");
      await assertFails(getDoc(reference));
      await assertFails(updateDoc(reference, {estado: "PENDIENTE"}));
      await assertFails(setDoc(doc(database, `trabajosCierreJornada/DIRECTO-${uid}`), {
        estado: "PENDIENTE"
      }));
      await assertFails(deleteDoc(reference));
    }
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
    await assertFails(getDoc(doc(database, "cargasInventarioInicial/LINEA-PRUEBA-1")));
    await assertFails(setDoc(doc(database, "cargasInventarioInicial/LINEA-DIRECTA"), {total: 1}));
    await assertFails(deleteDoc(doc(database, "decisionesRevision/DECISION-AUXILIAR-1")));
  });

  it("aísla descartes por autor y permite la revisión global autorizada", async () => {
    const auxiliary = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertSucceeds(getDoc(doc(auxiliary, "descartes/DESCARTE-AUXILIAR-1")));
    await assertFails(getDoc(doc(auxiliary, "descartes/DESCARTE-AUXILIAR-2")));
    await assertSucceeds(getDocs(query(
      collection(auxiliary, "descartes"), where("autorUsuarioId", "==", "uid-auxiliar-1")
    )));
    await assertSucceeds(getDoc(doc(auxiliary, "decisionesDescartes/DECISION-DESCARTE-1")));

    for (const uid of ["uid-supervisor", "uid-administrador"]) {
      const reviewer = testEnvironment.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(reviewer, "descartes/DESCARTE-AUXILIAR-1")));
      await assertSucceeds(getDocs(query(
        collection(reviewer, "descartes"), where("estado", "==", "PENDIENTE_REVISION")
      )));
      await assertSucceeds(getDoc(doc(reviewer, "decisionesDescartes/DECISION-DESCARTE-1")));
    }
  });

  it("impide cualquier escritura directa de descartes y sus decisiones", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(setDoc(doc(database, "descartes/DESCARTE-DIRECTO"), {estado: "PENDIENTE_REVISION"}));
    await assertFails(updateDoc(doc(database, "descartes/DESCARTE-AUXILIAR-1"), {estado: "APROBADO"}));
    await assertFails(deleteDoc(doc(database, "descartes/DESCARTE-AUXILIAR-1")));
    await assertFails(setDoc(doc(database, "decisionesDescartes/DECISION-DIRECTA"), {decision: "APROBAR"}));
  });

  it("permite al asignado leer la corrección y mantiene terceros fuera", async () => {
    const assigned = testEnvironment.authenticatedContext("uid-auxiliar-2").firestore();
    await assertSucceeds(getDoc(doc(assigned, "reasignacionesCorreccion/REASIGNACION-PRUEBA-1")));
    await assertSucceeds(getDoc(doc(assigned, "conteos/CONTEO-AUXILIAR-1")));
    await assertSucceeds(getDoc(doc(assigned, "decisionesRevision/DECISION-AUXILIAR-1")));

    const unrelated = testEnvironment.authenticatedContext("uid-inactivo-prueba").firestore();
    await assertFails(getDoc(doc(unrelated, "reasignacionesCorreccion/REASIGNACION-PRUEBA-1")));
  });

  it("permite al supervisor consultar candidatos activos y autorizaciones de su jornada", async () => {
    const supervisor = testEnvironment.authenticatedContext("uid-supervisor").firestore();
    await assertFails(getDocs(query(collection(supervisor, "usuarios"), where("activo", "==", true))));
    await assertSucceeds(getDocs(collection(supervisor, `jornadas/${ACTIVE_JOURNEY_ID}/autorizaciones`)));

    const auxiliary = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertFails(getDocs(query(collection(auxiliary, "usuarios"), where("activo", "==", true))));
    await assertFails(getDocs(collection(auxiliary, `jornadas/${ACTIVE_JOURNEY_ID}/autorizaciones`)));
  });

  it("obliga a consultar y actualizar perfiles administrativos mediante Callables", async () => {
    const administrator = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertSucceeds(getDoc(doc(administrator, "usuarios/uid-administrador")));
    await assertFails(getDoc(doc(administrator, "usuarios/uid-auxiliar-1")));
    await assertFails(getDocs(collection(administrator, "usuarios")));
    await assertFails(updateDoc(doc(administrator, "usuarios/uid-auxiliar-1"), {activo: false}));
    await assertFails(setDoc(doc(administrator, "usuarios/uid-nuevo"), {activo: true}));
    await assertFails(deleteDoc(doc(administrator, "usuarios/uid-auxiliar-1")));
    const inactive = testEnvironment.authenticatedContext("uid-inactivo-prueba").firestore();
    await assertSucceeds(getDoc(doc(inactive, "usuarios/uid-inactivo-prueba")));
    await assertFails(getDocs(collection(inactive, "usuarios")));
  });

  it("rechaza crear, editar o eliminar reasignaciones desde clientes", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(setDoc(doc(database, "reasignacionesCorreccion/DIRECTA"), {conteoId: "CONTEO-AUXILIAR-1"}));
    await assertFails(updateDoc(doc(database, "reasignacionesCorreccion/REASIGNACION-PRUEBA-1"), {motivo: "Otro"}));
    await assertFails(deleteDoc(doc(database, "reasignacionesCorreccion/REASIGNACION-PRUEBA-1")));
  });

  it("limita las liberaciones a supervisión y rechaza todas sus escrituras directas", async () => {
    const supervisor = testEnvironment.authenticatedContext("uid-supervisor").firestore();
    const administrator = testEnvironment.authenticatedContext("uid-administrador").firestore();
    const auxiliary = testEnvironment.authenticatedContext("uid-auxiliar-1").firestore();
    await assertSucceeds(getDoc(doc(supervisor, "liberacionesReserva/LIBERACION-PRUEBA-1")));
    await assertSucceeds(getDocs(query(
      collection(administrator, "liberacionesReserva"),
      where("jornadaId", "==", ACTIVE_JOURNEY_ID)
    )));
    await assertFails(getDoc(doc(auxiliary, "liberacionesReserva/LIBERACION-PRUEBA-1")));
    await assertFails(setDoc(doc(administrator, "liberacionesReserva/LIBERACION-DIRECTA"), {
      jornadaId: ACTIVE_JOURNEY_ID
    }));
    await assertFails(updateDoc(doc(administrator, "liberacionesReserva/LIBERACION-PRUEBA-1"), {
      motivo: "Cambio directo"
    }));
    await assertFails(deleteDoc(doc(administrator, "liberacionesReserva/LIBERACION-PRUEBA-1")));
  });

  it("rechaza todas las escrituras directas de estado, reserva, auditoría e idempotencia", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(setDoc(doc(database, `jornadaLineas/${journeyLineId(1)}`), {estadoCentral: "EN_CONTEO"}));
    await assertFails(updateDoc(doc(database, `jornadas/${ACTIVE_JOURNEY_ID}`), {
      estadoAdministrativo: "INACTIVA"
    }));
    await assertFails(updateDoc(doc(database, `jornadaLineas/${journeyLineId(1)}`), {activa: false}));
    await assertFails(updateDoc(
      doc(database, `jornadas/${ACTIVE_JOURNEY_ID}/autorizaciones/uid-administrador`),
      {activa: false}
    ));
    await assertFails(deleteDoc(doc(database, "ocupacionesLineasActivas/LINEA-PRUEBA-1")));
    await assertFails(setDoc(doc(database, "reservas/reserva-directa"), {usuarioId: "uid-administrador"}));
    await assertFails(setDoc(doc(database, "auditoria/evento-directo"), {tipo: "NO_PERMITIDO"}));
    await assertFails(setDoc(doc(database, "idempotencia/resultado-directo"), {operacion: "NO_PERMITIDA"}));
  });

  it("rechaza escrituras directas del catalogo y acceso a sus bloqueos de unicidad", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(setDoc(doc(database, "ubicaciones/UBICACION-DIRECTA"), {
      codigo: "DIRECTA", tipo: "FIXTURE", activa: true
    }));
    await assertFails(updateDoc(doc(database, "ubicaciones/VIVERO-PRUEBA"), {activa: false}));
    await assertFails(deleteDoc(doc(database, "ubicaciones/VIVERO-PRUEBA")));
    await assertFails(setDoc(doc(database, "lineas/LINEA-DIRECTA"), {
      ubicacionId: "CAMA-PRUEBA-1", codigo: "DIRECTA", activa: true
    }));
    await assertFails(updateDoc(doc(database, "lineas/LINEA-CATALOGO-LIBRE-1"), {activa: false}));
    await assertFails(deleteDoc(doc(database, "lineas/LINEA-CATALOGO-LIBRE-1")));
    await assertFails(getDoc(doc(database, "bloqueosCodigosCatalogo/BLOQUEO-DIRECTO")));
    await assertFails(setDoc(doc(database, "bloqueosCodigosCatalogo/BLOQUEO-DIRECTO"), {
      codigoNormalizado: "DIRECTO"
    }));
  });

  it("niega acceso directo al historial y a los bloqueos de migración", async () => {
    const database = testEnvironment.authenticatedContext("uid-administrador").firestore();
    await assertFails(getDoc(doc(database, "importacionesMigracion/IMPORTACION-DIRECTA")));
    await assertFails(getDocs(collection(database, "importacionesMigracion")));
    await assertFails(setDoc(doc(database, "importacionesMigracion/IMPORTACION-DIRECTA"), {estado: "APLICADA"}));
    await assertFails(updateDoc(doc(database, "importacionesMigracion/IMPORTACION-DIRECTA"), {estado: "REVERTIDA"}));
    await assertFails(deleteDoc(doc(database, "importacionesMigracion/IMPORTACION-DIRECTA")));
    await assertFails(getDoc(doc(database, "bloqueosHashesMigracion/HASH-DIRECTO")));
    await assertFails(setDoc(doc(database, "bloqueosHashesMigracion/HASH-DIRECTO"), {hashPaquete: "prohibido"}));
  });

  it("rechaza lectura y escritura directa de borradores y su seleccion preparatoria", async () => {
    for (const uid of ["uid-auxiliar-1", "uid-supervisor", "uid-administrador"]) {
      const database = testEnvironment.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(database, `jornadas/${DRAFT_JOURNEY_ID}`)));
      await assertFails(getDoc(doc(database, `seleccionesLineasJornada/${DRAFT_JOURNEY_ID}`)));
      await assertFails(setDoc(doc(database, "jornadas/JORNADA-BORRADOR-DIRECTA"), {
        estadoAdministrativo: "BORRADOR"
      }));
      await assertFails(setDoc(doc(database, `seleccionesLineasJornada/${DRAFT_JOURNEY_ID}`), {
        lineaIds: ["LINEA-CATALOGO-LIBRE-1"]
      }));
      await assertFails(getDoc(doc(database, `seleccionesParticipantesJornada/${DRAFT_JOURNEY_ID}`)));
      await assertFails(setDoc(doc(database, `seleccionesParticipantesJornada/${DRAFT_JOURNEY_ID}`), {
        jornadaId: DRAFT_JOURNEY_ID,
        participantes: [{usuarioId: "uid-auxiliar-1", puedeContar: true}]
      }));
      await assertFails(getDoc(doc(database, "cancelacionesJornadas/CANCELACION-DIRECTA")));
      await assertFails(setDoc(doc(database, "cancelacionesJornadas/CANCELACION-DIRECTA"), {
        jornadaId: DRAFT_JOURNEY_ID,
        tipoInactivacion: "CANCELACION_BORRADOR"
      }));
      await assertFails(updateDoc(doc(database, `jornadas/${DRAFT_JOURNEY_ID}`), {
        estadoAdministrativo: "INACTIVA",
        tipoInactivacion: "CANCELACION_BORRADOR"
      }));
      await assertFails(getDoc(doc(database, "ocupacionesLineasActivas/LINEA-PRUEBA-1")));
      await assertFails(setDoc(doc(database, "ocupacionesLineasActivas/LINEA-DIRECTA"), {
        lineaId: "LINEA-DIRECTA",
        jornadaId: DRAFT_JOURNEY_ID
      }));
    }
  });

  it("niega toda lectura y escritura directa de informes de inventario", async () => {
    for (const uid of ["uid-auxiliar-1", "uid-supervisor", "uid-administrador"]) {
      const database = testEnvironment.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(database, "informesInventario/JORNADA-INFORME-REGLAS")));
      await assertFails(getDocs(collection(database, "informesInventario")));
      await assertFails(setDoc(doc(database, "informesInventario/JORNADA-INFORME-DIRECTO"), {
        estado: "PENDIENTE"
      }));
      await assertFails(updateDoc(doc(database, "informesInventario/JORNADA-INFORME-REGLAS"), {
        estado: "PENDIENTE"
      }));
      await assertFails(deleteDoc(doc(database, "informesInventario/JORNADA-INFORME-REGLAS")));
    }
  });
});
