import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {pathToFileURL} from "node:url";

import {
  ACTIVE_JOURNEY_ID,
  DEMO_PASSWORD,
  DEMO_PROJECT_ID,
  demoAccounts,
  journeyLineId,
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

export async function seedEmulator() {
  const projectId = configureEmulatorEnvironment();
  const app = getApps().find((candidate) => candidate.name === "etapa-3-seed") ??
    initializeApp({projectId}, "etapa-3-seed");
  const auth = getAuth(app);
  const database = getFirestore(app);
  const now = Timestamp.fromDate(new Date("2026-07-13T12:00:00.000Z"));

  for (const account of demoAccounts) await upsertAuthUser(auth, account);
  for (const collectionName of [
    "conteos",
    "inventarioOficialLineas",
    "movimientosInventario",
    "decisionesRevision",
    "reasignacionesCorreccion",
    "liberacionesReserva",
    "reservas",
    "idempotencia",
    "auditoria",
    "jornadaLineas"
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
      entorno: "FICTICIO_EMULADOR",
      creadoEn: now,
      actualizadoEn: now
    });
  }

  const locationDocuments = [
    {id: "VIVERO-PRUEBA", codigo: "VIVERO-PRUEBA", tipo: "VIVERO", nombreVisible: "Vivero ficticio", orden: 1},
    {id: "MODULO-PRUEBA-1", codigo: "MODULO-PRUEBA-1", tipo: "MODULO", ubicacionPadreId: "VIVERO-PRUEBA", nombreVisible: "Módulo ficticio 1", orden: 1},
    {id: "CAMA-PRUEBA-1", codigo: "CAMA-PRUEBA-1", tipo: "CAMA", ubicacionPadreId: "MODULO-PRUEBA-1", nombreVisible: "Cama ficticia 1", orden: 1}
  ];
  for (const location of locationDocuments) {
    batch.set(database.collection("ubicaciones").doc(location.id), {...location, activa: true, creadaEn: now});
  }
  visibleLocations.forEach((location, index) => {
    const lineId = `LINEA-PRUEBA-${index + 1}`;
    batch.set(database.collection("lineas").doc(lineId), {
      id: lineId,
      ubicacionId: "CAMA-PRUEBA-1",
      codigo: lineId,
      nombreVisible: location.nombreVisible,
      orden: location.orden,
      activa: true,
      creadaEn: now,
      actualizadaEn: now
    });
  });

  const journeyRef = database.collection("jornadas").doc(ACTIVE_JOURNEY_ID);
  batch.set(journeyRef, {
    id: ACTIVE_JOURNEY_ID,
    nombreVisible: "Jornada ficticia de la Etapa 3",
    creadaPorUsuarioId: "uid-administrador",
    estadoAdministrativo: "ACTIVA",
    entorno: "FICTICIO_EMULADOR",
    creadaEn: now
  });
  const inactiveJourneyId = "JORNADA-PRUEBA-INACTIVA";
  const inactiveJourneyRef = database.collection("jornadas").doc(inactiveJourneyId);
  batch.set(inactiveJourneyRef, {
    id: inactiveJourneyId,
    nombreVisible: "Jornada inactiva ficticia",
    creadaPorUsuarioId: "uid-administrador",
    estadoAdministrativo: "INACTIVA",
    entorno: "FICTICIO_EMULADOR",
    creadaEn: now
  });

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
  batch.set(database.collection("jornadaLineas").doc("JORNADA-PRUEBA-INACTIVA__LINEA-PRUEBA-1"), {
    id: "JORNADA-PRUEBA-INACTIVA__LINEA-PRUEBA-1",
    jornadaId: inactiveJourneyId,
    lineaId: "LINEA-PRUEBA-1",
    activa: true,
    estadoCentral: "DISPONIBLE",
    reservaActivaId: null,
    version: 0,
    ubicacion: visibleLocations[0],
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
    lines: visibleLocations.length,
    inventories: initialInventories.length
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await seedEmulator();
  console.log(
    `Datos ficticios cargados en ${summary.projectId}: ${summary.users} cuentas técnicas, ${summary.lines} líneas y ${summary.inventories} inventarios.`
  );
}
