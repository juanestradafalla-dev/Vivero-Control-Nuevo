import {getApps, initializeApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {
  Timestamp,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

import {loadFirebaseConfig, type FirebaseRuntimeConfig} from "../core/firebaseConfig";
import type {
  CancelledDraftJourney,
  DraftActivationResult,
  DraftActivationVersions,
  DraftCatalogLine,
  DraftParticipant,
  DraftParticipantCandidate,
  DraftParticipantInput,
  DraftParticipantsData,
  ManageableDraftJourney,
  ManageableCatalogData,
  ManageableCatalogLine,
  ManageableCatalogInventory,
  ManageableCatalogLocation,
  ManageableJourneysData,
  ManageableUser,
  MonitorCount,
  MonitorCorrectionCandidate,
  MonitorCorrectionResponsibility,
  MonitorInventory,
  MonitorJourney,
  MonitorLine,
  MonitorLocation,
  MonitorRepository,
  MonitorReservation,
  MonitorRole,
  MonitorSnapshot,
  MonitorUnsubscribe,
  MonitorUser,
  MigrationEntitySummary,
  MigrationImportMapEntry,
  MigrationImportResult,
  MigrationImportSummary,
  MigrationReversalResult,
  MigrationValidationIssue,
  MigrationValidationReport,
} from "../domain/MonitorModels";
import {sortMonitorLines} from "../domain/MonitorModels";

function isRole(value: unknown): value is MonitorRole {
  return value === "AUXILIAR" || value === "SUPERVISOR" || value === "ADMINISTRADOR";
}

function parseLocation(value: unknown): MonitorLocation | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const location = value as Record<string, unknown>;
  if (
    typeof location.vivero !== "string" ||
    typeof location.modulo !== "string" ||
    typeof location.cama !== "string" ||
    typeof location.linea !== "string" ||
    typeof location.nombreVisible !== "string" ||
    typeof location.orden !== "number"
  ) {
    return undefined;
  }
  return {
    nursery: location.vivero,
    module: location.modulo,
    bed: location.cama,
    line: location.linea,
    displayName: location.nombreVisible,
    order: location.orden,
  };
}

function parseDraftJourney(value: unknown): ManageableDraftJourney {
  if (typeof value !== "object" || value === null) throw new Error("Un borrador no tiene formato vÃ¡lido.");
  const journey = value as Record<string, unknown>;
  if (
    typeof journey.jornadaId !== "string" ||
    typeof journey.nombreVisible !== "string" ||
    journey.estado !== "BORRADOR" ||
    typeof journey.creadorUsuarioId !== "string" ||
    typeof journey.creadorNombreVisible !== "string" ||
    !Number.isSafeInteger(journey.version) ||
    !Array.isArray(journey.lineaIds) ||
    journey.lineaIds.some((lineId) => typeof lineId !== "string") ||
    typeof journey.creadaEn !== "string" ||
    typeof journey.actualizadaEn !== "string"
  ) {
    throw new Error("Un borrador no tiene formato vÃ¡lido.");
  }
  return {
    id: journey.jornadaId,
    displayName: journey.nombreVisible,
    state: "BORRADOR",
    creatorUserId: journey.creadorUsuarioId,
    creatorDisplayName: journey.creadorNombreVisible,
    version: journey.version as number,
    lineIds: journey.lineaIds as string[],
    createdAt: journey.creadaEn,
    updatedAt: journey.actualizadaEn,
  };
}

function parseDraftCatalogLine(value: unknown): DraftCatalogLine {
  if (typeof value !== "object" || value === null) throw new Error("Una lÃ­nea de catÃ¡logo no es vÃ¡lida.");
  const line = value as Record<string, unknown>;
  const location = parseLocation(line.ubicacion);
  if (
    typeof line.lineaId !== "string" ||
    typeof line.nombreVisible !== "string" ||
    typeof line.seleccionable !== "boolean" ||
    !location ||
    (line.motivoNoSeleccionable !== undefined &&
      line.motivoNoSeleccionable !== "JORNADA_ACTIVA" && line.motivoNoSeleccionable !== "LINEA_INACTIVA")
  ) {
    throw new Error("Una lÃ­nea de catÃ¡logo no es vÃ¡lida.");
  }
  return {
    id: line.lineaId,
    displayName: line.nombreVisible,
    selectable: line.seleccionable,
    ...(line.motivoNoSeleccionable === "JORNADA_ACTIVA" || line.motivoNoSeleccionable === "LINEA_INACTIVA"
      ? {unavailableReason: line.motivoNoSeleccionable}
      : {}),
    location,
  };
}

function parseDraftParticipantCandidate(value: unknown): DraftParticipantCandidate {
  if (typeof value !== "object" || value === null) throw new Error("Un usuario del catalogo no es valido.");
  const user = value as Record<string, unknown>;
  if (
    typeof user.usuarioId !== "string" ||
    typeof user.nombreVisible !== "string" ||
    !isRole(user.rol)
  ) {
    throw new Error("Un usuario del catalogo no es valido.");
  }
  return {id: user.usuarioId, displayName: user.nombreVisible, role: user.rol};
}

function parseDraftParticipant(value: unknown): DraftParticipant {
  const candidate = parseDraftParticipantCandidate(value);
  if (typeof value !== "object" || value === null || typeof (value as Record<string, unknown>).puedeContar !== "boolean") {
    throw new Error("Un participante no es valido.");
  }
  return {...candidate, canCount: (value as Record<string, unknown>).puedeContar as boolean};
}

function parseCancelledDraftJourney(value: unknown): CancelledDraftJourney {
  if (typeof value !== "object" || value === null) throw new Error("Un borrador cancelado no tiene formato valido.");
  const journey = value as Record<string, unknown>;
  if (
    typeof journey.jornadaId !== "string" ||
    typeof journey.nombreVisible !== "string" ||
    journey.estado !== "INACTIVA" ||
    journey.tipoInactivacion !== "CANCELACION_BORRADOR" ||
    typeof journey.creadorUsuarioId !== "string" ||
    typeof journey.creadorNombreVisible !== "string" ||
    !Number.isSafeInteger(journey.version) ||
    !Array.isArray(journey.lineaIds) ||
    journey.lineaIds.some((lineId) => typeof lineId !== "string") ||
    !Array.isArray(journey.participantes) ||
    typeof journey.cancelacionId !== "string" ||
    typeof journey.canceladaPorUsuarioId !== "string" ||
    typeof journey.canceladaPorNombreVisible !== "string" ||
    typeof journey.motivoCancelacion !== "string" ||
    typeof journey.canceladaEn !== "string" ||
    typeof journey.creadaEn !== "string" ||
    typeof journey.actualizadaEn !== "string"
  ) {
    throw new Error("Un borrador cancelado no tiene formato valido.");
  }
  return {
    id: journey.jornadaId,
    displayName: journey.nombreVisible,
    state: "INACTIVA",
    inactiveType: "CANCELACION_BORRADOR",
    creatorUserId: journey.creadorUsuarioId,
    creatorDisplayName: journey.creadorNombreVisible,
    version: journey.version as number,
    lineIds: journey.lineaIds as string[],
    participants: journey.participantes.map(parseDraftParticipant),
    cancellationId: journey.cancelacionId,
    cancelledByUserId: journey.canceladaPorUsuarioId,
    cancelledByDisplayName: journey.canceladaPorNombreVisible,
    cancellationReason: journey.motivoCancelacion,
    cancelledAt: journey.canceladaEn,
    createdAt: journey.creadaEn,
    updatedAt: journey.actualizadaEn,
  };
}

function parseManageableUser(value: unknown): ManageableUser {
  if (typeof value !== "object" || value === null) throw new Error("Un perfil administrativo no es valido.");
  const profile = value as Record<string, unknown>;
  const work = profile.resumenTrabajoActivo;
  if (
    typeof profile.usuarioId !== "string" ||
    typeof profile.nombreVisible !== "string" ||
    !isRole(profile.rol) ||
    typeof profile.activo !== "boolean" ||
    !Number.isSafeInteger(profile.version) ||
    typeof profile.puedeCambiarRol !== "boolean" ||
    typeof work !== "object" ||
    work === null
  ) {
    throw new Error("Un perfil administrativo no es valido.");
  }
  const summary = work as Record<string, unknown>;
  const blockers = summary.bloqueosCambioRol;
  if (
    !Number.isSafeInteger(summary.jornadasActivas) ||
    !Number.isSafeInteger(summary.reservasActivas) ||
    !Number.isSafeInteger(summary.correccionesPendientes) ||
    typeof summary.tieneTrabajoActivo !== "boolean" ||
    !Array.isArray(blockers) ||
    blockers.some((blocker) =>
      blocker !== "JORNADA_ACTIVA" && blocker !== "RESERVA_ACTIVA" && blocker !== "CORRECCION_PENDIENTE"
    )
  ) {
    throw new Error("El resumen de trabajo del perfil no es valido.");
  }
  return {
    id: profile.usuarioId,
    displayName: profile.nombreVisible,
    role: profile.rol,
    active: profile.activo,
    version: profile.version as number,
    canChangeRole: profile.puedeCambiarRol,
    activeWork: {
      activeJourneys: summary.jornadasActivas as number,
      activeReservations: summary.reservasActivas as number,
      pendingCorrections: summary.correccionesPendientes as number,
      hasActiveWork: summary.tieneTrabajoActivo,
      roleChangeBlockers: blockers,
    },
  };
}

function parseCatalogLocation(value: unknown): ManageableCatalogLocation {
  if (typeof value !== "object" || value === null) throw new Error("Una ubicacion del catalogo no es valida.");
  const location = value as Record<string, unknown>;
  if (
    typeof location.ubicacionId !== "string" || typeof location.codigo !== "string" ||
    typeof location.tipo !== "string" ||
    (location.ubicacionPadreId !== null && typeof location.ubicacionPadreId !== "string") ||
    typeof location.nombreVisible !== "string" || !Number.isSafeInteger(location.orden) ||
    typeof location.activa !== "boolean" || !Number.isSafeInteger(location.version) ||
    !Number.isSafeInteger(location.cantidadHijosActivos) || !Number.isSafeInteger(location.cantidadLineasActivas)
  ) throw new Error("Una ubicacion del catalogo no es valida.");
  return {
    id: location.ubicacionId,
    code: location.codigo,
    type: location.tipo,
    ...(typeof location.ubicacionPadreId === "string" ? {parentId: location.ubicacionPadreId} : {}),
    displayName: location.nombreVisible,
    order: location.orden as number,
    active: location.activa,
    version: location.version as number,
    activeChildCount: location.cantidadHijosActivos as number,
    activeLineCount: location.cantidadLineasActivas as number,
  };
}

function parseCatalogLine(value: unknown): ManageableCatalogLine {
  if (typeof value !== "object" || value === null) throw new Error("Una linea del catalogo no es valida.");
  const line = value as Record<string, unknown>;
  if (
    typeof line.lineaId !== "string" || typeof line.ubicacionId !== "string" ||
    typeof line.codigo !== "string" || typeof line.nombreVisible !== "string" ||
    !Number.isSafeInteger(line.orden) || typeof line.activa !== "boolean" ||
    !Number.isSafeInteger(line.version) || typeof line.ocupadaEnJornadaActiva !== "boolean" ||
    !Number.isSafeInteger(line.seleccionesBorrador) ||
    (line.inventario !== null && (typeof line.inventario !== "object" || line.inventario === null)) ||
    typeof line.elegibleInventarioInicial !== "boolean" ||
    (line.motivoNoElegibleInventarioInicial !== null && typeof line.motivoNoElegibleInventarioInicial !== "string")
  ) throw new Error("Una linea del catalogo no es valida.");
  let inventory: ManageableCatalogInventory | undefined;
  if (line.inventario !== null) {
    const value = line.inventario as Record<string, unknown>;
    if (
      !Number.isSafeInteger(value.hembras) || !Number.isSafeInteger(value.machos) ||
      !Number.isSafeInteger(value.patrones) || !Number.isSafeInteger(value.total) ||
      !Number.isSafeInteger(value.version) || typeof value.origen !== "string" ||
      typeof value.actorUsuarioId !== "string" || typeof value.actorNombreVisible !== "string" ||
      typeof value.actualizadoEn !== "string" ||
      (value.referenciaFuenteInicial !== null && typeof value.referenciaFuenteInicial !== "string")
    ) throw new Error("El inventario de la linea no es valido.");
    inventory = {
      females: value.hembras as number, males: value.machos as number,
      rootstocks: value.patrones as number, total: value.total as number,
      version: value.version as number, origin: value.origen,
      actorUserId: value.actorUsuarioId, actorDisplayName: value.actorNombreVisible,
      updatedAt: value.actualizadoEn,
      ...(typeof value.referenciaFuenteInicial === "string"
        ? {initialSourceReference: value.referenciaFuenteInicial}
        : {}),
    };
  }
  return {
    id: line.lineaId,
    locationId: line.ubicacionId,
    code: line.codigo,
    displayName: line.nombreVisible,
    order: line.orden as number,
    active: line.activa,
    version: line.version as number,
    occupiedByActiveJourney: line.ocupadaEnJornadaActiva,
    draftSelectionCount: line.seleccionesBorrador as number,
    ...(inventory ? {inventory} : {}),
    initialInventoryEligible: line.elegibleInventarioInicial,
    ...(typeof line.motivoNoElegibleInventarioInicial === "string"
      ? {initialInventoryIneligibleReason: line.motivoNoElegibleInventarioInicial}
      : {}),
  };
}

function parseMigrationIssue(value: unknown): MigrationValidationIssue {
  if (typeof value !== "object" || value === null) throw new Error("El hallazgo de migración no es válido.");
  const issue = value as Record<string, unknown>;
  if (
    typeof issue.codigo !== "string" ||
    (issue.severidad !== "ERROR" && issue.severidad !== "ADVERTENCIA") ||
    !["PAQUETE", "UBICACION", "LINEA", "INVENTARIO_INICIAL"].includes(String(issue.entidad)) ||
    (issue.claveExterna !== null && typeof issue.claveExterna !== "string") ||
    typeof issue.mensaje !== "string"
  ) throw new Error("El hallazgo de migración no es válido.");
  return {
    code: issue.codigo,
    severity: issue.severidad,
    entity: issue.entidad as MigrationValidationIssue["entity"],
    ...(typeof issue.claveExterna === "string" ? {externalKey: issue.claveExterna} : {}),
    message: issue.mensaje,
  };
}

function parseMigrationEntitySummary(value: unknown): MigrationEntitySummary {
  if (typeof value !== "object" || value === null) throw new Error("El resumen de migración no es válido.");
  const summary = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(summary.nuevos) || !Number.isSafeInteger(summary.coincidentes) ||
    !Number.isSafeInteger(summary.bloqueados)
  ) throw new Error("El resumen de migración no es válido.");
  return {
    newItems: summary.nuevos as number,
    matchingItems: summary.coincidentes as number,
    blockedItems: summary.bloqueados as number,
  };
}

