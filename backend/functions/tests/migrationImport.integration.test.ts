import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getAuth as getAdminAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ListMigrationImportsResult,
  MigrationCatalogPackageV1,
  MigrationImportResult,
  RevertMigrationImportResult
} from "../src/domain/contracts.js";
import {deterministicMigrationPackageHash} from "../src/domain/migrationPreflight.js";
import {DEMO_PASSWORD} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const apps: FirebaseApp[] = [];

interface Client { readonly auth: Auth; readonly functions: Functions; }

function adminApp() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  return getAdminApps().find((candidate) => candidate.name === "migration-import-tests") ??
    initializeAdminApp({projectId}, "migration-import-tests");
}

function database() {
  return getFirestore(adminApp());
}

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key", appId: `migration-import-${name}`,
    authDomain: `${projectId}.firebaseapp.com`, projectId
  }, `${name}-${crypto.randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {auth, functions};
}

async function authenticatedClient(email: string, name: string): Promise<Client> {
  const client = createClient(name);
  await signInWithEmailAndPassword(client.auth, email, DEMO_PASSWORD);
  return client;
}

async function createSecondAdmin(): Promise<Client> {
  await getAdminAuth(adminApp()).createUser({
    uid: "uid-administrador-2", email: "administrador2@prueba.local", password: DEMO_PASSWORD
  });
  await database().collection("usuarios").doc("uid-administrador-2").set({
    id: "uid-administrador-2", nombreVisible: "Administrador ficticio dos",
    roles: ["ADMINISTRADOR"], activo: true, version: 1
  });
  return authenticatedClient("administrador2@prueba.local", "admin-two");
}

function validPackage(suffix = "A"): MigrationCatalogPackageV1 {
  return {
    formato: "paquete-migracion-catalogo-v1",
    metadatos: {
      nombrePaquete: `PRUEBA FICTICIA ETAPA 19 ${suffix}`,
      creadoEn: "2026-07-16T12:00:00.000Z",
      referenciaFuente: "Acta general de migración ETAPA 20"
    },
    ubicaciones: [
      {
        claveExterna: `UB-MIG19-RAIZ-${suffix}`, ubicacionPadreClaveExterna: null,
        codigo: `MIG19-RAIZ-${suffix}`, tipo: "TIPO-PRUEBA", nombreVisible: `PRUEBA raíz ${suffix}`,
        orden: 1, activa: true
      },
      {
        claveExterna: `UB-MIG19-HIJA-${suffix}`, ubicacionPadreClaveExterna: `UB-MIG19-RAIZ-${suffix}`,
        codigo: `MIG19-HIJA-${suffix}`, tipo: "TIPO-PRUEBA", nombreVisible: `PRUEBA hija ${suffix}`,
        orden: 1, activa: true
      }
    ],
    lineas: [{
      claveExterna: `LINEA-MIG19-${suffix}`, ubicacionClaveExterna: `UB-MIG19-HIJA-${suffix}`,
      codigo: `MIG19-LINEA-${suffix}`, nombreVisible: `PRUEBA línea ${suffix}`, orden: 1, activa: true
    }],
    inventariosIniciales: [{
      lineaClaveExterna: `LINEA-MIG19-${suffix}`, hembras: 12, machos: 7, patrones: 3,
      referenciaFuente: "Planilla controlada de inventario ETAPA 20"
    }]
  };
}

async function importPackage(
  functions: Functions,
  packageData: MigrationCatalogPackageV1,
  key: string,
  expectedHash = deterministicMigrationPackageHash(packageData),
  confirmationHash = expectedHash
): Promise<MigrationImportResult> {
  const callable = httpsCallable<unknown, MigrationImportResult>(functions, "importarPaqueteMigracion");
  return (await callable({
    paquete: packageData, hashEsperado: expectedHash, confirmacionHash: confirmationHash,
    claveIdempotencia: key
  })).data;
}

async function listImports(functions: Functions): Promise<ListMigrationImportsResult> {
  return (await httpsCallable<unknown, ListMigrationImportsResult>(
    functions, "listarImportacionesMigracion"
  )({})).data;
}

async function revertImport(
  functions: Functions,
  importId: string,
  version: number,
  key: string,
  reason = "PRUEBA reversión segura"
): Promise<RevertMigrationImportResult> {
  return (await httpsCallable<unknown, RevertMigrationImportResult>(
    functions, "revertirImportacionMigracion"
  )({importacionId: importId, versionEsperada: version, motivo: reason, claveIdempotencia: key})).data;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const details = (error as {details?: unknown}).details;
  return typeof details === "object" && details !== null ? (details as {code?: string}).code : undefined;
}

async function expectCode(promise: Promise<unknown>, expected: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Se esperaba ${expected}`);
  } catch (error) {
    expect(errorCode(error)).toBe(expected);
  }
}

