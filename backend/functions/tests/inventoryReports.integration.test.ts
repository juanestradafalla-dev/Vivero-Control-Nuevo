import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {getApps as getAdminApps, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import type {
  ListInventoryReportsResult,
  RetryInventoryReportRequest,
  RetryInventoryReportResult
} from "../src/domain/contracts.js";
import {
  ProcessInventoryReportService,
  type InventoryReportDocument
} from "../src/domain/inventoryReports.js";
import {
  FakeInventoryReportDriveGateway,
  InventoryReportDriveConfigurationError,
  type InventoryReportDriveGateway
} from "../src/domain/inventoryReportDrive.js";
import {DEMO_PASSWORD} from "../scripts/demoData.mjs";
import {seedEmulator} from "../scripts/seedEmulator.mjs";

const projectId = "demo-vivero-control-etapa3";
const clientApps: FirebaseApp[] = [];

function createClient(name: string): {auth: Auth; functions: Functions} {
  const app = initializeApp({
    apiKey: "demo-api-key",
    appId: `inventory-report-${name}`,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId
  }, `${name}-${crypto.randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {auth, functions};
}

async function authenticatedClient(email: string, name: string) {
  const client = createClient(name);
  await signInWithEmailAndPassword(client.auth, email, DEMO_PASSWORD);
  return client;
}

function adminDatabase() {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  const app = getAdminApps().find((candidate) => candidate.name === "inventory-report-tests") ??
    initializeAdminApp({projectId}, "inventory-report-tests");
  return getFirestore(app);
}

function reportDocument(
  id: string,
  overrides: Partial<InventoryReportDocument> = {}
): InventoryReportDocument {
  const activatedAt = Timestamp.fromDate(new Date("2026-07-01T12:00:00.000Z"));
  const closedAt = Timestamp.fromDate(new Date("2026-07-18T12:00:00.000Z"));
  return {
    id,
    jornadaId: id,
    jornadaNombreVisible: `Jornada ${id}`,
    creadorJornadaUsuarioId: "uid-supervisor",
    solicitadoPorUsuarioId: "uid-supervisor",
    responsableUsuarioId: "uid-supervisor",
    responsableNombreVisible: "Supervisor ficticio",
    estado: "ERROR_REINTENTABLE",
    mes: 7,
    anio: 2026,
    fuentePlantasMuertas: "CONTEO_FISICO",
    versionJornadaCierre: 2,
    activadaEn: activatedAt,
    cerradaEn: closedAt,
    lineas: [{
      jornadaLineaId: `${id}__LINEA-01`,
      lineaId: "LINEA-01",
      conteoId: "CONTEO-01",
      ubicacion: {
        vivero: "Vivero ficticio",
        modulo: "Modulo 1",
        cama: "Cama A",
        linea: "Linea 01",
        nombreVisible: "Modulo 1 / Cama A / Linea 01",
        orden: 1
      },
      hembras: 7,
      machos: 5,
      patrones: 3,
      total: 15,
      plantasMuertas: 2,
      conteoRecibidoEn: "2026-07-17T12:00:00.000Z",
      observaciones: "Conteo ficticio"
    }],
    intentos: 1,
    procesamientoId: "PROCESAMIENTO-ANTERIOR",
    procesandoEn: Timestamp.fromDate(new Date("2026-07-18T10:00:00.000Z")),
    errorCodigo: "DRIVE_ERROR_TEMPORAL",
    errorMensaje: "Error ficticio sanitizado.",
    creadoEn: closedAt,
    actualizadoEn: closedAt,
    finalizadoEn: closedAt,
    ...overrides
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const details = (error as {details?: unknown}).details;
  return typeof details === "object" && details !== null ? (details as {code?: string}).code : undefined;
}

async function expectRejectCode(promise: Promise<unknown>, expectedCode: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Se esperaba ${expectedCode}`);
  } catch (error) {
    expect(errorCode(error)).toBe(expectedCode);
  }
}

beforeEach(async () => {
  FakeInventoryReportDriveGateway.reset();
  await seedEmulator();
});

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)));
});