function parseMigrationValidationReport(value: unknown): MigrationValidationReport {
  if (typeof value !== "object" || value === null) throw new Error("El informe de migración no es válido.");
  const report = value as Record<string, unknown>;
  const counts = report.cantidades as Record<string, unknown> | null;
  const conflicts = report.resumenConflictos as Record<string, unknown> | null;
  if (
    typeof report.formato !== "string" || typeof report.hashPaquete !== "string" ||
    !Array.isArray(report.erroresBloqueantes) || !Array.isArray(report.advertencias) ||
    typeof counts !== "object" || counts === null || typeof conflicts !== "object" || conflicts === null ||
    !Number.isSafeInteger(counts.ubicaciones) || !Number.isSafeInteger(counts.lineas) ||
    !Number.isSafeInteger(counts.inventariosIniciales) || typeof report.aptoParaImportar !== "boolean" ||
    report.soloValidacion !== true || !Number.isSafeInteger(conflicts.codigosExistentes) ||
    !Number.isSafeInteger(conflicts.clavesIncompatibles) ||
    !Number.isSafeInteger(conflicts.lineasConInventarioActual) ||
    !Number.isSafeInteger(conflicts.conflictosOperativos)
  ) throw new Error("El informe de migración no es válido.");
  return {
    format: report.formato,
    packageHash: report.hashPaquete,
    counts: {
      locations: counts.ubicaciones as number,
      lines: counts.lineas as number,
      initialInventories: counts.inventariosIniciales as number,
    },
    blockingErrors: report.erroresBloqueantes.map(parseMigrationIssue),
    warnings: report.advertencias.map(parseMigrationIssue),
    conflicts: {
      locations: parseMigrationEntitySummary(conflicts.ubicaciones),
      lines: parseMigrationEntitySummary(conflicts.lineas),
      initialInventories: parseMigrationEntitySummary(conflicts.inventariosIniciales),
      existingCodes: conflicts.codigosExistentes as number,
      incompatibleKeys: conflicts.clavesIncompatibles as number,
      linesWithCurrentInventory: conflicts.lineasConInventarioActual as number,
      operationalConflicts: conflicts.conflictosOperativos as number,
    },
    eligibleToImport: report.aptoParaImportar,
    validationOnly: true,
  };
}