const reversalBlockers: ReadonlyArray<[
  string,
  (lineId: string, locationId: string) => Promise<unknown>
]> = [
  ["edición", async (lineId) => database().collection("lineas").doc(lineId).update({version: 2})],
  ["borrador", async (lineId) => database().collection("seleccionesLineasJornada").doc("BORRADOR-MIG19").set({lineaIds: [lineId]})],
  ["jornada", async (lineId) => database().collection("jornadaLineas").doc("JL-MIG19").set({lineaId: lineId})],
  ["reserva", async (lineId) => database().collection("reservas").doc("R-MIG19").set({lineaId: lineId})],
  ["conteo", async (lineId) => database().collection("conteos").doc("C-MIG19").set({lineaId: lineId})],
  ["decisión", async (lineId) => database().collection("decisionesRevision").doc("D-MIG19").set({lineaId: lineId})],
  ["corrección", async (lineId) => database().collection("reasignacionesCorreccion").doc("RC-MIG19").set({lineaId: lineId})],
  ["movimiento", async (lineId) => database().collection("movimientosInventario").doc("M-MIG19").set({lineaId: lineId})],
  ["hijo externo", async (_lineId, locationId) => database().collection("ubicaciones").doc("HIJO-EXTERNO-MIG19").set({ubicacionPadreId: locationId})]
];

beforeEach(async () => seedEmulator());
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
  await Promise.all([
    getAdminAuth(adminApp()).deleteUser("uid-administrador-2").catch(() => undefined),
    database().collection("usuarios").doc("uid-administrador-2").delete()
  ]);
});

