import {readFile} from "node:fs/promises";
import {join} from "node:path";

import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {type CollectionReference, getFirestore} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {MigrationCatalogPackageV1, MigrationValidationResult} from "../src/domain/contracts.js";
import {migrationPackageExceedsSizeLimit} from "../src/domain/migrationPreflight.js";
import {DEMO_PASSWORD} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const apps: FirebaseApp[] = [];

interface Client { readonly auth: Auth; readonly functions: Functions; }

function createClient(name: string): Client {
  const app = initializeApp({
    apiKey: "demo-api-key", appId: `migration-preflight-${name}`,
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

function database() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getAdminApps().find((candidate) => candidate.name === "migration-preflight-tests") ??
    initializeAdminApp({projectId}, "migration-preflight-tests");
  return getFirestore(app);
}

function validPackage(): MigrationCatalogPackageV1 {
  return {
    formato: "paquete-migracion-catalogo-v1",
    metadatos: {
      nombrePaquete: "PRUEBA - paquete ficticio integrado",
      creadoEn: "2026-07-16T12:00:00.000Z",
      referenciaFuente: "PRUEBA FICTICIA - integración ETAPA 18"
    },
    ubicaciones: [
      {
        claveExterna: "UB-MIG-PRUEBA-RAIZ", ubicacionPadreClaveExterna: null,
        codigo: "MIG-PRUEBA-RAIZ", tipo: "TIPO-PRUEBA", nombreVisible: "Raíz ficticia nueva",
        orden: 1, activa: true
      },
      {
        claveExterna: "UB-MIG-PRUEBA-HIJA", ubicacionPadreClaveExterna: "UB-MIG-PRUEBA-RAIZ",
        codigo: "MIG-PRUEBA-HIJA", tipo: "TIPO-PRUEBA", nombreVisible: "Hija ficticia nueva",
        orden: 1, activa: true
      }
    ],
    lineas: [{
      claveExterna: "LINEA-MIG-PRUEBA-1", ubicacionClaveExterna: "UB-MIG-PRUEBA-HIJA",
      codigo: "MIG-PRUEBA-LINEA-1", nombreVisible: "Línea ficticia nueva", orden: 1, activa: true
    }],
    inventariosIniciales: [{
      lineaClaveExterna: "LINEA-MIG-PRUEBA-1", hembras: 12, machos: 7, patrones: 3,
      referenciaFuente: "PRUEBA FICTICIA - planilla simulada"
    }]
  };
}

function transportPackage(): Record<string, unknown> {
  const value = validPackage() as unknown as Record<string, unknown>;
  const inventories = value.inventariosIniciales as Array<Record<string, unknown>>;
  inventories.forEach((inventory) => delete inventory.total);
  return value;
}

async function validate(functions: Functions, payload: unknown): Promise<MigrationValidationResult> {
  const callable = httpsCallable<unknown, MigrationValidationResult>(functions, "validarPaqueteMigracion");
  return (await callable(payload)).data;
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

async function snapshotFirestore(): Promise<string> {
  const entries: Array<{path: string; data: unknown}> = [];
  const visit = async (collection: CollectionReference): Promise<void> => {
    const documents = await collection.get();
    for (const document of documents.docs) {
      entries.push({path: document.ref.path, data: document.data()});
      const children = await document.ref.listCollections();
      for (const child of children) await visit(child);
    }
  };
  const collections = await database().listCollections();
  for (const collection of collections) await visit(collection);
  return JSON.stringify(entries.sort((left, right) => left.path.localeCompare(right.path)));
}

function codes(result: MigrationValidationResult): string[] {
  return result.erroresBloqueantes.map((issue) => issue.codigo);
}

beforeEach(async () => seedEmulator());
afterEach(async () => Promise.all(apps.splice(0).map((app) => deleteApp(app))));

describe("validarPaqueteMigracion mediante emuladores reales", () => {
  it("acepta un paquete ficticio válido, calcula el total y no escribe nada", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "valid");
    const before = await snapshotFirestore();
    const result = await validate(admin.functions, transportPackage());
    const after = await snapshotFirestore();
    expect(result).toMatchObject({
      formato: "paquete-migracion-catalogo-v1", cantidades: {ubicaciones: 2, lineas: 1, inventariosIniciales: 1},
      aptoParaImportar: true, soloValidacion: true
    });
    expect(result.hashPaquete).toMatch(/^[a-f0-9]{64}$/);
    expect(result.erroresBloqueantes).toEqual([]);
    expect(after).toBe(before);
  });

  it("rechaza versión desconocida, campos adicionales, total cliente y tamaño excesivo", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "strict");
    const unknown = transportPackage();
    unknown.formato = "paquete-migracion-catalogo-v99";
    expect(codes(await validate(admin.functions, unknown))).toContain("FORMATO_DESCONOCIDO");

    const extras = transportPackage();
    extras.usuarioId = "uid-prohibido";
    (extras.inventariosIniciales as Array<Record<string, unknown>>)[0]!.total = 22;
    expect(codes(await validate(admin.functions, extras)).filter((code) => code === "CAMPO_ADICIONAL")).toHaveLength(2);

    const large = transportPackage();
    (large.metadatos as Record<string, unknown>).nombrePaquete = `PRUEBA-${"X".repeat(520_000)}`;
    expect(migrationPackageExceedsSizeLimit(large)).toBe(true);
  });

  it("detecta claves, códigos e inventarios duplicados", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "duplicates");
    const payload = transportPackage();
    const locations = payload.ubicaciones as Array<Record<string, unknown>>;
    locations.push({...locations[1]!});
    const lines = payload.lineas as Array<Record<string, unknown>>;
    lines.push({...lines[0]!, claveExterna: "LINEA-MIG-PRUEBA-2"});
    const inventories = payload.inventariosIniciales as Array<Record<string, unknown>>;
    inventories.push({...inventories[0]!});
    const resultCodes = codes(await validate(admin.functions, payload));
    expect(resultCodes).toEqual(expect.arrayContaining([
      "CLAVE_EXTERNA_DUPLICADA", "CODIGO_DUPLICADO", "INVENTARIO_DUPLICADO"
    ]));
  });

  it("detecta padre inexistente, ciclos y línea sin ubicación", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "relations");
    const missing = transportPackage();
    (missing.ubicaciones as Array<Record<string, unknown>>)[1]!.ubicacionPadreClaveExterna = "UB-NO-EXISTE";
    (missing.lineas as Array<Record<string, unknown>>)[0]!.ubicacionClaveExterna = "UB-NO-EXISTE";
    expect(codes(await validate(admin.functions, missing))).toEqual(expect.arrayContaining([
      "REFERENCIA_PADRE_INEXISTENTE", "UBICACION_LINEA_INEXISTENTE"
    ]));

    const cycle = transportPackage();
    (cycle.ubicaciones as Array<Record<string, unknown>>)[0]!.ubicacionPadreClaveExterna = "UB-MIG-PRUEBA-HIJA";
    expect(codes(await validate(admin.functions, cycle))).toContain("CICLO_UBICACIONES");
  });

  it("detecta inventario sin línea y línea activa sin inventario", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "inventory-links");
    const orphan = transportPackage();
    (orphan.inventariosIniciales as Array<Record<string, unknown>>)[0]!.lineaClaveExterna = "LINEA-NO-EXISTE";
    const orphanCodes = codes(await validate(admin.functions, orphan));
    expect(orphanCodes).toEqual(expect.arrayContaining([
      "LINEA_INVENTARIO_INEXISTENTE", "LINEA_ACTIVA_SIN_INVENTARIO"
    ]));

    const missing = transportPackage();
    missing.inventariosIniciales = [];
    expect(codes(await validate(admin.functions, missing))).toContain("LINEA_ACTIVA_SIN_INVENTARIO");
  });

  it.each([
    ["negativo", {hembras: -1}, "CANTIDAD_INVALIDA"],
    ["decimal", {machos: 1.5}, "CANTIDAD_INVALIDA"],
    ["desbordamiento", {hembras: Number.MAX_SAFE_INTEGER, machos: 1}, "DESBORDAMIENTO_TOTAL"],
    ["cero", {hembras: 0, machos: 0, patrones: 0}, "TOTAL_CERO"]
  ])("rechaza cantidades %s", async (_name, changes, expected) => {
    const admin = await authenticatedClient("administrador@prueba.local", `quantity-${_name}`);
    const payload = transportPackage();
    Object.assign((payload.inventariosIniciales as Array<Record<string, unknown>>)[0]!, changes);
    expect(codes(await validate(admin.functions, payload))).toContain(expected);
  });

  it("reporta catálogo, inventario y ocupación actuales como conflictos", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "current-conflicts");
    const payload = transportPackage();
    payload.ubicaciones = [
      {claveExterna: "EXT-VIVERO", ubicacionPadreClaveExterna: null, codigo: "VIVERO-PRUEBA", tipo: "VIVERO", nombreVisible: "Vivero actual", orden: 1, activa: true},
      {claveExterna: "EXT-MODULO", ubicacionPadreClaveExterna: "EXT-VIVERO", codigo: "MODULO-PRUEBA-1", tipo: "MODULO", nombreVisible: "Módulo actual", orden: 1, activa: true},
      {claveExterna: "EXT-CAMA", ubicacionPadreClaveExterna: "EXT-MODULO", codigo: "CAMA-PRUEBA-1", tipo: "CAMA", nombreVisible: "Cama actual", orden: 1, activa: true}
    ];
    payload.lineas = [{
      claveExterna: "EXT-LINEA-1", ubicacionClaveExterna: "EXT-CAMA", codigo: "LINEA-PRUEBA-1",
      nombreVisible: "Línea actual", orden: 1, activa: true
    }];
    payload.inventariosIniciales = [{
      lineaClaveExterna: "EXT-LINEA-1", hembras: 1, machos: 1, patrones: 1,
      referenciaFuente: "PRUEBA FICTICIA conflicto actual"
    }];
    const result = await validate(admin.functions, payload);
    expect(codes(result)).toEqual(expect.arrayContaining(["INVENTARIO_EXISTENTE", "CONFLICTO_OPERATIVO"]));
    expect(result.resumenConflictos.codigosExistentes).toBeGreaterThan(0);
    expect(result.resumenConflictos.lineasConInventarioActual).toBe(1);
    expect(result.resumenConflictos.conflictosOperativos).toBe(1);
  });

  it("detecta una clave externa incompatible con el catálogo", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "external-key-conflict");
    await database().collection("ubicaciones").doc("VIVERO-PRUEBA").update({claveExterna: "UB-MIG-PRUEBA-RAIZ"});
    const result = await validate(admin.functions, transportPackage());
    expect(codes(result)).toContain("CLAVE_INCOMPATIBLE");
    expect(result.resumenConflictos.clavesIncompatibles).toBe(1);
  });

  it("calcula el mismo hash con orden y representación normalizada equivalentes", async () => {
    const admin = await authenticatedClient("administrador@prueba.local", "hash");
    const first = transportPackage();
    const second = transportPackage();
    second.ubicaciones = [...(second.ubicaciones as unknown[])].reverse();
    ((second.lineas as Array<Record<string, unknown>>)[0]!).codigo = "  mig prueba linea 1  ";
    const [left, right] = await Promise.all([
      validate(admin.functions, first), validate(admin.functions, second)
    ]);
    expect(right.hashPaquete).toBe(left.hashPaquete);
  });

  it("rechaza supervisor y auxiliar", async () => {
    const supervisor = await authenticatedClient("supervisor@prueba.local", "supervisor");
    const assistant = await authenticatedClient("auxiliar1@prueba.local", "assistant");
    await expectCode(validate(supervisor.functions, transportPackage()), "PERMISSION_DENIED");
    await expectCode(validate(assistant.functions, transportPackage()), "PERMISSION_DENIED");
  });

  it("rechaza secretos o datos privados y la plantilla versionada no los contiene", async () => {
    const template = await readFile(
      join(process.cwd(), "../../data/templates/paquete-migracion-catalogo-v1.example.json"), "utf8"
    );
    expect(template).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    expect(template).not.toMatch(/PRIVATE KEY|PASSWORD|TOKEN|SECRET|AIza/i);

    const admin = await authenticatedClient("administrador@prueba.local", "private-data");
    const payload = transportPackage();
    (payload.metadatos as Record<string, unknown>).referenciaFuente = "PRUEBA con contacto persona@empresa.test";
    (payload.lineas as Array<Record<string, unknown>>)[0]!.claveExterna = "TOKEN-SECRETO-PROHIBIDO";
    const result = await validate(admin.functions, payload);
    expect(codes(result)).toContain("SECRETO_O_DATO_PRIVADO");
    expect([...result.erroresBloqueantes, ...result.advertencias].every((issue) => issue.claveExterna === null)).toBe(true);
  });
});