function parseMigrationImportMapEntry(value: unknown): MigrationImportMapEntry {
  if (typeof value !== "object" || value === null) throw new Error("El mapa de migración no es válido.");
  const entry = value as Record<string, unknown>;
  if (typeof entry.claveExterna !== "string" || typeof entry.idInterno !== "string" ||
      typeof entry.bloqueoCodigoId !== "string") throw new Error("El mapa de migración no es válido.");
  return {externalKey: entry.claveExterna, internalId: entry.idInterno, codeLockId: entry.bloqueoCodigoId};
}

function parseMigrationCounts(value: unknown): MigrationValidationReport["counts"] {
  if (typeof value !== "object" || value === null) throw new Error("Las cantidades de migración no son válidas.");
  const counts = value as Record<string, unknown>;
  if (!Number.isSafeInteger(counts.ubicaciones) || !Number.isSafeInteger(counts.lineas) ||
      !Number.isSafeInteger(counts.inventariosIniciales)) throw new Error("Las cantidades de migración no son válidas.");
  return {
    locations: counts.ubicaciones as number,
    lines: counts.lineas as number,
    initialInventories: counts.inventariosIniciales as number,
  };
}

function parseMigrationImportResult(value: unknown): MigrationImportResult {
  if (typeof value !== "object" || value === null) throw new Error("El resultado de importación no es válido.");
  const result = value as Record<string, unknown>;
  const map = result.mapa as Record<string, unknown> | null;
  if (typeof result.importacionId !== "string" || typeof result.hashPaquete !== "string" ||
      result.estado !== "APLICADA" || result.version !== 1 || !Number.isSafeInteger(result.escriturasRealizadas) ||
      typeof result.aplicadaPorUsuarioId !== "string" || typeof result.aplicadaEn !== "string" ||
      typeof map !== "object" || map === null || !Array.isArray(map.ubicaciones) || !Array.isArray(map.lineas)) {
    throw new Error("El resultado de importación no es válido.");
  }
  return {
    importId: result.importacionId, packageHash: result.hashPaquete, status: "APLICADA", version: 1,
    counts: parseMigrationCounts(result.cantidades), writes: result.escriturasRealizadas as number,
    map: {locations: map.ubicaciones.map(parseMigrationImportMapEntry), lines: map.lineas.map(parseMigrationImportMapEntry)},
    appliedByUserId: result.aplicadaPorUsuarioId, appliedAt: result.aplicadaEn,
  };
}

