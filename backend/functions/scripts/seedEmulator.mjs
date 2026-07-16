import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

import {
  ACTIVE_JOURNEY_ID,
  DRAFT_JOURNEY_ID,
  DEMO_PASSWORD,
  DEMO_PROJECT_ID,
  FREE_CATALOG_LINE_ID,
  INACTIVE_CATALOG_LINE_ID,
  OTHER_SUPERVISOR_DRAFT_JOURNEY_ID,
  SECOND_FREE_CATALOG_LINE_ID,
  SECOND_ACTIVE_JOURNEY_ID,
  UNAUTHORIZED_ACTIVE_JOURNEY_ID,
  demoAccounts,
  journeyLineId,
  secondJourneyLineId,
  secondJourneyLocations,
  visibleLocations
} from "./demoData.mjs";

function configureEmulatorEnvironment() {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? DEMO_PROJECT_ID;
  if (!projectId.startsWith("demo-")) {
    throw new Error("Carga cancelada: el proyecto debe comenzar por demo-.");
  }
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8180";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  return projectId;
}

async function upsertAuthUser(auth, account) {
  try {
    await auth.getUser(account.uid);
    await auth.updateUser(account.uid, {
      email: account.email,
      password: DEMO_PASSWORD,
      displayName: account.nombreVisible,
      disabled: false,
      emailVerified: true
    });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await auth.createUser({
      uid: account.uid,
      email: account.email,
      password: DEMO_PASSWORD,
      displayName: account.nombreVisible,
      disabled: false,
      emailVerified: true
    });
  }
  await auth.setCustomUserClaims(account.uid, {entorno: "EMULADOR"});
}