describe("Callables de informes de inventario", () => {
  it("lista todos al administrador, solo propios al supervisor y niega al auxiliar", async () => {
    const database = adminDatabase();
    await Promise.all([
      database.collection("informesInventario").doc("JORNADA-INFORME-SUPERVISOR").set(
        reportDocument("JORNADA-INFORME-SUPERVISOR")
      ),
      database.collection("informesInventario").doc("JORNADA-INFORME-ADMIN").set(reportDocument(
        "JORNADA-INFORME-ADMIN", {creadorJornadaUsuarioId: "uid-administrador"}
      ))
    ]);
    const administrator = await authenticatedClient("administrador@prueba.local", "report-list-admin");
    const supervisor = await authenticatedClient("supervisor@prueba.local", "report-list-supervisor");
    const auxiliary = await authenticatedClient("auxiliar1@prueba.local", "report-list-auxiliary");
    const listAdmin = httpsCallable<Record<string, never>, ListInventoryReportsResult>(
      administrator.functions, "listarInformesInventario"
    );
    const listSupervisor = httpsCallable<Record<string, never>, ListInventoryReportsResult>(
      supervisor.functions, "listarInformesInventario"
    );
    const listAuxiliary = httpsCallable<Record<string, never>, ListInventoryReportsResult>(
      auxiliary.functions, "listarInformesInventario"
    );

    expect((await listAdmin({})).data.informes).toHaveLength(2);
    expect((await listSupervisor({})).data.informes.map((report) => report.informeId))
      .toEqual(["JORNADA-INFORME-SUPERVISOR"]);
    await expectRejectCode(listAuxiliary({}), "INVENTORY_REPORT_ACCESS_DENIED");
  });

  it("rechaza un resumen persistido cuyo estado contradice sus campos", async () => {
    const reportId = "JORNADA-INFORME-ESTADO-INCOHERENTE";
    await adminDatabase().collection("informesInventario").doc(reportId).set(reportDocument(reportId, {
      estado: "COMPLETADO"
    }));
    const administrator = await authenticatedClient("administrador@prueba.local", "report-list-invalid-state");
    const listReports = httpsCallable<Record<string, never>, ListInventoryReportsResult>(
      administrator.functions, "listarInformesInventario"
    );

    await expectRejectCode(listReports({}), "INTERNAL_ERROR");
  });

  it("reintenta con permiso, auditoria e idempotencia y niega al supervisor ajeno", async () => {
    const reportId = "JORNADA-INFORME-RETRY";
    const otherReportId = "JORNADA-INFORME-RETRY-OTRO";
    const database = adminDatabase();
    await Promise.all([
      database.collection("informesInventario").doc(reportId).set(reportDocument(reportId)),
      database.collection("informesInventario").doc(otherReportId).set(reportDocument(otherReportId))
    ]);
    const owner = await authenticatedClient("supervisor@prueba.local", "report-retry-owner");
    const other = await authenticatedClient("supervisor2@prueba.local", "report-retry-other");
    const retryOwner = httpsCallable<RetryInventoryReportRequest, RetryInventoryReportResult>(
      owner.functions, "reintentarInformeInventario"
    );
    const retryOther = httpsCallable<RetryInventoryReportRequest, RetryInventoryReportResult>(
      other.functions, "reintentarInformeInventario"
    );
    const request = {jornadaId: reportId, claveIdempotencia: "reintentar-informe-integration-0001"};

    await expectRejectCode(retryOther({
      jornadaId: reportId,
      claveIdempotencia: "reintentar-informe-ajeno-0001"
    }), "INVENTORY_REPORT_ACCESS_DENIED");
    const first = (await retryOwner(request)).data;
    const repeated = (await retryOwner(request)).data;
    expect(repeated).toEqual(first);
    expect(first).toMatchObject({informeId: reportId, estado: "PENDIENTE"});
    await expectRejectCode(retryOwner({
      jornadaId: otherReportId,
      claveIdempotencia: request.claveIdempotencia
    }), "IDEMPOTENCY_CONFLICT");
    expect((await database.collection("auditoria")
      .where("tipo", "==", "INFORME_INVENTARIO_REINTENTADO").get()).size).toBe(1);
  });
});