describe("importación y reversión controladas mediante emuladores reales", () => {
  it("importa jerarquía, bloqueos e inventario con IDs centrales y sin movimientos", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "valid-import");
    const result = await importPackage(admin.functions, validPackage(), "IMPORTAR-MIG19-VALIDA");
    expect(result).toMatchObject({
      estado: "APLICADA", version: 1,
      cantidades: {ubicaciones: 2, lineas: 1, inventariosIniciales: 1}, escriturasRealizadas: 12
    });
    const locationMap = new Map(result.mapa.ubicaciones.map((entry) => [entry.claveExterna, entry.idInterno]));
    const lineId = result.mapa.lineas[0]!.idInterno;
    const child = await database().collection("ubicaciones").doc(locationMap.get("UB-MIG19-HIJA-A")!).get();
    expect(child.data()).toMatchObject({ubicacionPadreId: locationMap.get("UB-MIG19-RAIZ-A"), version: 1});
    expect((await database().collection("lineas").doc(lineId).get()).data()).toMatchObject({
      ubicacionId: locationMap.get("UB-MIG19-HIJA-A"), creadaPorImportacionId: result.importacionId
    });
    expect((await database().collection("inventarioOficialLineas").doc(lineId).get()).data()).toMatchObject({
      hembras: 12, machos: 7, patrones: 3, total: 22, version: 1,
      origen: "MIGRACION_CONTROLADA"
    });
    expect((await database().collection("movimientosInventario").where("lineaId", "==", lineId).get()).empty).toBe(true);
    const stored = (await database().collection("importacionesMigracion").doc(result.importacionId).get()).data()!;
    expect(stored.paquete).toBeUndefined();
    expect(stored.metadatos).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain("Planilla controlada");
  });

  it("importa y revierte una línea inactiva sin inventario inicial inexistente", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "inactive-without-inventory");
    const base = validPackage("INACTIVA");
    const packageData: MigrationCatalogPackageV1 = {
      ...base,
      lineas: base.lineas.map((line) => ({...line, activa: false})),
      inventariosIniciales: []
    };
    const imported = await importPackage(admin.functions, packageData, "IMPORTAR-MIG19-INACTIVA");
    expect(imported).toMatchObject({escriturasRealizadas: 10, cantidades: {inventariosIniciales: 0}});
    const reverted = await revertImport(admin.functions, imported.importacionId, 1, "REVERTIR-MIG19-INACTIVA");
    expect(reverted.documentosEliminados).toBe(6);
  });

  it("rechaza hash esperado o confirmación incorrectos con cero escrituras", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "bad-hash");
    const packageData = validPackage();
    await expectCode(importPackage(admin.functions, packageData, "IMPORTAR-MIG19-HASH", "a".repeat(64)),
      "MIGRATION_HASH_MISMATCH");
    await expectCode(importPackage(
      admin.functions, packageData, "IMPORTAR-MIG19-CONFIRMACION",
      deterministicMigrationPackageHash(packageData), "b".repeat(64)
    ), "MIGRATION_HASH_MISMATCH");
    expect((await database().collection("importacionesMigracion").get()).empty).toBe(true);
  });

  it("revalida contra Firestore y rechaza un paquete que dejó de ser apto", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "stale-package");
    await database().collection("ubicaciones").doc("CONFLICTO-MIG19").set({
      id: "CONFLICTO-MIG19", codigo: "MIG19-RAIZ-A", codigoNormalizado: "MIG19-RAIZ-A",
      tipo: "TIPO-PRUEBA", ubicacionPadreId: null, nombreVisible: "PRUEBA conflicto",
      orden: 1, activa: true, version: 1
    });
    await expectCode(importPackage(admin.functions, validPackage(), "IMPORTAR-MIG19-OBSOLETA"),
      "MIGRATION_PACKAGE_NOT_ELIGIBLE");
    expect((await database().collection("importacionesMigracion").get()).empty).toBe(true);
  });

  it("rechaza paquetes que proyectan más de 450 escrituras", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "too-large");
    const base = validPackage("LIMITE");
    const packageData: MigrationCatalogPackageV1 = {
      ...base,
      ubicaciones: Array.from({length: 224}, (_, index) => ({
        claveExterna: `UB-LIMITE-${index}`, ubicacionPadreClaveExterna: null,
        codigo: `MIG19-LIMITE-${index}`, tipo: "TIPO-PRUEBA", nombreVisible: `PRUEBA límite ${index}`,
        orden: index, activa: false
      })),
      lineas: [], inventariosIniciales: []
    };
    await expectCode(importPackage(admin.functions, packageData, "IMPORTAR-MIG19-LIMITE"),
      "MIGRATION_IMPORT_LIMIT_EXCEEDED");
    expect((await database().collection("importacionesMigracion").get()).empty).toBe(true);
  });

  it("recupera el mismo resultado, detecta conflicto y bloquea el mismo hash con otra clave", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "idempotency");
    const packageData = validPackage();
    const first = await importPackage(admin.functions, packageData, "IMPORTAR-MIG19-IDEMPOTENTE");
    expect(await importPackage(admin.functions, packageData, "IMPORTAR-MIG19-IDEMPOTENTE")).toEqual(first);
    await expectCode(importPackage(admin.functions, validPackage("OTRO"), "IMPORTAR-MIG19-IDEMPOTENTE"),
      "IDEMPOTENCY_CONFLICT");
    await expectCode(importPackage(admin.functions, packageData, "IMPORTAR-MIG19-OTRA-CLAVE"),
      "MIGRATION_HASH_ALREADY_IMPORTED");
    expect((await database().collection("importacionesMigracion").get()).size).toBe(1);
  });

  it("da exactamente un ganador a dos administradores concurrentes", async () => {
    const firstAdmin = await authenticatedClient("administrador@prueba.local", "concurrent-one");
    const secondAdmin = await createSecondAdmin();
    const settled = await Promise.allSettled([
      importPackage(firstAdmin.functions, validPackage(), "IMPORTAR-MIG19-CONCURRENCIA-1"),
      importPackage(secondAdmin.functions, validPackage(), "IMPORTAR-MIG19-CONCURRENCIA-2")
    ]);
    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    expect((await database().collection("importacionesMigracion").get()).size).toBe(1);
  });

  it("revierte antes de uso, conserva registro, hash y auditoría", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "valid-revert");
    const imported = await importPackage(admin.functions, validPackage(), "IMPORTAR-MIG19-PARA-REVERTIR");
    const reverted = await revertImport(admin.functions, imported.importacionId, 1, "REVERTIR-MIG19-VALIDA");
    expect(reverted).toMatchObject({estado: "REVERTIDA", version: 2, documentosEliminados: 8});
    for (const entry of imported.mapa.ubicaciones) {
      expect((await database().collection("ubicaciones").doc(entry.idInterno).get()).exists).toBe(false);
      expect((await database().collection("bloqueosCodigosCatalogo").doc(entry.bloqueoCodigoId).get()).exists).toBe(false);
    }
    for (const entry of imported.mapa.lineas) {
      expect((await database().collection("lineas").doc(entry.idInterno).get()).exists).toBe(false);
      expect((await database().collection("bloqueosCodigosCatalogo").doc(entry.bloqueoCodigoId).get()).exists).toBe(false);
    }
    expect((await database().collection("inventarioOficialLineas").doc(imported.mapa.lineas[0]!.idInterno).get()).exists)
      .toBe(false);
    const historical = await database().collection("importacionesMigracion").doc(imported.importacionId).get();
    expect(historical.data()).toMatchObject({estado: "REVERTIDA", version: 2, mapa: imported.mapa});
    expect((await database().collection("bloqueosHashesMigracion").get()).size).toBe(1);
    expect((await database().collection("auditoria").where("recursoId", "==", imported.importacionId).get()).size).toBe(2);
    expect((await listImports(admin.functions)).importaciones[0]).toMatchObject({estado: "REVERTIDA", reversionElegible: false});
  });

  it("rechaza reversión sin motivo y conserva íntegra la importación", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "empty-reason");
    const imported = await importPackage(admin.functions, validPackage(), "IMPORTAR-MIG19-SIN-MOTIVO");
    await expectCode(revertImport(
      admin.functions, imported.importacionId, 1, "REVERTIR-MIG19-SIN-MOTIVO", "   "
    ), "MIGRATION_REVERSAL_REASON_REQUIRED");
    expect((await database().collection("importacionesMigracion").doc(imported.importacionId).get()).data()?.estado)
      .toBe("APLICADA");
  });

  it.each(reversalBlockers)("rechaza reversión por %s sin borrar parcialmente", async (_case, mutate) => {
    const caseKey = _case.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "-");
    const admin = await authenticatedClient("administrador@prueba.local", `blocked-${_case}`);
    const imported = await importPackage(admin.functions, validPackage(), `IMPORTAR-MIG19-BLOQUEO-${caseKey}`);
    const lineId = imported.mapa.lineas[0]!.idInterno;
    await mutate(lineId, imported.mapa.ubicaciones[1]!.idInterno);
    await expectCode(revertImport(
      admin.functions, imported.importacionId, 1, `REVERTIR-MIG19-BLOQUEO-${caseKey}`
    ), "MIGRATION_REVERSAL_BLOCKED");
    expect((await database().collection("importacionesMigracion").doc(imported.importacionId).get()).data()?.estado)
      .toBe("APLICADA");
    expect((await database().collection("lineas").doc(lineId).get()).exists).toBe(true);
  });

  it("hace idempotente la reversión y da un solo ganador concurrente", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "revert-concurrency");
    const imported = await importPackage(admin.functions, validPackage(), "IMPORTAR-MIG19-REV-CONC");
    const keys = ["REVERTIR-MIG19-CONC-1", "REVERTIR-MIG19-CONC-2"];
    const settled = await Promise.allSettled(keys.map((key) =>
      revertImport(admin.functions, imported.importacionId, 1, key)));
    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    const winnerIndex = settled.findIndex((entry) => entry.status === "fulfilled");
    const winner = (settled[winnerIndex] as PromiseFulfilledResult<RevertMigrationImportResult>).value;
    expect(await revertImport(admin.functions, imported.importacionId, 1, keys[winnerIndex]!)).toEqual(winner);
  });

  it("rechaza supervisor y auxiliar en importar, listar y revertir", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor");
    const assistant = await authenticatedClient("auxiliar1@prueba.local", "assistant");
    await expectCode(importPackage(supervisor.functions, validPackage(), "IMPORTAR-MIG19-SUPERVISOR"),
      "PERMISSION_DENIED");
    await expectCode(listImports(assistant.functions), "PERMISSION_DENIED");
    await expectCode(revertImport(supervisor.functions, "IMPORTACION-INEXISTENTE", 1, "REVERTIR-MIG19-SUPERVISOR"),
      "PERMISSION_DENIED");
  });
});