function parseMigrationImportSummary(value: unknown): MigrationImportSummary {
  if (typeof value !== "object" || value === null) throw new Error("El historial de migración no es válido.");
  const summary = value as Record<string, unknown>;
  if (typeof summary.importacionId !== "string" || typeof summary.hashPaquete !== "string" ||
      (summary.estado !== "APLICADA" && summary.estado !== "REVERTIDA") || !Number.isSafeInteger(summary.version) ||
      !Number.isSafeInteger(summary.escriturasRealizadas) || typeof summary.aplicadaPorUsuarioId !== "string" ||
      typeof summary.aplicadaPorNombreVisible !== "string" || typeof summary.aplicadaEn !== "string" ||
      typeof summary.reversionElegible !== "boolean" || !Array.isArray(summary.bloqueosReversion) ||
      !summary.bloqueosReversion.every((entry) => typeof entry === "string")) {
    throw new Error("El historial de migración no es válido.");
  }
  return {
    importId: summary.importacionId, packageHash: summary.hashPaquete, status: summary.estado,
    version: summary.version as number, counts: parseMigrationCounts(summary.cantidades),
    writes: summary.escriturasRealizadas as number, appliedByUserId: summary.aplicadaPorUsuarioId,
    appliedByDisplayName: summary.aplicadaPorNombreVisible, appliedAt: summary.aplicadaEn,
    reversalEligible: summary.reversionElegible,
    reversalBlockers: summary.bloqueosReversion as string[],
    ...(typeof summary.revertidaPorUsuarioId === "string" ? {revertedByUserId: summary.revertidaPorUsuarioId} : {}),
    ...(typeof summary.revertidaEn === "string" ? {revertedAt: summary.revertidaEn} : {}),
    ...(typeof summary.motivoReversion === "string" ? {reversalReason: summary.motivoReversion} : {}),
  };
}

function parseMigrationReversalResult(value: unknown): MigrationReversalResult {
  if (typeof value !== "object" || value === null) throw new Error("El resultado de reversión no es válido.");
  const result = value as Record<string, unknown>;
  if (typeof result.importacionId !== "string" || typeof result.hashPaquete !== "string" ||
      result.estado !== "REVERTIDA" || !Number.isSafeInteger(result.version) ||
      !Number.isSafeInteger(result.documentosEliminados) || typeof result.revertidaPorUsuarioId !== "string" ||
      typeof result.revertidaEn !== "string" || typeof result.motivo !== "string") {
    throw new Error("El resultado de reversión no es válido.");
  }
  return {
    importId: result.importacionId, packageHash: result.hashPaquete, status: "REVERTIDA",
    version: result.version as number, deletedDocuments: result.documentosEliminados as number,
    revertedByUserId: result.revertidaPorUsuarioId, revertedAt: result.revertidaEn, reason: result.motivo,
  };
}

export class FirebaseMonitorRepository implements MonitorRepository {
  readonly emulatorEnabled: boolean;

  private constructor(
    private readonly auth: ReturnType<typeof getAuth>,
    private readonly firestore: Firestore,
    private readonly functions: Functions,
    readonly environment: "EMULATOR" | "STAGING",
  ) {
    this.emulatorEnabled = environment === "EMULATOR";
  }

  static create(config: FirebaseRuntimeConfig = loadFirebaseConfig()): FirebaseMonitorRepository {
    const appName = `vivero-maestro-${config.environment.toLowerCase()}`;
    const app = getApps().find((candidate) => candidate.name === appName)
      ?? initializeApp({
          apiKey: config.apiKey,
          appId: config.appId,
          authDomain: config.authDomain,
          projectId: config.projectId,
        }, appName);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const functions = getFunctions(app, "us-central1");
    if (config.useEmulators) {
      connectAuthEmulator(auth, `http://${config.emulatorHost}:9099`, {disableWarnings: true});
      connectFirestoreEmulator(firestore, config.emulatorHost, 8180);
      connectFunctionsEmulator(functions, config.emulatorHost, 5001);
    }
    return new FirebaseMonitorRepository(auth, firestore, functions, config.environment);
  }

