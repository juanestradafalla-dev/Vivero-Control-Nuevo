import {beforeEach, describe, expect, it, vi} from "vitest";

import type {FirebaseRuntimeConfig} from "../core/firebaseConfig";

const firebase = vi.hoisted(() => ({
  app: {name: "vivero-maestro-prueba"},
  auth: {},
  firestore: {},
  functions: {},
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  getFunctions: vi.fn(),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock("firebase/app", () => ({getApps: firebase.getApps, initializeApp: firebase.initializeApp}));
vi.mock("firebase/auth", () => ({
  connectAuthEmulator: firebase.connectAuthEmulator,
  getAuth: firebase.getAuth,
  signInWithEmailAndPassword: vi.fn(),
}));
vi.mock("firebase/functions", () => ({
  connectFunctionsEmulator: firebase.connectFunctionsEmulator,
  getFunctions: firebase.getFunctions,
  httpsCallable: firebase.httpsCallable,
}));
vi.mock("firebase/firestore", () => ({
  Timestamp: class Timestamp {},
  collection: vi.fn(),
  connectFirestoreEmulator: firebase.connectFirestoreEmulator,
  doc: vi.fn(),
  getDoc: vi.fn(),
  getFirestore: firebase.getFirestore,
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import {FirebaseMonitorRepository} from "./FirebaseMonitorRepository";

const config = (environment: "EMULATOR" | "PRODUCTION"): FirebaseRuntimeConfig => ({
  environment,
  projectId: environment === "EMULATOR" ? "demo-vivero-control-etapa3" : "viverocontrol-3f83f",
  apiKey: "valor-ficticio",
  appId: "app-ficticia",
  authDomain: "dominio-ficticio",
  useEmulators: environment === "EMULATOR",
  emulatorHost: "127.0.0.1",
});

beforeEach(() => {
  vi.clearAllMocks();
  firebase.getApps.mockReturnValue([]);
  firebase.initializeApp.mockReturnValue(firebase.app);
  firebase.getAuth.mockReturnValue(firebase.auth);
  firebase.getFirestore.mockReturnValue(firebase.firestore);
  firebase.getFunctions.mockReturnValue(firebase.functions);
});

describe("conexión Firebase de Maestro", () => {
  it("conecta los tres emuladores en modo emulator", () => {
    FirebaseMonitorRepository.create(config("EMULATOR"));

    expect(firebase.connectAuthEmulator).toHaveBeenCalledOnce();
    expect(firebase.connectFirestoreEmulator).toHaveBeenCalledOnce();
    expect(firebase.connectFunctionsEmulator).toHaveBeenCalledOnce();
  });

  it("no conecta ningún emulador en production y conserva us-central1", () => {
    const repository = FirebaseMonitorRepository.create(config("PRODUCTION"));

    expect(repository.environment).toBe("PRODUCTION");
    expect(firebase.connectAuthEmulator).not.toHaveBeenCalled();
    expect(firebase.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(firebase.connectFunctionsEmulator).not.toHaveBeenCalled();
    expect(firebase.getFunctions).toHaveBeenCalledWith(firebase.app, "us-central1");
  });

  it("envía la configuración del informe al crear el borrador y la conserva en el resultado", async () => {
    const configuration = {
      habilitado: true,
      mes: 7,
      anio: 2026,
      fuentePlantasMuertas: "CONTEO_FISICO" as const,
    };
    const invoke = vi.fn().mockResolvedValue({
      data: {
        jornadaId: "JORNADA-BORRADOR-INFORME-1",
        nombreVisible: "Jornada con informe",
        estado: "BORRADOR",
        creadorUsuarioId: "uid-supervisor",
        creadorNombreVisible: "Supervisor Pruebas",
        version: 1,
        lineaIds: [],
        creadaEn: "2026-07-18T12:00:00.000Z",
        actualizadaEn: "2026-07-18T12:00:00.000Z",
        configuracionInformeInventario: configuration,
      },
    });
    firebase.httpsCallable.mockReturnValue(invoke);
    const repository = FirebaseMonitorRepository.create(config("EMULATOR"));

    await expect(repository.createDraftJourney(
      "Jornada con informe",
      configuration,
      "idempotencia-informe-0001",
    )).resolves.toMatchObject({configuracionInformeInventario: configuration});
    expect(firebase.httpsCallable).toHaveBeenCalledWith(firebase.functions, "crearJornadaBorrador");
    expect(invoke).toHaveBeenCalledWith({
      nombreVisible: "Jornada con informe",
      configuracionInformeInventario: configuration,
      claveIdempotencia: "idempotencia-informe-0001",
    });
  });

  it("lista informes y solicita un reintento con el contrato central", async () => {
    const listInvoke = vi.fn().mockResolvedValue({
      data: {
        informes: [{
          informeId: "INFORME-1",
          jornadaId: "JORNADA-1",
          jornadaNombreVisible: "Jornada cerrada",
          mes: 7,
          anio: 2026,
          fuentePlantasMuertas: "DESCARTES_APROBADOS",
          estado: "ERROR_REINTENTABLE",
          intentos: 1,
          errorCodigo: "DRIVE_TEMPORAL",
          errorMensaje: "Error temporal de prueba",
          creadoEn: "2026-07-18T12:00:00.000Z",
          actualizadoEn: "2026-07-18T12:01:00.000Z",
        }],
      },
    });
    const retryInvoke = vi.fn().mockResolvedValue({data: {}});
    firebase.httpsCallable.mockImplementation((_functions: unknown, name: string) =>
      name === "listarInformesInventario" ? listInvoke : retryInvoke
    );
    const repository = FirebaseMonitorRepository.create(config("PRODUCTION"));

    await expect(repository.listInventoryReports()).resolves.toMatchObject({
      informes: [{estado: "ERROR_REINTENTABLE", fuentePlantasMuertas: "DESCARTES_APROBADOS"}],
    });
    await repository.retryInventoryReport({
      jornadaId: "JORNADA-1",
      claveIdempotencia: "idempotencia-reintento-0001",
    });
    expect(listInvoke).toHaveBeenCalledWith({});
    expect(retryInvoke).toHaveBeenCalledWith({
      jornadaId: "JORNADA-1",
      claveIdempotencia: "idempotencia-reintento-0001",
    });
  });

  it("convierte cierres administrables y reanuda solo por Callable", async () => {
    const listInvoke = vi.fn().mockResolvedValue({
      data: {
        jornadas: [],
        jornadasCerrando: [{
          jornadaId: "JORNADA-CERRANDO-1",
          nombreVisible: "Jornada cerrando",
          estado: "CERRANDO",
          creadorUsuarioId: "uid-supervisor",
          creadorNombreVisible: "Supervisor Pruebas",
          version: 8,
          trabajoCierreId: "JORNADA-CERRANDO-1",
          estadoTrabajo: "ERROR",
          fase: "OCUPACIONES",
          cursor: 100,
          cantidadLineas: 271,
          cantidadOcupaciones: 271,
          cantidadAutorizaciones: 3,
          lineasProcesadas: 271,
          ocupacionesProcesadas: 100,
          autorizacionesProcesadas: 0,
          intentos: 5,
          puedeReintentar: true,
          errorCodigo: "JOURNEY_CLOSE_PROCESSING_FAILED",
          errorMensaje: "Error sanitizado de prueba.",
          actualizadaEn: "2026-07-31T21:05:00.000Z",
        }],
        jornadasCanceladas: [],
        lineasCatalogo: [{
          lineaId: "LINEA-CERRANDO-1",
          nombreVisible: "Línea retenida por cierre",
          seleccionable: false,
          motivoNoSeleccionable: "JORNADA_CERRANDO",
          ubicacion: {
            vivero: "Vivero ficticio",
            modulo: "MODULO 4",
            cama: "Cama 1",
            linea: "Línea 1",
            nombreVisible: "Línea retenida por cierre",
            orden: 1,
          },
        }],
      },
    });
    const retryInvoke = vi.fn().mockResolvedValue({
      data: {
        jornadaId: "JORNADA-CERRANDO-1",
        estado: "CERRANDO",
        version: 8,
        trabajoCierreId: "JORNADA-CERRANDO-1",
        huellaAlcance: "a".repeat(64),
        cantidadLineas: 271,
        cantidadAutorizaciones: 3,
        cantidadOcupaciones: 271,
        fase: "OCUPACIONES",
        cursor: 100,
        lineasProcesadas: 271,
        ocupacionesProcesadas: 100,
        autorizacionesProcesadas: 0,
        intentos: 6,
        iniciadoEn: "2026-07-31T21:00:00.000Z",
        actualizadoEn: "2026-07-31T21:06:00.000Z",
      },
    });
    firebase.httpsCallable.mockImplementation((_functions: unknown, name: string) =>
      name === "listarJornadasAdministrables" ? listInvoke : retryInvoke
    );
    const repository = FirebaseMonitorRepository.create(config("PRODUCTION"));

    await expect(repository.listManageableJourneys()).resolves.toMatchObject({
      closingJourneys: [{
        state: "CERRANDO",
        closeWorkStatus: "ERROR",
        lineCount: 271,
        processedOccupations: 100,
        canRetry: true,
      }],
      catalogLines: [{selectable: false, unavailableReason: "JORNADA_CERRANDO"}],
    });
    await expect(repository.retryClosingJourney(
      "JORNADA-CERRANDO-1",
      8,
      "reintentar-cierre-ficticio-0001",
    )).resolves.toMatchObject({state: "CERRANDO", version: 8});
    expect(retryInvoke).toHaveBeenCalledWith({
      jornadaId: "JORNADA-CERRANDO-1",
      versionEsperada: 8,
      claveIdempotencia: "reintentar-cierre-ficticio-0001",
    });
  });

  it("crea un usuario mediante la Callable administrativa y convierte el resultado", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        operacion: "USUARIO_CREADO",
        usuarioId: "uid-nuevo",
        nombreVisible: "Usuario Nuevo",
        rol: "SUPERVISOR",
        activo: true,
        version: 1,
        puedeCambiarRol: true,
        resumenTrabajoActivo: {
          jornadasActivas: 0,
          reservasActivas: 0,
          correccionesPendientes: 0,
          tieneTrabajoActivo: false,
          bloqueosCambioRol: [],
        },
        creadoEn: "2026-07-18T12:00:00.000Z",
      },
    });
    firebase.httpsCallable.mockReturnValue(invoke);
    const repository = FirebaseMonitorRepository.create(config("EMULATOR"));

    await expect(repository.createManageableUser(
      "Usuario Nuevo",
      "nuevo@example.test",
      "clave-ficticia-8",
      "SUPERVISOR",
      "idempotencia-usuario-0001",
    )).resolves.toMatchObject({
      id: "uid-nuevo",
      displayName: "Usuario Nuevo",
      role: "SUPERVISOR",
      active: true,
      version: 1,
    });
    expect(firebase.httpsCallable).toHaveBeenCalledWith(firebase.functions, "crearUsuarioAdministrable");
    expect(invoke).toHaveBeenCalledWith({
      nombreVisible: "Usuario Nuevo",
      correo: "nuevo@example.test",
      password: "clave-ficticia-8",
      rol: "SUPERVISOR",
      claveIdempotencia: "idempotencia-usuario-0001",
    });
  });

  it("presenta mensajes controlados para correo duplicado y contraseña débil", async () => {
    const invoke = vi.fn()
      .mockRejectedValueOnce({
        code: "functions/already-exists",
        message: "No fue posible crear la cuenta.",
        details: {code: "USER_EMAIL_ALREADY_EXISTS"},
      })
      .mockRejectedValueOnce({
        code: "functions/invalid-argument",
        message: "No fue posible crear la cuenta.",
        details: {code: "USER_PASSWORD_WEAK"},
      });
    firebase.httpsCallable.mockReturnValue(invoke);
    const repository = FirebaseMonitorRepository.create(config("EMULATOR"));
    const create = () => repository.createManageableUser(
      "Usuario Nuevo", "nuevo@example.test", "clave-ficticia-8", "AUXILIAR", "idempotencia-usuario-0001",
    );

    await expect(create()).rejects.toThrow("El correo ya está registrado.");
    await expect(create()).rejects.toThrow("La contraseña no cumple los requisitos de seguridad.");
  });

  it("usa exclusivamente las cuatro Callables OAuth y no expone tokens", async () => {
    const invocations = new Map<string, ReturnType<typeof vi.fn>>([
      ["iniciarConexionGoogleDrive", vi.fn().mockResolvedValue({data: {
        urlAutorizacion: "https://accounts.google.com/o/oauth2/v2/auth?scope=drive.file",
        expiraEn: "2026-07-20T15:00:00.000Z",
      }})],
      ["completarConexionGoogleDrive", vi.fn().mockResolvedValue({data: {
        estado: "LISTO",
        tipoSeleccion: "PLANTILLA",
        nombreSeleccion: "INVENTARIO PRUEBA.xlsx",
        actualizadoEn: "2026-07-20T14:00:00.000Z",
      }})],
      ["obtenerEstadoConexionGoogleDrive", vi.fn().mockResolvedValue({data: {
        estado: "LISTO",
        plantillaNombre: "INVENTARIO PRUEBA.xlsx",
        carpetaNombre: "INVENTARIOS PRUEBA",
        actualizadoEn: "2026-07-20T14:00:00.000Z",
      }})],
      ["revocarConexionGoogleDrive", vi.fn().mockResolvedValue({data: {
        estado: "REVOCADO",
        revocadaEn: "2026-07-20T14:30:00.000Z",
      }})],
    ]);
    firebase.httpsCallable.mockImplementation((_functions: unknown, name: string) => {
      const invocation = invocations.get(name);
      if (!invocation) throw new Error(`Callable inesperada: ${name}`);
      return invocation;
    });
    const repository = FirebaseMonitorRepository.create(config("PRODUCTION"));
    const startRequest = {
      selectionKind: "PLANTILLA" as const,
      redirectUri: "http://127.0.0.1:54321/",
      codeChallenge: "a".repeat(43),
      idempotencyKey: "oauth-inicio-ficticio-0001",
    };
    await expect(repository.startGoogleDriveOAuth(startRequest)).resolves.toMatchObject({
      authorizationUrl: expect.stringContaining("accounts.google.com"),
    });
    await expect(repository.completeGoogleDriveOAuth({
      state: `00000000-0000-4000-8000-000000000000.${"b".repeat(43)}.${"c".repeat(43)}`,
      authorizationCode: "codigo-ficticio",
      codeVerifier: "v".repeat(64),
      redirectUri: startRequest.redirectUri,
      selectedFileIds: ["plantilla-ficticia"],
      grantedScope: "https://www.googleapis.com/auth/drive.file",
    })).resolves.toMatchObject({state: "LISTO", templateName: "INVENTARIO PRUEBA.xlsx"});
    await expect(repository.revokeGoogleDriveOAuth("oauth-revocar-ficticio-0001"))
      .resolves.toMatchObject({state: "REVOCADO"});

    expect(invocations.get("iniciarConexionGoogleDrive")).toHaveBeenCalledWith({
      tipoSeleccion: "PLANTILLA",
      uriRedireccion: startRequest.redirectUri,
      desafioCodigo: "a".repeat(43),
      claveIdempotencia: "oauth-inicio-ficticio-0001",
    });
    expect(invocations.get("completarConexionGoogleDrive")).toHaveBeenCalledWith({
      estado: `00000000-0000-4000-8000-000000000000.${"b".repeat(43)}.${"c".repeat(43)}`,
      codigoAutorizacion: "codigo-ficticio",
      verificadorCodigo: "v".repeat(64),
      uriRedireccion: startRequest.redirectUri,
      idsSeleccionados: ["plantilla-ficticia"],
      alcanceConcedido: "https://www.googleapis.com/auth/drive.file",
    });
    const serialized = JSON.stringify(Array.from(invocations.values()).flatMap((call) => call.mock.calls));
    expect(serialized).not.toMatch(/refresh[_-]?token/iu);
  });
});