describe("procesador fake y lease recuperable", () => {
  it("solo una ejecucion reclama un lease vencido y completa un unico archivo", async () => {
    const reportId = "JORNADA-INFORME-LEASE-VENCIDO";
    const database = adminDatabase();
    await database.collection("informesInventario").doc(reportId).set(reportDocument(reportId, {
      estado: "PROCESANDO",
      procesandoEn: Timestamp.fromMillis(Date.now() - (16 * 60 * 1000))
    }));
    const fakeGateway = new FakeInventoryReportDriveGateway();
    let markTemplateStarted!: () => void;
    let releaseTemplate!: () => void;
    const templateStarted = new Promise<void>((resolve) => {
      markTemplateStarted = resolve;
    });
    const templateRelease = new Promise<void>((resolve) => {
      releaseTemplate = resolve;
    });
    const blockingGateway: InventoryReportDriveGateway = {
      getTemplateXlsx: async (input) => {
        markTemplateStarted();
        await templateRelease;
        return fakeGateway.getTemplateXlsx(input);
      },
      upsertReport: (input) => fakeGateway.upsertReport(input)
    };
    const service = new ProcessInventoryReportService(database, async () => blockingGateway);

    const firstExecution = service.execute(reportId);
    await templateStarted;
    await expect(service.execute(reportId)).rejects.toThrow("lease");
    releaseTemplate();
    await firstExecution;
    const stored = await database.collection("informesInventario").doc(reportId).get();
    expect(stored.data()).toMatchObject({
      estado: "COMPLETADO",
      intentos: 2,
      archivoNombre: "INVENTARIO JULIO 2026.xlsx"
    });
    expect(stored.data()?.hashContenido).toMatch(/^[a-f0-9]{64}$/u);
    expect(FakeInventoryReportDriveGateway.inspect({jornadaId: reportId, mes: 7, anio: 2026}))
      .toBeDefined();
  });

  it("mantiene fallando transitoriamente mientras el lease sigue activo", async () => {
    const reportId = "JORNADA-INFORME-LEASE-ACTIVO";
    const database = adminDatabase();
    await database.collection("informesInventario").doc(reportId).set(reportDocument(reportId, {
      estado: "PROCESANDO",
      procesandoEn: Timestamp.now()
    }));
    const service = new ProcessInventoryReportService(
      database,
      async () => new FakeInventoryReportDriveGateway()
    );

    await expect(service.execute(reportId)).rejects.toThrow("lease");
    expect((await database.collection("informesInventario").doc(reportId).get()).data()?.estado)
      .toBe("PROCESANDO");
  });

  it("recupera el mismo archivo si se pierde la confirmacion despues del upload", async () => {
    const reportId = "JORNADA-INFORME-UPLOAD-SIN-CONFIRMACION";
    const database = adminDatabase();
    const staleProcessing = Timestamp.fromMillis(Date.now() - (16 * 60 * 1000));
    await database.collection("informesInventario").doc(reportId).set(reportDocument(reportId, {
      estado: "PROCESANDO",
      intentos: 0,
      procesandoEn: staleProcessing
    }));
    const stableGateway = new FakeInventoryReportDriveGateway();
    let loseConfirmation = true;
    const gateway: InventoryReportDriveGateway = {
      getTemplateXlsx: (input) => stableGateway.getTemplateXlsx(input),
      upsertReport: async (input) => {
        const uploaded = await stableGateway.upsertReport(input);
        if (loseConfirmation) {
          loseConfirmation = false;
          throw new Error("Confirmacion ficticia perdida despues del upload.");
        }
        return uploaded;
      }
    };
    const service = new ProcessInventoryReportService(database, async () => gateway);

    await service.execute(reportId);
    const uploadedWithoutConfirmation = FakeInventoryReportDriveGateway.inspect({
      jornadaId: reportId, mes: 7, anio: 2026
    });
    expect(uploadedWithoutConfirmation).toBeDefined();
    expect((await database.collection("informesInventario").doc(reportId).get()).data()?.estado)
      .toBe("ERROR_REINTENTABLE");

    await database.collection("informesInventario").doc(reportId).update({
      estado: "PROCESANDO",
      procesandoEn: staleProcessing
    });
    await service.execute(reportId);

    const completed = (await database.collection("informesInventario").doc(reportId).get()).data();
    const recoveredFile = FakeInventoryReportDriveGateway.inspect({
      jornadaId: reportId, mes: 7, anio: 2026
    });
    expect(completed).toMatchObject({
      estado: "COMPLETADO",
      intentos: 2,
      archivoDriveId: uploadedWithoutConfirmation?.archivoDriveId
    });
    expect(recoveredFile?.archivoDriveId).toBe(uploadedWithoutConfirmation?.archivoDriveId);
  });

  it("deja la configuracion externa como reintentable y completa al corregirla", async () => {
    const reportId = "JORNADA-INFORME-CONFIG-RECUPERABLE";
    const database = adminDatabase();
    const staleProcessing = Timestamp.fromMillis(Date.now() - (16 * 60 * 1000));
    await database.collection("informesInventario").doc(reportId).set(reportDocument(reportId, {
      estado: "PROCESANDO",
      intentos: 0,
      procesandoEn: staleProcessing
    }));
    let configurationReady = false;
    const service = new ProcessInventoryReportService(database, async () => {
      if (!configurationReady) {
        throw new InventoryReportDriveConfigurationError("Detalle sensible de configuracion ficticia.");
      }
      return new FakeInventoryReportDriveGateway();
    });

    await service.execute(reportId);
    expect((await database.collection("informesInventario").doc(reportId).get()).data()).toMatchObject({
      estado: "ERROR_REINTENTABLE",
      errorCodigo: "DRIVE_CONFIGURACION_REQUERIDA",
      errorMensaje: "La configuracion central de Drive no permite procesar el informe."
    });

    configurationReady = true;
    await database.collection("informesInventario").doc(reportId).update({
      estado: "PROCESANDO",
      procesandoEn: staleProcessing
    });
    await service.execute(reportId);
    expect((await database.collection("informesInventario").doc(reportId).get()).data()).toMatchObject({
      estado: "COMPLETADO",
      intentos: 2,
      archivoNombre: "INVENTARIO JULIO 2026.xlsx"
    });
  });
});