  async signIn(email: string, password: string): Promise<MonitorUser> {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      const profile = await getDoc(doc(this.firestore, "usuarios", credential.user.uid));
      if (!profile.exists()) throw new Error("La cuenta no tiene un perfil operativo.");
      if (profile.data().activo !== true) throw new Error("La cuenta está inactiva.");
      const roles = profile.data().roles;
      const role = Array.isArray(roles) ? roles.find(isRole) : undefined;
      if (!role) throw new Error("La cuenta no tiene un rol operativo.");
      return {
        id: credential.user.uid,
        displayName: typeof profile.data().nombreVisible === "string"
          ? profile.data().nombreVisible
          : "Usuario de prueba",
        role,
        canViewReservationDetails: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canReview: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canRelease: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canManageDraftJourneys: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canManageUsers: role === "ADMINISTRADOR",
        canManageCatalog: role === "ADMINISTRADOR",
      };
    } catch (error) {
      await this.auth.signOut();
      throw new Error(error instanceof Error ? error.message : "No fue posible iniciar sesión.", {cause: error});
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  observeAccountStatus(
    userId: string,
    onActiveChanged: (active: boolean) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe {
    return onSnapshot(
      doc(this.firestore, "usuarios", userId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onError("La cuenta ya no tiene un perfil operativo.");
          return;
        }
        onActiveChanged(snapshot.data().activo === true);
      },
      () => onError("No fue posible comprobar el estado de la cuenta."),
    );
  }

  async listActiveJourneys(): Promise<readonly MonitorJourney[]> {
    const callable = httpsCallable<Record<string, never>, {jornadas: unknown[]}>(this.functions, "listarJornadasActivas");
    try {
      const response = await callable({});
      if (!Array.isArray(response.data.jornadas)) throw new Error("La respuesta no contiene jornadas.");
      return response.data.jornadas.map((value) => {
        if (typeof value !== "object" || value === null) throw new Error("Una jornada no tiene formato válido.");
        const journey = value as Record<string, unknown>;
        if (
          typeof journey.jornadaId !== "string" ||
          typeof journey.nombreVisible !== "string" ||
          journey.estado !== "ACTIVA" ||
          !isRole(journey.rolEfectivo) ||
          typeof journey.puedeContar !== "boolean" ||
          !Number.isSafeInteger(journey.cantidadLineas) ||
          !Number.isSafeInteger(journey.version) ||
          typeof journey.puedeCerrar !== "boolean"
        ) throw new Error("Una jornada no tiene formato válido.");
        return {
          id: journey.jornadaId,
          displayName: journey.nombreVisible,
          state: "ACTIVA" as const,
          effectiveRole: journey.rolEfectivo,
          canCount: journey.puedeContar,
          lineCount: journey.cantidadLineas as number,
          version: journey.version as number,
          canClose: journey.puedeCerrar,
        };
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar las jornadas activas.", {cause: error});
    }
  }

  async listManageableJourneys(): Promise<ManageableJourneysData> {
    const callable = httpsCallable<Record<string, never>, {
      jornadas: unknown[];
      jornadasCanceladas: unknown[];
      lineasCatalogo: unknown[];
    }>(
      this.functions,
      "listarJornadasAdministrables",
    );
    try {
      const response = await callable({});
      if (
        !Array.isArray(response.data.jornadas) ||
        !Array.isArray(response.data.jornadasCanceladas) ||
        !Array.isArray(response.data.lineasCatalogo)
      ) {
        throw new Error("La respuesta administrativa no tiene formato vÃ¡lido.");
      }
      return {
        journeys: response.data.jornadas.map(parseDraftJourney),
        cancelledJourneys: response.data.jornadasCanceladas.map(parseCancelledDraftJourney),
        catalogLines: response.data.lineasCatalogo.map(parseDraftCatalogLine),
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "No fue posible consultar los borradores.",
        {cause: error},
      );
    }
  }

  async listManageableUsers(): Promise<readonly ManageableUser[]> {
    const callable = httpsCallable<Record<string, never>, {usuarios: unknown[]}>(
      this.functions,
      "listarUsuariosAdministrables",
    );
    try {
      const response = await callable({});
      if (!Array.isArray(response.data.usuarios)) {
        throw new Error("La respuesta de usuarios no tiene formato valido.");
      }
      return response.data.usuarios.map(parseManageableUser);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar los usuarios.", {cause: error});
    }
  }

  async updateUserStatus(
    userId: string,
    expectedVersion: number,
    active: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableUser> {
    const callable = httpsCallable(this.functions, "actualizarEstadoUsuario");
    try {
      const response = await callable({
        usuarioId: userId,
        versionEsperada: expectedVersion,
        nuevoEstado: active ? "ACTIVO" : "INACTIVO",
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
      if (
        typeof response.data !== "object" ||
        response.data === null ||
        (response.data as Record<string, unknown>).operacion !== "ESTADO_USUARIO_ACTUALIZADO"
      ) {
        throw new Error("La respuesta del cambio de estado no es valida.");
      }
      return parseManageableUser(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible actualizar el estado.", {cause: error});
    }
  }

  async updateUserRole(
    userId: string,
    expectedVersion: number,
    role: MonitorRole,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableUser> {
    const callable = httpsCallable(this.functions, "actualizarRolUsuario");
    try {
      const response = await callable({
        usuarioId: userId,
        versionEsperada: expectedVersion,
        nuevoRol: role,
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
      if (
        typeof response.data !== "object" ||
        response.data === null ||
        (response.data as Record<string, unknown>).operacion !== "ROL_USUARIO_ACTUALIZADO"
      ) {
        throw new Error("La respuesta del cambio de rol no es valida.");
      }
      return parseManageableUser(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible actualizar el rol.", {cause: error});
    }
  }

  async listManageableCatalog(): Promise<ManageableCatalogData> {
    const callable = httpsCallable<Record<string, never>, {ubicaciones: unknown[]; lineas: unknown[]}>(
      this.functions, "listarCatalogoAdministrable"
    );
    try {
      const response = await callable({});
      if (!Array.isArray(response.data.ubicaciones) || !Array.isArray(response.data.lineas)) {
        throw new Error("La respuesta del catalogo no es valida.");
      }
      return {
        locations: response.data.ubicaciones.map(parseCatalogLocation),
        lines: response.data.lineas.map(parseCatalogLine),
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar el catalogo.", {cause: error});
    }
  }

  async createCatalogLocation(
    code: string,
    type: string,
    parentId: string | undefined,
    displayName: string,
    order: number,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLocation> {
    const callable = httpsCallable(this.functions, "crearUbicacion");
    try {
      const response = await callable({
        codigo: code, tipo: type, ubicacionPadreId: parentId ?? null,
        nombreVisible: displayName, orden: order, claveIdempotencia: idempotencyKey,
      });
      return parseCatalogLocation(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible crear la ubicacion.", {cause: error});
    }
  }

  async updateCatalogLocation(
    location: ManageableCatalogLocation,
    displayName: string,
    order: number,
    active: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLocation> {
    const callable = httpsCallable(this.functions, "actualizarUbicacion");
    try {
      const response = await callable({
        ubicacionId: location.id, versionEsperada: location.version,
        nombreVisible: displayName, orden: order, activa: active,
        motivo: reason, claveIdempotencia: idempotencyKey,
      });
      return parseCatalogLocation(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible actualizar la ubicacion.", {cause: error});
    }
  }

  async createCatalogLine(
    locationId: string,
    code: string,
    displayName: string,
    order: number,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLine> {
    const callable = httpsCallable(this.functions, "crearLinea");
    try {
      const response = await callable({
        ubicacionId: locationId, codigo: code, nombreVisible: displayName,
        orden: order, claveIdempotencia: idempotencyKey,
      });
      return parseCatalogLine(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible crear la linea.", {cause: error});
    }
  }

  async updateCatalogLine(
    line: ManageableCatalogLine,
    displayName: string,
    order: number,
    active: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLine> {
    const callable = httpsCallable(this.functions, "actualizarLinea");
    try {
      const response = await callable({
        lineaId: line.id, versionEsperada: line.version,
        nombreVisible: displayName, orden: order, activa: active,
        motivo: reason, claveIdempotencia: idempotencyKey,
      });
      return parseCatalogLine(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible actualizar la linea.", {cause: error});
    }
  }

  async registerInitialInventory(
    line: ManageableCatalogLine,
    females: number,
    males: number,
    rootstocks: number,
    sourceReference: string,
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "registrarInventarioInicial");
    try {
      await callable({
        lineaId: line.id, versionLineaEsperada: line.version,
        hembras: females, machos: males, patrones: rootstocks,
        referenciaFuente: sourceReference, claveIdempotencia: idempotencyKey,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible registrar el inventario inicial.", {cause: error});
    }
  }

  async validateMigrationPackage(packageData: unknown): Promise<MigrationValidationReport> {
    const callable = httpsCallable<unknown, unknown>(this.functions, "validarPaqueteMigracion");
    try {
      return parseMigrationValidationReport((await callable(packageData)).data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible validar el paquete.", {cause: error});
    }
  }

  async importMigrationPackage(
    packageData: unknown,
    expectedHash: string,
    idempotencyKey: string,
  ): Promise<MigrationImportResult> {
    const callable = httpsCallable<unknown, unknown>(this.functions, "importarPaqueteMigracion");
    try {
      return parseMigrationImportResult((await callable({
        paquete: packageData,
        hashEsperado: expectedHash,
        confirmacionHash: expectedHash,
        claveIdempotencia: idempotencyKey,
      })).data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible importar el paquete.", {cause: error});
    }
  }

  async listMigrationImports(): Promise<readonly MigrationImportSummary[]> {
    const callable = httpsCallable<unknown, unknown>(this.functions, "listarImportacionesMigracion");
    try {
      const response = (await callable({})).data;
      if (typeof response !== "object" || response === null ||
          !Array.isArray((response as Record<string, unknown>).importaciones)) {
        throw new Error("El historial de migración no es válido.");
      }
      return ((response as Record<string, unknown>).importaciones as unknown[]).map(parseMigrationImportSummary);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar las importaciones.", {cause: error});
    }
  }

  async revertMigrationImport(
    migrationImport: MigrationImportSummary,
    reason: string,
    idempotencyKey: string,
  ): Promise<MigrationReversalResult> {
    const callable = httpsCallable<unknown, unknown>(this.functions, "revertirImportacionMigracion");
    try {
      return parseMigrationReversalResult((await callable({
        importacionId: migrationImport.importId,
        versionEsperada: migrationImport.version,
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      })).data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible revertir la importación.", {cause: error});
    }
  }

  async createDraftJourney(displayName: string, idempotencyKey: string): Promise<ManageableDraftJourney> {
    const callable = httpsCallable(this.functions, "crearJornadaBorrador");
    try {
      const response = await callable({nombreVisible: displayName, claveIdempotencia: idempotencyKey});
      return parseDraftJourney(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible crear el borrador.", {cause: error});
    }
  }

  async updateDraftJourneyLines(
    journeyId: string,
    lineIds: readonly string[],
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "actualizarLineasJornadaBorrador");
    try {
      await callable({jornadaId: journeyId, lineaIds: lineIds, claveIdempotencia: idempotencyKey});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible guardar la selecciÃ³n.", {cause: error});
    }
  }

  async listDraftJourneyParticipants(journeyId: string): Promise<DraftParticipantsData> {
    const callable = httpsCallable(this.functions, "listarParticipantesJornadaBorrador");
    try {
      const response = await callable({jornadaId: journeyId});
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de participantes no tiene formato valido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "BORRADOR" ||
        !Number.isSafeInteger(data.version) ||
        !Number.isSafeInteger(data.versionSeleccionLineas) ||
        !Number.isSafeInteger(data.versionSeleccionParticipantes) ||
        !Array.isArray(data.participantes) ||
        !Array.isArray(data.usuariosActivos)
      ) {
        throw new Error("La respuesta de participantes no tiene formato valido.");
      }
      return {
        journeyId,
        state: "BORRADOR",
        version: data.version as number,
        lineSelectionVersion: data.versionSeleccionLineas as number,
        participantSelectionVersion: data.versionSeleccionParticipantes as number,
        participants: data.participantes.map(parseDraftParticipant),
        activeUsers: data.usuariosActivos.map(parseDraftParticipantCandidate),
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar participantes.", {cause: error});
    }
  }

  async updateDraftJourneyParticipants(
    journeyId: string,
    participants: readonly DraftParticipantInput[],
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "actualizarParticipantesJornadaBorrador");
    try {
      await callable({
        jornadaId: journeyId,
        participantes: participants.map((participant) => ({
          usuarioId: participant.userId,
          puedeContar: participant.canCount,
        })),
        claveIdempotencia: idempotencyKey,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible guardar participantes.", {cause: error});
    }
  }

  async activateDraftJourney(
    journeyId: string,
    versions: DraftActivationVersions,
    idempotencyKey: string,
  ): Promise<DraftActivationResult> {
    const callable = httpsCallable(this.functions, "activarJornada");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionJornadaEsperada: versions.journey,
        versionSeleccionLineasEsperada: versions.lineSelection,
        versionSeleccionParticipantesEsperada: versions.participantSelection,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de activación no tiene formato válido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "ACTIVA" ||
        !Number.isSafeInteger(data.version) ||
        !Number.isSafeInteger(data.cantidadLineas) ||
        !Number.isSafeInteger(data.cantidadParticipantes) ||
        typeof data.activadaEn !== "string"
      ) {
        throw new Error("La respuesta de activación no tiene formato válido.");
      }
      return {
        journeyId,
        state: "ACTIVA",
        version: data.version as number,
        lineCount: data.cantidadLineas as number,
        participantCount: data.cantidadParticipantes as number,
        activatedAt: data.activadaEn,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible activar la jornada.", {cause: error});
    }
  }

  async approveCount(countId: string, idempotencyKey: string, exceptionReason?: string): Promise<void> {
    const callable = httpsCallable(this.functions, "aprobarConteo");
    try {
      await callable({
        conteoId: countId,
        claveIdempotencia: idempotencyKey,
        ...(exceptionReason === undefined ? {} : {motivoExcepcion: exceptionReason}),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible aprobar el conteo.", {cause: error});
    }
  }

  async cancelDraftJourney(
    journeyId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "cancelarJornadaBorrador");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionEsperada: expectedVersion,
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de cancelacion no tiene formato valido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "INACTIVA" ||
        data.tipoInactivacion !== "CANCELACION_BORRADOR" ||
        !Number.isSafeInteger(data.version) ||
        typeof data.cancelacionId !== "string" ||
        typeof data.canceladaEn !== "string"
      ) {
        throw new Error("La respuesta de cancelacion no tiene formato valido.");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible cancelar el borrador.", {cause: error});
    }
  }

  async reopenCancelledJourney(journeyId: string, expectedVersion: number, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "reabrirJornadaCancelada");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionEsperada: expectedVersion,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de reapertura no tiene formato valido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "BORRADOR" ||
        !Number.isSafeInteger(data.version) ||
        typeof data.cancelacionAnteriorId !== "string" ||
        typeof data.reabiertaEn !== "string"
      ) {
        throw new Error("La respuesta de reapertura no tiene formato valido.");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible reabrir el borrador.", {cause: error});
    }
  }

  async closeJourney(journeyId: string, expectedVersion: number, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "cerrarJornada");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionEsperada: expectedVersion,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de cierre no tiene formato válido.");
      }
      const data = response.data as Record<string, unknown>;
      if (data.jornadaId !== journeyId || data.estado !== "INACTIVA" || !Number.isSafeInteger(data.version)) {
        throw new Error("La respuesta de cierre no tiene formato válido.");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible cerrar la jornada.", {cause: error});
    }
  }

  async returnCount(countId: string, reason: string, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "devolverConteo");
    try {
      await callable({conteoId: countId, motivo: reason, claveIdempotencia: idempotencyKey});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible devolver el conteo.", {cause: error});
    }
  }

  async reassignCountCorrection(
    countId: string,
    newUserId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "reasignarCorreccionConteo");
    try {
      await callable({
        conteoId: countId,
        nuevoUsuarioId: newUserId,
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible reasignar la corrección.", {cause: error});
    }
  }

  async releaseReservation(reservationId: string, reason: string, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "liberarReservaLinea");
    try {
      await callable({reservaId: reservationId, motivo: reason, claveIdempotencia: idempotencyKey});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible liberar la reserva.", {cause: error});
    }
  }

  observeMonitor(
    user: MonitorUser,
    journeyId: string,
    onMonitorSnapshot: (snapshot: MonitorSnapshot) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe {
    let journeyDisplayName: string | undefined;
    let lines: MonitorLine[] = [];
    let reservations = new Map<string, MonitorReservation>();
    let counts = new Map<string, MonitorCount[]>();
    let returnReasons = new Map<string, string>();
    let inventories = new Map<string, MonitorInventory>();
    let reassignments = new Map<string, MonitorCorrectionResponsibility>();
    let correctionCandidates: MonitorCorrectionCandidate[] = [];

    const publish = () => {
      if (!journeyDisplayName) return;
      onMonitorSnapshot({
        journeyId,
        journeyDisplayName,
        lines: sortMonitorLines(lines.map((line) => {
          const history = (counts.get(line.id) ?? [])
            .map((count) => ({...count, returnReason: returnReasons.get(count.id)}))
            .sort((left, right) => left.version - right.version);
          return {
            ...line,
            reservation: reservations.get(line.id),
            count: history.find((count) => count.id === line.currentCountId) ?? history.at(-1),
            countHistory: history,
            inventory: inventories.get(line.lineId),
            ...(line.activeReassignmentId && reassignments.has(line.activeReassignmentId)
              ? {correctionResponsibility: reassignments.get(line.activeReassignmentId)}
              : {}),
          };
        })),
        correctionCandidates,
      });
    };
    const subscriptions = [
      onSnapshot(
        doc(this.firestore, "jornadas", journeyId),
        (snapshot) => {
          if (!snapshot.exists()) {
            onError("La jornada ficticia no existe.");
            return;
          }
          journeyDisplayName = typeof snapshot.data().nombreVisible === "string"
            ? snapshot.data().nombreVisible
            : journeyId;
          publish();
        },
        () => onError("No fue posible leer la jornada de prueba."),
      ),
      onSnapshot(
        query(collection(this.firestore, "jornadaLineas"), where("jornadaId", "==", journeyId)),
        (snapshot) => {
          lines = snapshot.docs.flatMap((documentSnapshot) => {
            const data = documentSnapshot.data();
            const location = parseLocation(data.ubicacion);
            if (
              !location ||
              typeof data.lineaId !== "string" ||
              !Number.isSafeInteger(data.version) ||
              !["DISPONIBLE", "EN_CONTEO", "PENDIENTE_REVISION", "DEVUELTA", "APROBADA"].includes(data.estadoCentral as string)
            ) {
              return [];
            }
            return [{
              id: documentSnapshot.id,
              lineId: data.lineaId,
              version: data.version,
              state: data.estadoCentral,
              location,
              ...(typeof data.conteoVigenteId === "string" ? {currentCountId: data.conteoVigenteId} : {}),
              ...(typeof data.reasignacionActivaId === "string"
                ? {activeReassignmentId: data.reasignacionActivaId}
                : {}),
            }];
          });
          publish();
        },
        () => onError("No fue posible leer las líneas de prueba."),
      ),
    ];

    if (user.canViewReservationDetails) {
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "reasignacionesCorreccion"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            reassignments = new Map(snapshot.docs.flatMap((documentSnapshot) => {
              const data = documentSnapshot.data();
              const assignedAt = data.reasignadaEn;
              if (
                typeof data.autorOriginalUsuarioId !== "string" ||
                typeof data.autorOriginalNombreVisible !== "string" ||
                typeof data.nuevoUsuarioId !== "string" ||
                typeof data.nuevoUsuarioNombreVisible !== "string" ||
                typeof data.actorUsuarioId !== "string" ||
                typeof data.actorNombreVisible !== "string" ||
                typeof data.motivo !== "string" ||
                !(assignedAt instanceof Timestamp)
              ) return [];
              return [[documentSnapshot.id, {
                reassignmentId: documentSnapshot.id,
                originalAuthorUserId: data.autorOriginalUsuarioId,
                originalAuthorDisplayName: data.autorOriginalNombreVisible,
                responsibleUserId: data.nuevoUsuarioId,
                responsibleDisplayName: data.nuevoUsuarioNombreVisible,
                assignedByUserId: data.actorUsuarioId,
                assignedByDisplayName: data.actorNombreVisible,
                reason: data.motivo,
                assignedAt: assignedAt.toDate().toISOString(),
              }] as const];
            }));
            publish();
          },
          () => onError("No fue posible leer las reasignaciones de corrección."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          collection(this.firestore, "jornadas", journeyId, "autorizaciones"),
          (snapshot) => {
            correctionCandidates = snapshot.docs.flatMap((documentSnapshot) => {
              const data = documentSnapshot.data();
              if (
                data.activa !== true ||
                data.usuarioActivo !== true ||
                data.puedeContar !== true ||
                typeof data.usuarioNombreVisible !== "string" ||
                !isRole(data.rolEfectivo)
              ) return [];
              return [{
                id: documentSnapshot.id,
                displayName: data.usuarioNombreVisible,
                role: data.rolEfectivo,
              }];
            }).sort((left, right) => left.displayName.localeCompare(right.displayName, "es"));
            publish();
          },
          () => onError("No fue posible leer las autorizaciones de la jornada."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "reservas"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            reservations = new Map(
              snapshot.docs.flatMap((documentSnapshot) => {
                const data = documentSnapshot.data();
                const timestamp = data.reservadaEn;
                if (
                  typeof data.jornadaLineaId !== "string" ||
                  data.estadoReserva !== "ACTIVA" ||
                  typeof data.usuarioNombreVisible !== "string" ||
                  typeof data.dispositivoId !== "string" ||
                  !["INICIAL", "CORRECCION"].includes((data.tipoReserva ?? "INICIAL") as string) ||
                  !(timestamp instanceof Timestamp)
                ) {
                  return [];
                }
                return [[
                  data.jornadaLineaId,
                  {
                    id: documentSnapshot.id,
                    userDisplayName: data.usuarioNombreVisible,
                    type: data.tipoReserva ?? "INICIAL",
                    deviceId: data.dispositivoId,
                    reservedAt: timestamp.toDate().toISOString(),
                  },
                ] as const];
              }),
            );
            publish();
          },
          () => onError("No fue posible leer las reservas operativas."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "conteos"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            const nextCounts = new Map<string, MonitorCount[]>();
            snapshot.docs.forEach((documentSnapshot) => {
                const data = documentSnapshot.data();
                const receivedAt = data.recibidoEn;
                if (
                  typeof data.jornadaLineaId !== "string" ||
                  typeof data.autorNombreVisible !== "string" ||
                  !isRole(data.rolEfectivo) ||
                  typeof data.dispositivoId !== "string" ||
                  !Number.isSafeInteger(data.hembras) ||
                  !Number.isSafeInteger(data.machos) ||
                  !Number.isSafeInteger(data.patrones) ||
                  !Number.isSafeInteger(data.total) ||
                  typeof data.timestampDispositivo !== "string" ||
                  !(receivedAt instanceof Timestamp) ||
                  !Number.isSafeInteger(data.versionNumero)
                ) {
                  return;
                }
                const count: MonitorCount = {
                  id: documentSnapshot.id,
                  authorUserId: data.autorUsuarioId,
                  authorDisplayName: data.autorNombreVisible,
                  effectiveRole: data.rolEfectivo,
                  deviceId: data.dispositivoId,
                  females: data.hembras,
                  males: data.machos,
                  rootstocks: data.patrones,
                  total: data.total,
                  ...(typeof data.observaciones === "string" && data.observaciones !== ""
                    ? {observations: data.observaciones}
                    : {}),
                  deviceTimestamp: data.timestampDispositivo,
                  serverTimestamp: receivedAt.toDate().toISOString(),
                  version: data.versionNumero,
                  ...(typeof data.conteoAnteriorId === "string"
                    ? {previousCountId: data.conteoAnteriorId}
                    : {}),
                };
                const history = nextCounts.get(data.jornadaLineaId) ?? [];
                history.push(count);
                nextCounts.set(data.jornadaLineaId, history);
              });
            counts = nextCounts;
            publish();
          },
          () => onError("No fue posible leer los conteos pendientes."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "decisionesRevision"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            returnReasons = new Map(snapshot.docs.flatMap((documentSnapshot) => {
              const data = documentSnapshot.data();
              if (data.decision !== "DEVOLVER" || typeof data.conteoId !== "string" || typeof data.motivo !== "string") {
                return [];
              }
              return [[data.conteoId, data.motivo] as const];
            }));
            publish();
          },
          () => onError("No fue posible leer los motivos de devolución."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "inventarioOficialLineas"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            inventories = new Map(
              snapshot.docs.flatMap((documentSnapshot) => {
                const data = documentSnapshot.data();
                if (
                  typeof data.lineaId !== "string" ||
                  !Number.isSafeInteger(data.hembras) ||
                  !Number.isSafeInteger(data.machos) ||
                  !Number.isSafeInteger(data.patrones) ||
                  !Number.isSafeInteger(data.total) ||
                  !Number.isSafeInteger(data.version)
                ) {
                  return [];
                }
                return [[data.lineaId, {
                  females: data.hembras,
                  males: data.machos,
                  rootstocks: data.patrones,
                  total: data.total,
                  version: data.version,
                }] as const];
              }),
            );
            publish();
          },
          () => onError("No fue posible leer el inventario oficial ficticio."),
        ),
      );
    }

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }
}

export class DisabledMonitorRepository implements MonitorRepository {
  readonly environment = "DISABLED";
  readonly emulatorEnabled = false;

  constructor(private readonly configurationError = "Configuración Firebase inválida. La aplicación permanece desconectada.") {}

  async signIn(): Promise<MonitorUser> {
    throw new Error(this.configurationError);
  }

  async signOut(): Promise<void> {}

  observeAccountStatus(): MonitorUnsubscribe {
    return () => undefined;
  }

  async listActiveJourneys(): Promise<readonly MonitorJourney[]> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async listManageableJourneys(): Promise<ManageableJourneysData> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async listManageableUsers(): Promise<readonly ManageableUser[]> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async listManageableCatalog(): Promise<ManageableCatalogData> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async createCatalogLocation(): Promise<ManageableCatalogLocation> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateCatalogLocation(): Promise<ManageableCatalogLocation> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async createCatalogLine(): Promise<ManageableCatalogLine> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateCatalogLine(): Promise<ManageableCatalogLine> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async registerInitialInventory(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async validateMigrationPackage(): Promise<MigrationValidationReport> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async importMigrationPackage(): Promise<MigrationImportResult> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async listMigrationImports(): Promise<readonly MigrationImportSummary[]> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async revertMigrationImport(): Promise<MigrationReversalResult> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateUserStatus(): Promise<ManageableUser> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateUserRole(): Promise<ManageableUser> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async createDraftJourney(): Promise<ManageableDraftJourney> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateDraftJourneyLines(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async listDraftJourneyParticipants(): Promise<DraftParticipantsData> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateDraftJourneyParticipants(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async activateDraftJourney(): Promise<DraftActivationResult> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async cancelDraftJourney(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async reopenCancelledJourney(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async closeJourney(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async approveCount(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async returnCount(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async reassignCountCorrection(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async releaseReservation(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  observeMonitor(): MonitorUnsubscribe {
    return () => undefined;
  }
}