async function clearCollection(database, collectionName) {
  while (true) {
    const snapshot = await database.collection(collectionName).limit(400).get();
    if (snapshot.empty) return;
    const batch = database.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

async function clearJourneyAuthorizations(database) {
  while (true) {
    const snapshot = await database.collectionGroup("autorizaciones").limit(400).get();
    if (snapshot.empty) return;
    const batch = database.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

function catalogLockId(kind, scope, code) {
  return createHash("sha256").update(`${kind}:${scope}:${code}`, "utf8").digest("hex");
}

export async function seedEmulator() {
  const projectId = configureEmulatorEnvironment();
  const app = getApps().find((candidate) => candidate.name === "etapa-3-seed") ??
    initializeApp({projectId}, "etapa-3-seed");
  const auth = getAuth(app);
  const database = getFirestore(app);
  const now = Timestamp.fromDate(new Date("2026-07-13T12:00:00.000Z"));
  const secondJourneyCreatedAt = Timestamp.fromDate(new Date("2026-07-14T12:00:00.000Z"));

  for (const account of demoAccounts) await upsertAuthUser(auth, account);
  await clearJourneyAuthorizations(database);
  for (const collectionName of [
    "conteos",
    "inventarioOficialLineas",
    "cargasInventarioInicial",
    "movimientosInventario",
    "decisionesRevision",
    "reasignacionesCorreccion",
    "liberacionesReserva",
    "cancelacionesJornadas",
    "reservas",
    "idempotencia",
    "auditoria",
    "jornadaLineas",
    "jornadas",
    "seleccionesLineasJornada",
    "seleccionesParticipantesJornada",
    "ocupacionesLineasActivas",
    "bloqueosCodigosCatalogo",
    "lineas",
    "ubicaciones"
  ]) {
    await clearCollection(database, collectionName);
  }

  const batch = database.batch();
  for (const account of demoAccounts) {
    if (account.crearPerfil === false) continue;
    batch.set(database.collection("usuarios").doc(account.uid), {
      id: account.uid,
      nombreVisible: account.nombreVisible,
      roles: [account.rol],
      activo: account.activo,
      version: 1,
      entorno: "FICTICIO_EMULADOR",
      creadoEn: now,
      actualizadoEn: now
    });
  }

  const locationDocuments = [
    {id: "VIVERO-PRUEBA", codigo: "VIVERO-PRUEBA", tipo: "VIVERO", nombreVisible: "Vivero ficticio", orden: 1},
    {id: "MODULO-PRUEBA-1", codigo: "MODULO-PRUEBA-1", tipo: "MODULO", ubicacionPadreId: "VIVERO-PRUEBA", nombreVisible: "Módulo ficticio 1", orden: 1},
    {id: "CAMA-PRUEBA-1", codigo: "CAMA-PRUEBA-1", tipo: "CAMA", ubicacionPadreId: "MODULO-PRUEBA-1", nombreVisible: "Cama ficticia 1", orden: 1},
    {id: "MODULO-PRUEBA-2", codigo: "MODULO-PRUEBA-2", tipo: "MODULO", ubicacionPadreId: "VIVERO-PRUEBA", nombreVisible: "Módulo ficticio 2", orden: 2},
    {id: "CAMA-PRUEBA-2", codigo: "CAMA-PRUEBA-2", tipo: "CAMA", ubicacionPadreId: "MODULO-PRUEBA-2", nombreVisible: "Cama ficticia 2", orden: 1}
  ];
  for (const location of locationDocuments) {
    batch.set(database.collection("ubicaciones").doc(location.id), {
      ...location, ubicacionPadreId: location.ubicacionPadreId ?? null,
      codigoNormalizado: location.codigo, activa: true, version: 1, creadaEn: now, actualizadaEn: now
    });
    const scope = location.ubicacionPadreId ?? "ROOT";
    const lockId = catalogLockId("UBICACION", scope, location.codigo);
    batch.set(database.collection("bloqueosCodigosCatalogo").doc(lockId), {
      id: lockId, recursoTipo: "UBICACION", recursoId: location.id,
      ambitoId: scope, codigoNormalizado: location.codigo, creadoEn: now
    });
  }
  visibleLocations.forEach((location, index) => {
    const lineId = `LINEA-PRUEBA-${index + 1}`;
    batch.set(database.collection("lineas").doc(lineId), {
      id: lineId,
      ubicacionId: "CAMA-PRUEBA-1",
      codigo: lineId,
      codigoNormalizado: lineId,
      nombreVisible: location.nombreVisible,
      orden: location.orden,
      activa: true,
      version: 1,
      creadaEn: now,
      actualizadaEn: now
    });
  });
  secondJourneyLocations.forEach((location, index) => {
    const lineId = `LINEA-PRUEBA-B-${index + 1}`;
    batch.set(database.collection("lineas").doc(lineId), {
      id: lineId,
      ubicacionId: "CAMA-PRUEBA-2",
      codigo: lineId,
      codigoNormalizado: lineId,
      nombreVisible: location.nombreVisible,
      orden: location.orden,
      activa: true,
      version: 1,
      creadaEn: secondJourneyCreatedAt,
      actualizadaEn: secondJourneyCreatedAt
    });
  });
  for (const line of [
    {id: "LINEA-PRUEBA-SIN-ACCESO", locationId: "CAMA-PRUEBA-2", name: "Línea activa no autorizada", order: 90},
    {id: "LINEA-PRUEBA-INACTIVA", locationId: "CAMA-PRUEBA-2", name: "Línea de jornada inactiva", order: 91}
  ]) {
    batch.set(database.collection("lineas").doc(line.id), {
      id: line.id,
      ubicacionId: line.locationId,
      codigo: line.id,
      codigoNormalizado: line.id,
      nombreVisible: line.name,
      orden: line.order,
      activa: true,
      version: 1,
      creadaEn: now,
      actualizadaEn: now
    });
  }

  for (const line of [
    {id: FREE_CATALOG_LINE_ID, name: "Linea libre de catalogo 1", order: 92, active: true},
    {id: SECOND_FREE_CATALOG_LINE_ID, name: "Linea libre de catalogo 2", order: 93, active: true},
    {id: INACTIVE_CATALOG_LINE_ID, name: "Linea inactiva de catalogo", order: 94, active: false}
  ]) {
    batch.set(database.collection("lineas").doc(line.id), {
      id: line.id,
      ubicacionId: "CAMA-PRUEBA-2",
      codigo: line.id,
      codigoNormalizado: line.id,
      nombreVisible: line.name,
      orden: line.order,
      activa: line.active,
      version: 1,
      creadaEn: now,
      actualizadaEn: now
    });
  }

  const seededLineIds = [
    ...visibleLocations.map((_, index) => `LINEA-PRUEBA-${index + 1}`),
    ...secondJourneyLocations.map((_, index) => `LINEA-PRUEBA-B-${index + 1}`),
    "LINEA-PRUEBA-SIN-ACCESO", "LINEA-PRUEBA-INACTIVA",
    FREE_CATALOG_LINE_ID, SECOND_FREE_CATALOG_LINE_ID, INACTIVE_CATALOG_LINE_ID
  ];
  for (const lineId of seededLineIds) {
    const locationId = lineId.startsWith("LINEA-PRUEBA-") && !lineId.startsWith("LINEA-PRUEBA-B-") &&
      !["LINEA-PRUEBA-SIN-ACCESO", "LINEA-PRUEBA-INACTIVA"].includes(lineId)
      ? "CAMA-PRUEBA-1"
      : "CAMA-PRUEBA-2";
    const lockId = catalogLockId("LINEA", locationId, lineId);
    batch.set(database.collection("bloqueosCodigosCatalogo").doc(lockId), {
      id: lockId, recursoTipo: "LINEA", recursoId: lineId,
      ambitoId: locationId, codigoNormalizado: lineId, creadoEn: now
    });
  }

  const journeyRef = database.collection("jornadas").doc(ACTIVE_JOURNEY_ID);
  batch.set(journeyRef, {
    id: ACTIVE_JOURNEY_ID,
    nombreVisible: "Jornada ficticia de la Etapa 3",
    creadaPorUsuarioId: "uid-administrador",
    estadoAdministrativo: "ACTIVA",
    version: 1,
    entorno: "FICTICIO_EMULADOR",
    creadaEn: now,
    actualizadaEn: now
  });
  const secondJourneyRef = database.collection("jornadas").doc(SECOND_ACTIVE_JOURNEY_ID);
  batch.set(secondJourneyRef, {
    id: SECOND_ACTIVE_JOURNEY_ID,
    nombreVisible: "Jornada ficticia dinámica B",
    creadaPorUsuarioId: "uid-administrador",
    estadoAdministrativo: "ACTIVA",
    version: 1,
    entorno: "FICTICIO_EMULADOR",
    creadaEn: secondJourneyCreatedAt,
    actualizadaEn: secondJourneyCreatedAt
  });
  const unauthorizedJourneyRef = database.collection("jornadas").doc(UNAUTHORIZED_ACTIVE_JOURNEY_ID);
  batch.set(unauthorizedJourneyRef, {
    id: UNAUTHORIZED_ACTIVE_JOURNEY_ID,
    nombreVisible: "Jornada activa sin autorización",
    creadaPorUsuarioId: "uid-administrador",
    estadoAdministrativo: "ACTIVA",
    version: 1,
    entorno: "FICTICIO_EMULADOR",
    creadaEn: now,
    actualizadaEn: now
  });
  const inactiveJourneyId = "JORNADA-PRUEBA-INACTIVA";
  const inactiveJourneyRef = database.collection("jornadas").doc(inactiveJourneyId);
  batch.set(inactiveJourneyRef, {
    id: inactiveJourneyId,
    nombreVisible: "Jornada inactiva ficticia",
    creadaPorUsuarioId: "uid-administrador",
    estadoAdministrativo: "INACTIVA",
    version: 1,
    entorno: "FICTICIO_EMULADOR",
    creadaEn: now,
    actualizadaEn: now
  });

  const draftCreatedAt = Timestamp.fromDate(new Date("2026-07-15T12:00:00.000Z"));
  for (const draft of [
    {
      id: DRAFT_JOURNEY_ID,
      name: "Borrador ficticio del supervisor",
      creatorId: "uid-supervisor",
      creatorName: "Supervisor ficticio",
      lineIds: [FREE_CATALOG_LINE_ID]
    },
    {
      id: OTHER_SUPERVISOR_DRAFT_JOURNEY_ID,
      name: "Borrador ficticio de otro supervisor",
      creatorId: "uid-supervisor-2",
      creatorName: "Supervisor ficticio 2",
      lineIds: []
    }
  ]) {
    batch.set(database.collection("jornadas").doc(draft.id), {
      id: draft.id,
      nombreVisible: draft.name,
      creadaPorUsuarioId: draft.creatorId,
      creadorNombreVisible: draft.creatorName,
      rolCreador: "SUPERVISOR",
      estadoAdministrativo: "BORRADOR",
      version: 1,
      cantidadLineasSeleccionadas: draft.lineIds.length,
      cantidadParticipantesSeleccionados: draft.id === DRAFT_JOURNEY_ID ? 1 : 0,
      entorno: "FICTICIO_EMULADOR",
      creadaEn: draftCreatedAt,
      actualizadaEn: draftCreatedAt
    });
    batch.set(database.collection("seleccionesLineasJornada").doc(draft.id), {
      id: draft.id,
      jornadaId: draft.id,
      lineaIds: draft.lineIds,
      cantidadLineas: draft.lineIds.length,
      versionJornada: 1,
      actualizadaPorUsuarioId: draft.creatorId,
      actualizadaEn: draftCreatedAt
    });
    const participants = draft.id === DRAFT_JOURNEY_ID
      ? [{
          usuarioId: "uid-auxiliar-1",
          nombreVisible: "Auxiliar ficticio 1",
          rol: "AUXILIAR",
          puedeContar: true
        }]
      : [];
    batch.set(database.collection("seleccionesParticipantesJornada").doc(draft.id), {
      id: draft.id,
      jornadaId: draft.id,
      participantes: participants,
      cantidadParticipantes: participants.length,
      versionJornada: 1,
      actualizadaPorUsuarioId: draft.creatorId,
      actualizadaEn: draftCreatedAt
    });
  }

  for (const account of demoAccounts.filter((candidate) => candidate.autorizado && candidate.crearPerfil !== false)) {
    batch.set(journeyRef.collection("autorizaciones").doc(account.uid), {
      id: account.uid,
      jornadaId: ACTIVE_JOURNEY_ID,
      usuarioId: account.uid,
      usuarioNombreVisible: account.nombreVisible,
      usuarioActivo: account.activo,
      rolEfectivo: account.rol,
      activa: true,
      puedeContar: true,
      puedeRevisar: account.rol === "SUPERVISOR" || account.rol === "ADMINISTRADOR",
      creadaEn: now
    });
  }
  for (const account of demoAccounts.filter((candidate) =>
    ["uid-auxiliar-1", "uid-supervisor", "uid-administrador"].includes(candidate.uid)
  )) {
    batch.set(secondJourneyRef.collection("autorizaciones").doc(account.uid), {
      id: account.uid,
      jornadaId: SECOND_ACTIVE_JOURNEY_ID,
      usuarioId: account.uid,
      usuarioNombreVisible: account.nombreVisible,
      usuarioActivo: account.activo,
      rolEfectivo: account.rol,
      activa: true,
      puedeContar: true,
      puedeRevisar: account.rol === "SUPERVISOR" || account.rol === "ADMINISTRADOR",
      creadaEn: secondJourneyCreatedAt
    });
  }
  batch.set(inactiveJourneyRef.collection("autorizaciones").doc("uid-auxiliar-1"), {
    id: "uid-auxiliar-1",
    jornadaId: inactiveJourneyId,
    usuarioId: "uid-auxiliar-1",
    rolEfectivo: "AUXILIAR",
    activa: true,
    puedeContar: true,
    puedeRevisar: false,
    creadaEn: now
  });

  visibleLocations.forEach((location, index) => {
    const number = index + 1;
    const id = journeyLineId(number);
    batch.set(database.collection("jornadaLineas").doc(id), {
      id,
      jornadaId: ACTIVE_JOURNEY_ID,
      lineaId: `LINEA-PRUEBA-${number}`,
      activa: true,
      estadoCentral: number === 3 ? "EN_CONTEO" : "DISPONIBLE",
      reservaActivaId: number === 3 ? "RESERVA-PRUEBA-PREEXISTENTE" : null,
      version: number === 3 ? 1 : 0,
      ubicacion: location,
      actualizadaEn: now
    });
  });
  secondJourneyLocations.forEach((location, index) => {
    const number = index + 1;
    const id = secondJourneyLineId(number);
    batch.set(database.collection("jornadaLineas").doc(id), {
      id,
      jornadaId: SECOND_ACTIVE_JOURNEY_ID,
      lineaId: `LINEA-PRUEBA-B-${number}`,
      activa: true,
      estadoCentral: "DISPONIBLE",
      reservaActivaId: null,
      version: 0,
      ubicacion: location,
      actualizadaEn: secondJourneyCreatedAt
    });
  });
  for (const occupation of [
    ...visibleLocations.map((_, index) => ({
      lineaId: `LINEA-PRUEBA-${index + 1}`,
      jornadaId: ACTIVE_JOURNEY_ID,
      activadaEn: now
    })),
    ...secondJourneyLocations.map((_, index) => ({
      lineaId: `LINEA-PRUEBA-B-${index + 1}`,
      jornadaId: SECOND_ACTIVE_JOURNEY_ID,
      activadaEn: secondJourneyCreatedAt
    })),
    {
      lineaId: "LINEA-PRUEBA-SIN-ACCESO",
      jornadaId: UNAUTHORIZED_ACTIVE_JOURNEY_ID,
      activadaEn: now
    }
  ]) {
    batch.set(database.collection("ocupacionesLineasActivas").doc(occupation.lineaId), {
      id: occupation.lineaId,
      lineaId: occupation.lineaId,
      jornadaId: occupation.jornadaId,
      activadaPorUsuarioId: "uid-administrador",
      activadaEn: occupation.activadaEn
    });
  }
  const initialInventories = [
    {hembras: 500, machos: 300, patrones: 200},
    {hembras: 380, machos: 220, patrones: 150},
    {hembras: 270, machos: 180, patrones: 90}
  ];
  initialInventories.forEach((values, index) => {
    const number = index + 1;
    const lineId = `LINEA-PRUEBA-${number}`;
    batch.set(database.collection("inventarioOficialLineas").doc(lineId), {
      id: lineId,
      jornadaId: ACTIVE_JOURNEY_ID,
      jornadaLineaId: journeyLineId(number),
      lineaId: lineId,
      hembras: values.hembras,
      machos: values.machos,
      patrones: values.patrones,
      total: values.hembras + values.machos + values.patrones,
      conteoAprobadoId: null,
      version: 1,
      origen: "SEED_FICTICIO_ETAPA_5",
      actualizadoPorUsuarioId: "uid-administrador",
      actualizadoEn: now
    });
  });
  batch.set(database.collection("jornadaLineas").doc("JORNADA-PRUEBA-INEXISTENTE__LINEA-PRUEBA-ERROR"), {
    id: "JORNADA-PRUEBA-INEXISTENTE__LINEA-PRUEBA-ERROR",
    jornadaId: "JORNADA-PRUEBA-INEXISTENTE",
    lineaId: "LINEA-PRUEBA-ERROR",
    activa: true,
    estadoCentral: "DISPONIBLE",
    reservaActivaId: null,
    version: 0,
    ubicacion: {...visibleLocations[0], linea: "LINEA-PRUEBA-ERROR", nombreVisible: "Línea de jornada inexistente ficticia", orden: 90},
    actualizadaEn: now
  });
  batch.set(database.collection("jornadaLineas").doc(`${UNAUTHORIZED_ACTIVE_JOURNEY_ID}__LINEA-SIN-ACCESO`), {
    id: `${UNAUTHORIZED_ACTIVE_JOURNEY_ID}__LINEA-SIN-ACCESO`,
    jornadaId: UNAUTHORIZED_ACTIVE_JOURNEY_ID,
    lineaId: "LINEA-PRUEBA-SIN-ACCESO",
    activa: true,
    estadoCentral: "DISPONIBLE",
    reservaActivaId: null,
    version: 0,
    ubicacion: {...secondJourneyLocations[0], linea: "LINEA-PRUEBA-SIN-ACCESO", nombreVisible: "Línea activa no autorizada", orden: 90},
    actualizadaEn: now
  });
  batch.set(database.collection("jornadaLineas").doc("JORNADA-PRUEBA-INACTIVA__LINEA-PRUEBA-1"), {
    id: "JORNADA-PRUEBA-INACTIVA__LINEA-PRUEBA-1",
    jornadaId: inactiveJourneyId,
    lineaId: "LINEA-PRUEBA-INACTIVA",
    activa: true,
    estadoCentral: "DISPONIBLE",
    reservaActivaId: null,
    version: 0,
    ubicacion: {...secondJourneyLocations[0], linea: "LINEA-PRUEBA-INACTIVA", nombreVisible: "Línea de jornada inactiva", orden: 91},
    actualizadaEn: now
  });
  batch.set(database.collection("reservas").doc("RESERVA-PRUEBA-PREEXISTENTE"), {
    id: "RESERVA-PRUEBA-PREEXISTENTE",
    jornadaId: ACTIVE_JOURNEY_ID,
    jornadaLineaId: journeyLineId(3),
    usuarioId: "uid-auxiliar-2",
    usuarioNombreVisible: "Auxiliar ficticio 2",
    rolEfectivo: "AUXILIAR",
    dispositivoId: "DISPOSITIVO-PRUEBA-PREEXISTENTE",
    claveIdempotencia: "reserva-preexistente-prueba",
    tokenReservaHash: "d".repeat(64),
    reservadaEn: now,
    estadoReserva: "ACTIVA",
    politicaLiberacion: "MANUAL_SUPERVISOR_MVP"
  });

  await batch.commit();
  return {
    projectId,
    users: demoAccounts.length,
    journeyId: ACTIVE_JOURNEY_ID,
    lines: visibleLocations.length + secondJourneyLocations.length + 5,
    inventories: initialInventories.length
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await seedEmulator();
  console.log(
    `Datos ficticios cargados en ${summary.projectId}: ${summary.users} cuentas técnicas, ${summary.lines} líneas y ${summary.inventories} inventarios.`
  );
}
