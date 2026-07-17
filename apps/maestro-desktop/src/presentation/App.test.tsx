import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import type {
  DraftActivationResult,
  DraftActivationVersions,
  DraftParticipantInput,
  DraftParticipantsData,
  ManageableDraftJourney,
  ManageableCatalogData,
  ManageableCatalogLine,
  ManageableCatalogLocation,
  ManageableJourneysData,
  ManageableUser,
  MigrationImportResult,
  MigrationImportSummary,
  MigrationReversalResult,
  MigrationValidationReport,
  MonitorJourney,
  MonitorRepository,
  MonitorSnapshot,
  MonitorUnsubscribe,
  MonitorUser,
} from "../domain/MonitorModels";
import {App} from "./App";

afterEach(cleanup);

const supervisor: MonitorUser = {
  id: "uid-supervisor",
  displayName: "Supervisor Pruebas",
  role: "SUPERVISOR",
  canViewReservationDetails: true,
  canReview: true,
  canRelease: true,
  canManageDraftJourneys: true,
  canManageUsers: false,
};

const pendingLine = {
  id: "JORNADA-1__LINEA-003",
  lineId: "LINEA-003",
  version: 1,
  state: "PENDIENTE_REVISION" as const,
  location: {
    nursery: "Vivero ficticio",
    module: "Módulo A",
    bed: "Cama 1",
    line: "Línea 3",
    displayName: "Línea ficticia 3",
    order: 3,
  },
  count: {
    id: "CONTEO-003",
    authorUserId: "uid-auxiliar-1",
    authorDisplayName: "Auxiliar Conteo",
    effectiveRole: "AUXILIAR" as const,
    deviceId: "DISPOSITIVO-FICTICIO",
    females: 450,
    males: 320,
    rootstocks: 210,
    total: 980,
    observations: "Sin novedad",
    deviceTimestamp: "2026-07-14T13:29:00.000Z",
    serverTimestamp: "2026-07-14T13:30:00.000Z",
    version: 1,
  },
  inventory: {females: 500, males: 300, rootstocks: 200, total: 1000, version: 1},
};

const snapshot: MonitorSnapshot = {
  journeyId: "JORNADA-DINAMICA-1",
  journeyDisplayName: "Jornada ficticia Etapa 5",
  lines: [pendingLine],
  correctionCandidates: [
    {id: "uid-auxiliar-1", displayName: "Auxiliar Conteo", role: "AUXILIAR"},
    {id: "uid-auxiliar-2", displayName: "Auxiliar Reasignado", role: "AUXILIAR"},
  ],
};

const journeyOne: MonitorJourney = {
  id: snapshot.journeyId,
  displayName: snapshot.journeyDisplayName,
  state: "ACTIVA",
  effectiveRole: "SUPERVISOR",
  canCount: true,
  lineCount: 1,
  version: 4,
  canClose: true,
};

class FakeMonitorRepository implements MonitorRepository {
  readonly environment: "EMULATOR" | "PRODUCTION" | "DISABLED" = "EMULATOR";
  readonly emulatorEnabled = true;
  private onSnapshot?: (snapshot: MonitorSnapshot) => void;
  private onAccountActiveChanged?: (active: boolean) => void;
  user: MonitorUser = supervisor;
  currentSnapshot: MonitorSnapshot = snapshot;
  journeys: readonly MonitorJourney[] = [journeyOne];
  activeJourneyListCalls = 0;
  snapshots = new Map<string, MonitorSnapshot>();
  observedJourneyIds: string[] = [];
  unsubscribeCount = 0;
  approved: Array<{countId: string; key: string; reason?: string}> = [];
  returned: Array<{countId: string; reason: string; key: string}> = [];
  reassigned: Array<{countId: string; newUserId: string; reason: string; key: string}> = [];
  released: Array<{reservationId: string; reason: string; key: string}> = [];
  manageableListCalls = 0;
  createdDrafts: Array<{name: string; key: string}> = [];
  updatedDrafts: Array<{journeyId: string; lineIds: readonly string[]; key: string}> = [];
  participantListCalls: string[] = [];
  updatedParticipants: Array<{
    journeyId: string;
    participants: readonly DraftParticipantInput[];
    key: string;
  }> = [];
  activatedDrafts: Array<{
    journeyId: string;
    versions: DraftActivationVersions;
    key: string;
  }> = [];
  cancelledDrafts: Array<{journeyId: string; expectedVersion: number; reason: string; key: string}> = [];
  reopenedDrafts: Array<{journeyId: string; expectedVersion: number; key: string}> = [];
  closedJourneys: Array<{journeyId: string; expectedVersion: number; key: string}> = [];
  activationErrors: string[] = [];
  statusUpdates: Array<{userId: string; version: number; active: boolean; reason: string; key: string}> = [];
  roleUpdates: Array<{userId: string; version: number; role: string; reason: string; key: string}> = [];
  catalogListCalls = 0;
  catalogChanged = 0;
  inventoryRegistrations: Array<{
    lineId: string; females: number; males: number; rootstocks: number; source: string; key: string;
  }> = [];
  migrationValidationCalls: unknown[] = [];
  migrationImportCalls: Array<{packageData: unknown; hash: string; key: string}> = [];
  migrationReversalCalls: Array<{importId: string; reason: string; key: string}> = [];
  migrationImports: MigrationImportSummary[] = [];
  migrationImportResult: MigrationImportResult = {
    importId: "IMPORTACION-PRUEBA-19", packageHash: "a".repeat(64), status: "APLICADA", version: 1,
    counts: {locations: 2, lines: 1, initialInventories: 1}, writes: 12,
    map: {
      locations: [{externalKey: "UB-PRUEBA", internalId: "UB-INTERNA", codeLockId: "b".repeat(64)}],
      lines: [{externalKey: "LINEA-PRUEBA", internalId: "LINEA-INTERNA", codeLockId: "c".repeat(64)}],
    },
    appliedByUserId: "uid-administrador", appliedAt: "2026-07-16T13:00:00.000Z",
  };
  migrationValidationReport: MigrationValidationReport = {
    format: "paquete-migracion-catalogo-v1",
    packageHash: "a".repeat(64),
    counts: {locations: 2, lines: 1, initialInventories: 1},
    blockingErrors: [{
      code: "CONFLICTO_OPERATIVO", severity: "ERROR", entity: "LINEA",
      externalKey: "LINEA-PRUEBA-1", message: "La línea está ocupada por una jornada activa.",
    }],
    warnings: [{
      code: "CODIGO_EXISTENTE", severity: "ADVERTENCIA", entity: "UBICACION",
      externalKey: "UB-PRUEBA", message: "El código ya existe en el emulador.",
    }],
    conflicts: {
      locations: {newItems: 1, matchingItems: 1, blockedItems: 0},
      lines: {newItems: 0, matchingItems: 0, blockedItems: 1},
      initialInventories: {newItems: 0, matchingItems: 0, blockedItems: 1},
      existingCodes: 1, incompatibleKeys: 0, linesWithCurrentInventory: 0, operationalConflicts: 1,
    },
    eligibleToImport: false,
    validationOnly: true,
  };
  manageableCatalog: ManageableCatalogData = {
    locations: [
      {id: "UBICACION-RAIZ", code: "RAIZ", type: "VIVERO", displayName: "Raíz ficticia", order: 1, active: true, version: 1, activeChildCount: 1, activeLineCount: 0},
      {id: "UBICACION-HIJA", code: "HIJA", type: "CAMA", parentId: "UBICACION-RAIZ", displayName: "Ubicación hija", order: 1, active: true, version: 1, activeChildCount: 0, activeLineCount: 2},
    ],
    lines: [
      {id: "LINEA-CATALOGO-1", locationId: "UBICACION-HIJA", code: "LINEA-1", displayName: "Línea libre", order: 1, active: true, version: 1, occupiedByActiveJourney: false, draftSelectionCount: 1},
      {id: "LINEA-CATALOGO-2", locationId: "UBICACION-HIJA", code: "LINEA-2", displayName: "Línea ocupada", order: 2, active: true, version: 1, occupiedByActiveJourney: true, draftSelectionCount: 0},
    ],
  };
  manageableUsers: ManageableUser[] = [
    {
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      active: true,
      version: 1,
      canChangeRole: true,
      activeWork: {
        activeJourneys: 0,
        activeReservations: 0,
        pendingCorrections: 0,
        hasActiveWork: false,
        roleChangeBlockers: [],
      },
    },
    {
      id: "uid-auxiliar-1",
      displayName: "Auxiliar Uno",
      role: "AUXILIAR",
      active: true,
      version: 1,
      canChangeRole: false,
      activeWork: {
        activeJourneys: 1,
        activeReservations: 1,
        pendingCorrections: 0,
        hasActiveWork: true,
        roleChangeBlockers: ["JORNADA_ACTIVA", "RESERVA_ACTIVA"],
      },
    },
    {
      id: "uid-inactivo-prueba",
      displayName: "Usuario Inactivo",
      role: "AUXILIAR",
      active: false,
      version: 2,
      canChangeRole: true,
      activeWork: {
        activeJourneys: 0,
        activeReservations: 0,
        pendingCorrections: 0,
        hasActiveWork: false,
        roleChangeBlockers: [],
      },
    },
  ];
  participantsData: DraftParticipantsData = {
    journeyId: "JORNADA-BORRADOR-1",
    state: "BORRADOR",
    version: 1,
    lineSelectionVersion: 1,
    participantSelectionVersion: 1,
    participants: [{
      id: "uid-auxiliar-1",
      displayName: "Auxiliar Uno",
      role: "AUXILIAR",
      canCount: true,
    }],
    activeUsers: [
      {id: "uid-auxiliar-1", displayName: "Auxiliar Uno", role: "AUXILIAR"},
      {id: "uid-auxiliar-2", displayName: "Auxiliar Dos", role: "AUXILIAR"},
      {id: "uid-supervisor", displayName: "Supervisor Pruebas", role: "SUPERVISOR"},
      {id: "uid-administrador", displayName: "Administrador Pruebas", role: "ADMINISTRADOR"},
    ],
  };
  manageableData: ManageableJourneysData = {
    journeys: [{
      id: "JORNADA-BORRADOR-1",
      displayName: "Borrador semanal",
      state: "BORRADOR",
      creatorUserId: "uid-supervisor",
      creatorDisplayName: "Supervisor Pruebas",
      version: 1,
      lineIds: ["LINEA-LIBRE-1"],
      createdAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T12:00:00.000Z",
    }],
    cancelledJourneys: [],
    catalogLines: [
      {
        id: "LINEA-LIBRE-1",
        displayName: "Linea libre 1",
        selectable: true,
        location: {
          nursery: "Vivero Norte",
          module: "Modulo 1",
          bed: "Cama A",
          line: "LINEA-LIBRE-1",
          displayName: "Linea libre 1",
          order: 1,
        },
      },
      {
        id: "LINEA-LIBRE-2",
        displayName: "Linea libre 2",
        selectable: true,
        location: {
          nursery: "Vivero Norte",
          module: "Modulo 1",
          bed: "Cama A",
          line: "LINEA-LIBRE-2",
          displayName: "Linea libre 2",
          order: 2,
        },
      },
      {
        id: "LINEA-ACTIVA-1",
        displayName: "Linea ocupada",
        selectable: false,
        unavailableReason: "JORNADA_ACTIVA",
        location: {
          nursery: "Vivero Norte",
          module: "Modulo 2",
          bed: "Cama B",
          line: "LINEA-ACTIVA-1",
          displayName: "Linea ocupada",
          order: 1,
        },
      },
    ],
  };

  async signIn(): Promise<MonitorUser> { return this.user; }
  async signOut(): Promise<void> {}
  observeAccountStatus(
    _userId: string,
    onActiveChanged: (active: boolean) => void,
  ): MonitorUnsubscribe {
    this.onAccountActiveChanged = onActiveChanged;
    return () => {
      this.onAccountActiveChanged = undefined;
    };
  }
  emitAccountActive(active: boolean) {
    this.onAccountActiveChanged?.(active);
  }
  async listManageableUsers(): Promise<readonly ManageableUser[]> {
    return this.manageableUsers;
  }
  async listManageableCatalog(): Promise<ManageableCatalogData> {
    this.catalogListCalls += 1;
    return this.manageableCatalog;
  }
  async createCatalogLocation(
    code: string,
    type: string,
    parentId: string | undefined,
    displayName: string,
    order: number,
  ): Promise<ManageableCatalogLocation> {
    const created: ManageableCatalogLocation = {
      id: `UBICACION-${this.catalogChanged + 1}`, code: code.trim().toUpperCase(), type,
      ...(parentId ? {parentId} : {}), displayName, order, active: true, version: 1,
      activeChildCount: 0, activeLineCount: 0,
    };
    this.catalogChanged += 1;
    this.manageableCatalog = {...this.manageableCatalog, locations: [...this.manageableCatalog.locations, created]};
    return created;
  }
  async updateCatalogLocation(
    location: ManageableCatalogLocation,
    displayName: string,
    order: number,
    active: boolean,
  ): Promise<ManageableCatalogLocation> {
    const updated = {...location, displayName, order, active, version: location.version + 1};
    this.catalogChanged += 1;
    this.manageableCatalog = {
      ...this.manageableCatalog,
      locations: this.manageableCatalog.locations.map((item) => item.id === location.id ? updated : item),
    };
    return updated;
  }
  async createCatalogLine(
    locationId: string,
    code: string,
    displayName: string,
    order: number,
  ): Promise<ManageableCatalogLine> {
    const created: ManageableCatalogLine = {
      id: `LINEA-NUEVA-${this.catalogChanged + 1}`, locationId, code: code.trim().toUpperCase(),
      displayName, order, active: true, version: 1, occupiedByActiveJourney: false, draftSelectionCount: 0,
    };
    this.catalogChanged += 1;
    this.manageableCatalog = {...this.manageableCatalog, lines: [...this.manageableCatalog.lines, created]};
    return created;
  }
  async updateCatalogLine(
    line: ManageableCatalogLine,
    displayName: string,
    order: number,
    active: boolean,
  ): Promise<ManageableCatalogLine> {
    const updated = {...line, displayName, order, active, version: line.version + 1};
    this.catalogChanged += 1;
    this.manageableCatalog = {
      ...this.manageableCatalog,
      lines: this.manageableCatalog.lines.map((item) => item.id === line.id ? updated : item),
    };
    return updated;
  }
  async registerInitialInventory(
    line: ManageableCatalogLine,
    females: number,
    males: number,
    rootstocks: number,
    source: string,
    key: string,
  ): Promise<void> {
    this.inventoryRegistrations.push({lineId: line.id, females, males, rootstocks, source, key});
    const updated: ManageableCatalogLine = {
      ...line,
      inventory: {
        females, males, rootstocks, total: females + males + rootstocks,
        version: 1, origin: "CARGA_INICIAL_ADMINISTRATIVA",
        actorUserId: "uid-administrador", actorDisplayName: "Administrador Pruebas",
        updatedAt: "2026-07-15T12:00:00.000Z", initialSourceReference: source,
      },
      initialInventoryEligible: false,
      initialInventoryIneligibleReason: "INVENTARIO_EXISTENTE",
    };
    this.catalogChanged += 1;
    this.manageableCatalog = {
      ...this.manageableCatalog,
      lines: this.manageableCatalog.lines.map((item) => item.id === line.id ? updated : item),
    };
  }
  async validateMigrationPackage(packageData: unknown): Promise<MigrationValidationReport> {
    this.migrationValidationCalls.push(packageData);
    return this.migrationValidationReport;
  }
  async importMigrationPackage(
    packageData: unknown,
    hash: string,
    key: string,
  ): Promise<MigrationImportResult> {
    this.migrationImportCalls.push({packageData, hash, key});
    this.migrationImports = [{
      importId: this.migrationImportResult.importId, packageHash: hash, status: "APLICADA", version: 1,
      counts: this.migrationImportResult.counts, writes: this.migrationImportResult.writes,
      appliedByUserId: "uid-administrador", appliedByDisplayName: "Administrador Pruebas",
      appliedAt: this.migrationImportResult.appliedAt, reversalEligible: true, reversalBlockers: [],
    }];
    return this.migrationImportResult;
  }
  async listMigrationImports(): Promise<readonly MigrationImportSummary[]> {
    return this.migrationImports;
  }
  async revertMigrationImport(
    migrationImport: MigrationImportSummary,
    reason: string,
    key: string,
  ): Promise<MigrationReversalResult> {
    this.migrationReversalCalls.push({importId: migrationImport.importId, reason, key});
    this.migrationImports = this.migrationImports.map((entry) => entry.importId === migrationImport.importId ? {
      ...entry, status: "REVERTIDA", version: entry.version + 1, reversalEligible: false,
      reversalBlockers: ["IMPORTACION_NO_APLICADA"], reversalReason: reason,
    } : entry);
    return {
      importId: migrationImport.importId, packageHash: migrationImport.packageHash, status: "REVERTIDA",
      version: migrationImport.version + 1, deletedDocuments: 8, revertedByUserId: "uid-administrador",
      revertedAt: "2026-07-16T14:00:00.000Z", reason,
    };
  }
  async updateUserStatus(
    userId: string,
    version: number,
    active: boolean,
    reason: string,
    key: string,
  ): Promise<ManageableUser> {
    this.statusUpdates.push({userId, version, active, reason, key});
    const current = this.manageableUsers.find((candidate) => candidate.id === userId);
    if (!current) throw new Error("Perfil inexistente");
    const updated = {...current, active, version: version + 1};
    this.manageableUsers = this.manageableUsers.map((candidate) => candidate.id === userId ? updated : candidate);
    return updated;
  }
  async updateUserRole(
    userId: string,
    version: number,
    role: MonitorUser["role"],
    reason: string,
    key: string,
  ): Promise<ManageableUser> {
    this.roleUpdates.push({userId, version, role, reason, key});
    const current = this.manageableUsers.find((candidate) => candidate.id === userId);
    if (!current) throw new Error("Perfil inexistente");
    const updated = {...current, role, version: version + 1};
    this.manageableUsers = this.manageableUsers.map((candidate) => candidate.id === userId ? updated : candidate);
    return updated;
  }
  async listActiveJourneys(): Promise<readonly MonitorJourney[]> {
    this.activeJourneyListCalls += 1;
    return this.journeys;
  }
  async listManageableJourneys(): Promise<ManageableJourneysData> {
    this.manageableListCalls += 1;
    return this.manageableData;
  }
  async createDraftJourney(name: string, key: string): Promise<ManageableDraftJourney> {
    this.createdDrafts.push({name, key});
    const draft: ManageableDraftJourney = {
      id: `JORNADA-BORRADOR-${this.createdDrafts.length + 1}`,
      displayName: name,
      state: "BORRADOR",
      creatorUserId: this.user.id,
      creatorDisplayName: this.user.displayName,
      version: 1,
      lineIds: [],
      createdAt: "2026-07-15T16:00:00.000Z",
      updatedAt: "2026-07-15T16:00:00.000Z",
    };
    this.manageableData = {...this.manageableData, journeys: [draft, ...this.manageableData.journeys]};
    return draft;
  }
  async updateDraftJourneyLines(journeyId: string, lineIds: readonly string[], key: string): Promise<void> {
    this.updatedDrafts.push({journeyId, lineIds, key});
    this.manageableData = {
      ...this.manageableData,
      journeys: this.manageableData.journeys.map((journey) => journey.id === journeyId
        ? {...journey, lineIds, version: journey.version + 1}
        : journey),
    };
    this.participantsData = {
      ...this.participantsData,
      version: this.participantsData.version + 1,
      lineSelectionVersion: this.participantsData.lineSelectionVersion + 1,
    };
  }
  async listDraftJourneyParticipants(journeyId: string): Promise<DraftParticipantsData> {
    this.participantListCalls.push(journeyId);
    return {...this.participantsData, journeyId};
  }
  async updateDraftJourneyParticipants(
    journeyId: string,
    participants: readonly DraftParticipantInput[],
    key: string,
  ): Promise<void> {
    this.updatedParticipants.push({journeyId, participants, key});
    const candidates = new Map(this.participantsData.activeUsers.map((user) => [user.id, user]));
    this.participantsData = {
      ...this.participantsData,
      journeyId,
      version: this.participantsData.version + 1,
      participantSelectionVersion: this.participantsData.participantSelectionVersion + 1,
      participants: participants.flatMap((participant) => {
        const user = candidates.get(participant.userId);
        return user ? [{...user, canCount: participant.canCount}] : [];
      }),
    };
  }
  async activateDraftJourney(
    journeyId: string,
    versions: DraftActivationVersions,
    key: string,
  ): Promise<DraftActivationResult> {
    this.activatedDrafts.push({journeyId, versions, key});
    const activationError = this.activationErrors.shift();
    if (activationError) throw new Error(activationError);
    const draft = this.manageableData.journeys.find((journey) => journey.id === journeyId);
    if (!draft) throw new Error("El borrador ya no existe.");
    const result: DraftActivationResult = {
      journeyId,
      state: "ACTIVA",
      version: versions.journey + 1,
      lineCount: draft.lineIds.length,
      participantCount: this.participantsData.participants.length,
      activatedAt: "2026-07-15T19:00:00.000Z",
    };
    this.manageableData = {
      ...this.manageableData,
      journeys: this.manageableData.journeys.filter((journey) => journey.id !== journeyId),
    };
    this.journeys = [...this.journeys, {
      id: journeyId,
      displayName: draft.displayName,
      state: "ACTIVA",
      effectiveRole: this.user.role,
      canCount: this.participantsData.participants.some((participant) => participant.canCount),
      lineCount: draft.lineIds.length,
      version: result.version,
      canClose: this.user.role === "ADMINISTRADOR" || draft.creatorUserId === this.user.id,
    }];
    return result;
  }
  async cancelDraftJourney(
    journeyId: string,
    expectedVersion: number,
    reason: string,
    key: string,
  ): Promise<void> {
    this.cancelledDrafts.push({journeyId, expectedVersion, reason, key});
    const draft = this.manageableData.journeys.find((journey) => journey.id === journeyId);
    if (!draft) throw new Error("El borrador ya no existe.");
    this.manageableData = {
      ...this.manageableData,
      journeys: this.manageableData.journeys.filter((journey) => journey.id !== journeyId),
      cancelledJourneys: [{
        id: draft.id,
        displayName: draft.displayName,
        state: "INACTIVA",
        inactiveType: "CANCELACION_BORRADOR",
        creatorUserId: draft.creatorUserId,
        creatorDisplayName: draft.creatorDisplayName,
        version: expectedVersion + 1,
        lineIds: draft.lineIds,
        participants: this.participantsData.participants,
        cancellationId: "CANCELACION-FAKE-1",
        cancelledByUserId: this.user.id,
        cancelledByDisplayName: this.user.displayName,
        cancellationReason: reason,
        cancelledAt: "2026-07-15T20:00:00.000Z",
        createdAt: draft.createdAt,
        updatedAt: "2026-07-15T20:00:00.000Z",
      }, ...this.manageableData.cancelledJourneys],
    };
  }
  async reopenCancelledJourney(journeyId: string, expectedVersion: number, key: string): Promise<void> {
    this.reopenedDrafts.push({journeyId, expectedVersion, key});
    const cancelled = this.manageableData.cancelledJourneys.find((journey) => journey.id === journeyId);
    if (!cancelled) throw new Error("El borrador cancelado ya no existe.");
    const reopened: ManageableDraftJourney = {
      id: cancelled.id,
      displayName: cancelled.displayName,
      state: "BORRADOR",
      creatorUserId: cancelled.creatorUserId,
      creatorDisplayName: cancelled.creatorDisplayName,
      version: expectedVersion + 1,
      lineIds: cancelled.lineIds,
      createdAt: cancelled.createdAt,
      updatedAt: "2026-07-15T20:30:00.000Z",
    };
    this.manageableData = {
      ...this.manageableData,
      journeys: [reopened, ...this.manageableData.journeys],
      cancelledJourneys: this.manageableData.cancelledJourneys.filter((journey) => journey.id !== journeyId),
    };
    this.participantsData = {
      ...this.participantsData,
      journeyId,
      version: reopened.version,
      participants: cancelled.participants,
    };
  }
  async closeJourney(journeyId: string, expectedVersion: number, key: string): Promise<void> {
    this.closedJourneys.push({journeyId, expectedVersion, key});
    this.journeys = this.journeys.filter((journey) => journey.id !== journeyId);
  }
  async approveCount(countId: string, key: string, reason?: string): Promise<void> {
    this.approved.push({countId, key, ...(reason === undefined ? {} : {reason})});
  }
  async returnCount(countId: string, reason: string, key: string): Promise<void> {
    this.returned.push({countId, reason, key});
  }
  async reassignCountCorrection(countId: string, newUserId: string, reason: string, key: string): Promise<void> {
    this.reassigned.push({countId, newUserId, reason, key});
  }
  async releaseReservation(reservationId: string, reason: string, key: string): Promise<void> {
    this.released.push({reservationId, reason, key});
  }
  observeMonitor(
    _user: MonitorUser,
    journeyId: string,
    onSnapshot: (snapshot: MonitorSnapshot) => void,
  ): MonitorUnsubscribe {
    this.observedJourneyIds.push(journeyId);
    this.onSnapshot = onSnapshot;
    onSnapshot(this.snapshots.get(journeyId) ?? this.currentSnapshot);
    return () => {
      this.unsubscribeCount += 1;
      this.onSnapshot = undefined;
    };
  }
  publish(nextSnapshot: MonitorSnapshot): void { this.onSnapshot?.(nextSnapshot); }
}

async function signIn(repository: FakeMonitorRepository): Promise<void> {
  render(<App repository={repository} />);
  fireEvent.change(screen.getByLabelText("Correo"), {target: {value: "supervisor@prueba.local"}});
  fireEvent.change(screen.getByLabelText("Contraseña"), {target: {value: "secreto"}});
  fireEvent.click(screen.getByRole("button", {name: "Iniciar sesión"}));
  await screen.findByRole("heading", {name: "Jornada ficticia Etapa 5"});
}

describe("bandeja de revisión de Vivero Maestro", () => {
  it("identifica production y mantiene habilitado el acceso", () => {
    const repository = new FakeMonitorRepository();
    Object.defineProperty(repository, "environment", {value: "PRODUCTION"});

    render(<App repository={repository} />);

    expect(screen.getByText("PRODUCCIÓN")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Iniciar sesión"})).toBeEnabled();
    expect(screen.getByText(/cuenta autorizada/)).toBeInTheDocument();
  });

  it("habilita en production las operaciones completas del rol administrador", async () => {
    const repository = new FakeMonitorRepository();
    Object.defineProperty(repository, "environment", {value: "PRODUCTION"});
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      canManageUsers: true,
      canManageCatalog: true,
    };
    repository.manageableCatalog = {
      ...repository.manageableCatalog,
      lines: repository.manageableCatalog.lines.map((line) => ({...line, initialInventoryEligible: true})),
    };
    repository.currentSnapshot = {
      ...snapshot,
      lines: [
        pendingLine,
        {
          ...pendingLine,
          id: "JORNADA-1__LINEA-EN-CONTEO",
          lineId: "LINEA-EN-CONTEO",
          state: "EN_CONTEO",
          location: {...pendingLine.location, displayName: "Línea en conteo"},
          reservation: {
            id: "RESERVA-PRODUCTION-1",
            userDisplayName: "Auxiliar Conteo",
            type: "INICIAL",
            deviceId: "DISPOSITIVO-PRODUCTION",
            reservedAt: "2026-07-15T14:00:00.000Z",
          },
        },
        {
          ...pendingLine,
          id: "JORNADA-1__LINEA-DEVUELTA",
          lineId: "LINEA-DEVUELTA",
          state: "DEVUELTA",
          location: {...pendingLine.location, displayName: "Línea devuelta"},
          count: {...pendingLine.count, returnReason: "Recontar"},
        },
      ],
    };

    await signIn(repository);
    for (const action of ["Cerrar jornada", "Aprobar", "Devolver"]) {
      expect(screen.getByRole("button", {name: action})).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "EN_CONTEO"}});
    expect(screen.getByRole("button", {name: "Liberar reserva"})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "DEVUELTA"}});
    expect(screen.getByRole("button", {name: /Reasignar|Corregir/i})).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "Usuarios"}));
    await screen.findByRole("heading", {name: "Usuarios"});
    expect(screen.getByText("Auxiliar Uno")).toBeInTheDocument();
    expect(screen.getAllByRole("button", {name: "Cambiar rol"}).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", {name: /Desactivar|Reactivar/}).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", {name: /Catálogo/}));
    await screen.findByRole("heading", {name: /Catálogo/});
    expect(screen.getByRole("button", {name: /Nueva ubicación raíz/})).toBeInTheDocument();
    expect(screen.getAllByRole("button", {name: /Nueva línea/}).length).toBeGreaterThan(0);
    for (const action of [/Editar ubicación/i, /Editar línea/i, /Registrar inventario inicial/i]) {
      expect(screen.getAllByRole("button", {name: action}).length).toBeGreaterThan(0);
    }

    expect(screen.getByRole("button", {name: /Migración/})).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    await screen.findByRole("heading", {name: "Jornadas"});
    expect(screen.getByRole("button", {name: "Crear borrador"})).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    expect(screen.getByRole("button", {name: "Revisar selección"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Revisar participantes"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Activar jornada"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Cancelar borrador"})).toBeInTheDocument();
  });

  it("permite reabrir borradores cancelados en production", async () => {
    const repository = new FakeMonitorRepository();
    Object.defineProperty(repository, "environment", {value: "PRODUCTION"});
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      canManageUsers: true,
      canManageCatalog: true,
    };
    await repository.cancelDraftJourney(
      "JORNADA-BORRADOR-1",
      1,
      "Cancelación previa de prueba",
      "cancelacion-production-prueba-0001",
    );

    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    expect(screen.getByText(/BORRADOR CANCELADO/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Reabrir borrador"})).toBeInTheDocument();
  });

  it("conserva en production el recorrido de preparación y activación", async () => {
    const repository = new FakeMonitorRepository();
    Object.defineProperty(repository, "environment", {value: "PRODUCTION"});
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      canManageUsers: true,
      canManageCatalog: true,
    };
    repository.participantsData = {
      ...repository.participantsData,
      participants: [
        ...repository.participantsData.participants,
        {id: "uid-administrador", displayName: "Administrador Pruebas", role: "ADMINISTRADOR", canCount: false},
      ],
    };

    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: /Catálogo/}));
    await screen.findByRole("heading", {name: /Catálogo/});
    fireEvent.click(screen.getByRole("button", {name: /Nueva ubicación raíz/}));
    fireEvent.change(screen.getByLabelText("Código"), {target: {value: "PRODUCTION-PRUEBA"}});
    fireEvent.change(screen.getByLabelText("Tipo técnico"), {target: {value: "FIXTURE"}});
    fireEvent.change(screen.getByLabelText("Nombre visible"), {target: {value: "Ubicación production prueba"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear"}));
    await screen.findByText("Ubicación creada mediante operación central.");
    const createdLocation = screen.getByText("Ubicación production prueba").closest("details");
    expect(createdLocation).not.toBeNull();
    fireEvent.click(within(createdLocation!).getByRole("button", {name: /Nueva línea/}));
    fireEvent.change(screen.getByLabelText("Código"), {target: {value: "LINEA-PRODUCTION"}});
    fireEvent.change(screen.getByLabelText("Nombre visible"), {target: {value: "Línea production prueba"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear"}));
    await screen.findByText("Línea creada mediante operación central.");
    expect(screen.getByText("Línea production prueba")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    await screen.findByRole("heading", {name: "Jornadas"});
    fireEvent.change(screen.getByLabelText("Nombre de la nueva jornada"), {
      target: {value: "Borrador production"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Crear borrador"}));
    await waitFor(() => expect(repository.createdDrafts).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    fireEvent.click(screen.getByRole("checkbox", {name: /Linea libre 2/}));
    fireEvent.click(screen.getByRole("button", {name: "Revisar selección"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar y guardar"}));
    await waitFor(() => expect(repository.updatedDrafts).toHaveLength(1));
    await screen.findByText("Auxiliar Uno");
    const reviewParticipants = screen.getByRole("button", {name: "Revisar participantes"});
    await waitFor(() => expect(reviewParticipants).toBeEnabled());
    fireEvent.click(reviewParticipants);
    fireEvent.click(await screen.findByRole("button", {name: "Confirmar participantes"}));
    await waitFor(() => expect(repository.updatedParticipants).toHaveLength(1));
    const activateButton = screen.getByRole("button", {name: "Activar jornada"});
    await waitFor(() => expect(activateButton).toBeEnabled());
    fireEvent.click(activateButton);
    fireEvent.click(screen.getByRole("button", {name: "Confirmar activación"}));
    await waitFor(() => expect(repository.activatedDrafts).toHaveLength(1));
    expect(await screen.findByText(/Jornada activada correctamente/)).toHaveTextContent("Campo ya puede verla");
  });

  it("selecciona automáticamente una única jornada autorizada", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    expect(repository.observedJourneyIds).toEqual([snapshot.journeyId]);
    expect(screen.getByLabelText("Jornada activa")).toHaveValue(snapshot.journeyId);
  });

  it("muestra selector cuando hay varias jornadas y cambia suscripciones sin mezclar datos", async () => {
    const repository = new FakeMonitorRepository();
    const secondJourney: MonitorJourney = {
      id: "JORNADA-DINAMICA-2",
      displayName: "Jornada dinámica 2",
      state: "ACTIVA",
      effectiveRole: "SUPERVISOR",
      canCount: true,
      lineCount: 1,
      version: 2,
      canClose: true,
    };
    const secondSnapshot: MonitorSnapshot = {
      journeyId: secondJourney.id,
      journeyDisplayName: secondJourney.displayName,
      lines: [{
        ...pendingLine,
        id: "JORNADA-DINAMICA-2__LINEA-101",
        lineId: "LINEA-101",
        location: {...pendingLine.location, displayName: "Línea exclusiva jornada 2", line: "Línea 101"},
      }],
      correctionCandidates: [],
    };
    repository.journeys = [journeyOne, secondJourney];
    repository.snapshots.set(journeyOne.id, snapshot);
    repository.snapshots.set(secondJourney.id, secondSnapshot);

    render(<App repository={repository} />);
    fireEvent.change(screen.getByLabelText("Correo"), {target: {value: "supervisor@prueba.local"}});
    fireEvent.change(screen.getByLabelText("Contraseña"), {target: {value: "secreto"}});
    fireEvent.click(screen.getByRole("button", {name: "Iniciar sesión"}));
    await screen.findByRole("heading", {name: "Selecciona una jornada activa"});
    expect(repository.observedJourneyIds).toEqual([]);

    fireEvent.change(screen.getByLabelText("Jornada activa"), {target: {value: journeyOne.id}});
    await screen.findByRole("heading", {name: snapshot.journeyDisplayName});
    expect(screen.getByText(pendingLine.location.displayName)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Jornada activa"), {target: {value: secondJourney.id}});
    await screen.findByRole("heading", {name: secondJourney.displayName});
    expect(screen.getByText("Línea exclusiva jornada 2")).toBeInTheDocument();
    expect(screen.queryByText(pendingLine.location.displayName)).not.toBeInTheDocument();
    expect(repository.observedJourneyIds).toEqual([journeyOne.id, secondJourney.id]);
    expect(repository.unsubscribeCount).toBe(1);
  });

  it("presenta conteo, inventario vigente y diferencia", async () => {
    await signIn(new FakeMonitorRepository());
    expect(screen.getByText("Auxiliar Conteo · AUXILIAR")).toBeInTheDocument();
    expect(screen.getByText("DISPOSITIVO-FICTICIO")).toBeInTheDocument();
    expect(screen.getByText("Inventario actual").nextSibling).toHaveTextContent("1000");
    expect(screen.getByText("Diferencia total").nextSibling).toHaveTextContent("-20");
  });

  it("actualiza la bandeja mediante snapshot en tiempo real", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    act(() => repository.publish({...snapshot, lines: []}));
    await screen.findByText("No hay líneas que coincidan con el filtro.");
  });

  it("bloquea el cierre y muestra el motivo exacto mientras existe trabajo pendiente", async () => {
    await signIn(new FakeMonitorRepository());
    const closeButton = screen.getByRole("button", {name: "Cerrar jornada"});
    expect(closeButton).toBeDisabled();
    expect(screen.getByText("1 línea(s) todavía no tienen estado APROBADA.")).toBeInTheDocument();
  });

  it("confirma el cierre aprobado, usa la version observada y retira la jornada activa", async () => {
    const repository = new FakeMonitorRepository();
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, state: "APROBADA", reservation: undefined}],
    };
    await signIn(repository);
    const closeButton = screen.getByRole("button", {name: "Cerrar jornada"});
    expect(closeButton).toBeEnabled();
    fireEvent.click(closeButton);
    expect(screen.getByLabelText("Resumen del cierre")).toHaveTextContent("Líneas aprobadas: 1");
    expect(screen.getByText(/dejará de estar disponible en Vivero Campo/)).toBeInTheDocument();
    const confirmation = screen.getByRole("checkbox", {name: /Confirmo que deseo cerrar/});
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", {name: "Confirmar cierre"}));
    await waitFor(() => expect(repository.closedJourneys).toHaveLength(1));
    expect(repository.closedJourneys[0]).toMatchObject({
      journeyId: journeyOne.id,
      expectedVersion: journeyOne.version,
    });
    expect(await screen.findByText(/Jornada cerrada/)).toHaveTextContent("líneas quedaron liberadas");
    expect(screen.getByLabelText("Jornada activa")).toHaveValue("");
  });

  it("no ofrece cerrar al supervisor que no creo la jornada", async () => {
    const repository = new FakeMonitorRepository();
    repository.journeys = [{...journeyOne, canClose: false}];
    await signIn(repository);
    expect(screen.queryByRole("button", {name: "Cerrar jornada"})).not.toBeInTheDocument();
  });

  it("muestra historial, motivo de devolución y marca la versión vigente", async () => {
    const repository = new FakeMonitorRepository();
    const previous = {
      ...pendingLine.count,
      id: "CONTEO-002",
      version: 1,
      total: 990,
      returnReason: "Recontar patrones.",
    };
    const current = {...pendingLine.count, version: 2, previousCountId: previous.id};
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, count: current, countHistory: [previous, current]}],
    };

    await signIn(repository);

    expect(screen.getByText("Versión 1 · Anterior inmutable")).toBeInTheDocument();
    expect(screen.getByText("Versión 2 · Vigente")).toBeInTheDocument();
    expect(screen.getByText("Motivo de devolución: Recontar patrones.")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Editar versión/i})).not.toBeInTheDocument();
  });

  it("muestra resumen no editable y confirma una aprobación", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Aprobar"}));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Inventario anterior → Conteo nuevo → Diferencia")).toBeInTheDocument();
    expect(screen.getByText("Total: 1000 → 980 → -20")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", {name: /Hembras|Machos|Patrones|Total/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Confirmar aprobación"}));
    await waitFor(() => expect(repository.approved).toHaveLength(1));
    expect(repository.approved[0]?.countId).toBe("CONTEO-003");
  });

  it("exige motivo y confirma una devolución", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Devolver"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar devolución"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el motivo");
    fireEvent.change(screen.getByLabelText("Motivo de devolución"), {target: {value: "Repetir patrones"}});
    fireEvent.click(screen.getByRole("button", {name: "Confirmar devolución"}));
    await waitFor(() => expect(repository.returned).toHaveLength(1));
    expect(repository.returned[0]).toMatchObject({countId: "CONTEO-003", reason: "Repetir patrones"});
  });

  it("impide al supervisor aprobar su propio conteo", async () => {
    const repository = new FakeMonitorRepository();
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, count: {...pendingLine.count, authorUserId: supervisor.id}}],
    };
    await signIn(repository);
    expect(screen.getByRole("button", {name: "Aprobar"})).toBeDisabled();
    expect(screen.getByText("Un supervisor no puede aprobar su propio conteo.")).toBeInTheDocument();
  });

  it("advierte y exige motivo al administrador que aprueba su propio conteo", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      role: "ADMINISTRADOR",
      canManageUsers: true,
    };
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, count: {...pendingLine.count, authorUserId: "uid-administrador"}}],
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Aprobar"}));
    expect(screen.getByText(/aprobarás excepcionalmente tu propio conteo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Confirmar aprobación"}));
    expect(screen.getByRole("alert")).toHaveTextContent("exige un motivo");
    fireEvent.change(screen.getByLabelText("Motivo de la excepción"), {target: {value: "Única cuenta maestra ficticia"}});
    fireEvent.click(screen.getByRole("button", {name: "Confirmar aprobación"}));
    await waitFor(() => expect(repository.approved[0]?.reason).toBe("Única cuenta maestra ficticia"));
  });

  it("oculta detalle y acciones a una cuenta auxiliar", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      id: "uid-auxiliar-1",
      displayName: "Auxiliar",
      role: "AUXILIAR",
      canViewReservationDetails: false,
      canReview: false,
      canRelease: false,
      canManageDraftJourneys: false,
      canManageUsers: false,
    };
    await signIn(repository);
    expect(screen.getByText(/detalle restringido/)).toBeInTheDocument();
    expect(screen.queryByText("Auxiliar Conteo · AUXILIAR")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Aprobar"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Devolver"})).not.toBeInTheDocument();
  });

  it("no ofrece edición directa, liberación ni reasignación", async () => {
    await signIn(new FakeMonitorRepository());
    for (const action of ["Editar", "Modificar", "Liberar", "Reasignar"]) {
      expect(screen.queryByRole("button", {name: new RegExp(action, "i")})).not.toBeInTheDocument();
    }
  });

  it("muestra la asignacion y confirma una reasignacion con resumen", async () => {
    const repository = new FakeMonitorRepository();
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{
        ...pendingLine,
        state: "DEVUELTA",
        count: {...pendingLine.count, returnReason: "Recontar toda la linea."},
        correctionResponsibility: {
          reassignmentId: "REASIGNACION-ANTERIOR",
          originalAuthorUserId: "uid-auxiliar-1",
          originalAuthorDisplayName: "Auxiliar Conteo",
          responsibleUserId: "uid-supervisor",
          responsibleDisplayName: "Supervisor Pruebas",
          assignedByUserId: "uid-administrador",
          assignedByDisplayName: "Administrador Pruebas",
          reason: "Primer responsable ausente",
          assignedAt: "2026-07-15T14:00:00.000Z",
        },
      }],
    };
    await signIn(repository);
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "DEVUELTA"}});
    fireEvent.click(screen.getByRole("button", {name: /Reasignar correcci/}));
    fireEvent.change(screen.getByLabelText("Nuevo responsable"), {target: {value: "uid-auxiliar-2"}});
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), {target: {value: "El responsable actual no esta disponible"}});
    fireEvent.click(screen.getByRole("button", {name: /Revisar reasignaci/}));
    expect(screen.getByLabelText(/Resumen de reasignaci/)).toHaveTextContent("Auxiliar Reasignado");
    fireEvent.click(screen.getByRole("button", {name: /Confirmar reasignaci/}));
    await waitFor(() => expect(repository.reassigned).toHaveLength(1));
    expect(repository.reassigned[0]).toMatchObject({
      countId: "CONTEO-003",
      newUserId: "uid-auxiliar-2",
      reason: "El responsable actual no esta disponible",
    });
  });

  it("no ofrece reasignacion a un auxiliar", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      id: "uid-auxiliar-1",
      displayName: "Auxiliar",
      role: "AUXILIAR",
      canViewReservationDetails: false,
      canReview: false,
      canRelease: false,
      canManageDraftJourneys: false,
      canManageUsers: false,
    };
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, state: "DEVUELTA", count: {...pendingLine.count, returnReason: "Recontar"}}],
    };
    await signIn(repository);
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "DEVUELTA"}});
    expect(screen.queryByRole("button", {name: /Reasignar/i})).not.toBeInTheDocument();
  });

  it("muestra hechos, exige motivo y confirma una liberacion normal", async () => {
    const repository = new FakeMonitorRepository();
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{
        ...pendingLine,
        state: "EN_CONTEO",
        version: 7,
        reservation: {
          id: "RESERVA-ACTIVA-001",
          userDisplayName: "Auxiliar Conteo",
          type: "INICIAL",
          deviceId: "DISPOSITIVO-FICTICIO",
          reservedAt: "2026-07-15T14:00:00.000Z",
        },
      }],
    };
    await signIn(repository);
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "EN_CONTEO"}});
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText("Versión de línea").nextSibling).toHaveTextContent("7");
    fireEvent.click(screen.getByRole("button", {name: "Liberar reserva"}));
    expect(screen.getByText(/Puede existir un borrador local sin enviar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Revisar liberación"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el motivo");
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), {
      target: {value: "Titular no puede continuar"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Revisar liberación"}));
    expect(screen.getByLabelText("Resumen de liberación")).toHaveTextContent("Estado resultante: DISPONIBLE");
    fireEvent.click(screen.getByRole("button", {name: "Confirmar liberación"}));
    await waitFor(() => expect(repository.released).toHaveLength(1));
    expect(repository.released[0]).toMatchObject({
      reservationId: "RESERVA-ACTIVA-001",
      reason: "Titular no puede continuar",
    });
  });

  it("informa que una reserva de correccion regresara a DEVUELTA", async () => {
    const repository = new FakeMonitorRepository();
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{
        ...pendingLine,
        state: "EN_CONTEO",
        reservation: {
          id: "RESERVA-CORRECCION-001",
          userDisplayName: "Auxiliar Reasignado",
          type: "CORRECCION",
          deviceId: "DISPOSITIVO-CORRECCION",
          reservedAt: "2026-07-15T14:00:00.000Z",
        },
      }],
    };
    await signIn(repository);
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "EN_CONTEO"}});
    fireEvent.click(screen.getByRole("button", {name: "Liberar reserva"}));
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), {target: {value: "Corrección interrumpida"}});
    fireEvent.click(screen.getByRole("button", {name: "Revisar liberación"}));
    expect(screen.getByLabelText("Resumen de liberación")).toHaveTextContent("Estado resultante: DEVUELTA");
  });
});

describe("jornadas en borrador de Vivero Maestro", () => {
  it("muestra la seccion Jornadas solo a supervision y lista sus borradores", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    await screen.findByRole("heading", {name: "Jornadas"});
    expect(screen.getByText("BORRADOR — AÚN NO DISPONIBLE EN CAMPO")).toBeInTheDocument();
    expect(await screen.findByText("Borrador semanal")).toBeInTheDocument();
    expect(repository.manageableListCalls).toBe(1);
    for (const action of ["Activar", "Cerrar jornada", "Cancelar jornada", "Eliminar"]) {
      expect(screen.queryByRole("button", {name: new RegExp(action, "i")})).not.toBeInTheDocument();
    }
  });

  it("crea una jornada incompleta y mantiene la activacion bloqueada", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    await screen.findByRole("heading", {name: "Jornadas"});
    fireEvent.change(screen.getByLabelText("Nombre de la nueva jornada"), {
      target: {value: "Borrador creado desde Maestro"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Crear borrador"}));
    await waitFor(() => expect(repository.createdDrafts).toHaveLength(1));
    expect(repository.createdDrafts[0]?.name).toBe("Borrador creado desde Maestro");
    expect((await screen.findAllByText("Borrador creado desde Maestro")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", {name: "Activar jornada"})).toBeDisabled();
  });

  it("agrupa, filtra y guarda una seleccion sin duplicados mediante confirmacion", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    await screen.findByRole("heading", {name: "Jornadas"});
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    expect(screen.getByText("Vivero Norte · Modulo 1 · Cama A")).toBeInTheDocument();
    expect(screen.getByText("Ya pertenece a una jornada activa")).toBeInTheDocument();
    const occupied = screen.getByRole("checkbox", {name: /Linea ocupada/});
    expect(occupied).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", {name: /Linea libre 2/}));
    fireEvent.click(screen.getByRole("button", {name: "Revisar selección"}));
    expect(screen.getByLabelText("Resumen de selección de líneas")).toHaveTextContent("Líneas seleccionadas: 2");
    fireEvent.click(screen.getByRole("button", {name: "Confirmar y guardar"}));
    await waitFor(() => expect(repository.updatedDrafts).toHaveLength(1));
    expect(repository.updatedDrafts[0]).toMatchObject({
      journeyId: "JORNADA-BORRADOR-1",
      lineIds: ["LINEA-LIBRE-1", "LINEA-LIBRE-2"],
    });
    expect(new Set(repository.updatedDrafts[0]?.lineIds).size).toBe(2);
  });

  it("no consulta ni muestra borradores a un auxiliar", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      id: "uid-auxiliar-1",
      displayName: "Auxiliar",
      role: "AUXILIAR",
      canViewReservationDetails: false,
      canReview: false,
      canRelease: false,
      canManageDraftJourneys: false,
      canManageUsers: false,
    };
    await signIn(repository);
    expect(screen.queryByRole("button", {name: "Jornadas"})).not.toBeInTheDocument();
    expect(repository.manageableListCalls).toBe(0);
    expect(repository.participantListCalls).toHaveLength(0);
  });

  it("muestra usuarios activos con nombre y rol dentro del borrador", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    expect(await screen.findByRole("heading", {name: "Participantes"})).toBeInTheDocument();
    expect(screen.getByText("BORRADOR — LOS PARTICIPANTES AÚN NO TIENEN AUTORIZACIÓN OPERATIVA")).toBeInTheDocument();
    expect(screen.getByText("Auxiliar Uno")).toBeInTheDocument();
    expect(screen.getByText("Supervisor Pruebas")).toBeInTheDocument();
    expect(repository.participantListCalls).toEqual(["JORNADA-BORRADOR-1"]);
  });

  it("busca, filtra y confirma participantes sin duplicados", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    await screen.findByRole("heading", {name: "Participantes"});
    fireEvent.change(screen.getByLabelText("Filtrar participantes por rol"), {target: {value: "AUXILIAR"}});
    expect(screen.queryByText("Supervisor Pruebas")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar participante"), {target: {value: "Dos"}});
    fireEvent.click(screen.getByRole("checkbox", {name: "Seleccionar Auxiliar Dos"}));
    const canCount = screen.getByRole("checkbox", {name: "Puede contar Auxiliar Dos"});
    expect(canCount).toBeChecked();
    fireEvent.click(canCount);
    fireEvent.click(screen.getByRole("button", {name: "Revisar participantes"}));
    expect(screen.getByLabelText("Resumen de participantes")).toHaveTextContent("Participantes: 2");
    expect(screen.getByLabelText("Resumen de participantes")).toHaveTextContent("Con permiso para contar: 1");
    fireEvent.click(screen.getByRole("button", {name: "Confirmar participantes"}));
    await waitFor(() => expect(repository.updatedParticipants).toHaveLength(1));
    expect(repository.updatedParticipants[0]).toMatchObject({
      journeyId: "JORNADA-BORRADOR-1",
      participants: [
        {userId: "uid-auxiliar-1", canCount: true},
        {userId: "uid-auxiliar-2", canCount: false},
      ],
    });
    expect(new Set(repository.updatedParticipants[0]?.participants.map((participant) => participant.userId)).size).toBe(2);
  });

  it("resume y activa una jornada preparada con las tres versiones observadas", async () => {
    const repository = new FakeMonitorRepository();
    repository.participantsData = {
      ...repository.participantsData,
      participants: [
        ...repository.participantsData.participants,
        {
          id: "uid-supervisor",
          displayName: "Supervisor Pruebas",
          role: "SUPERVISOR",
          canCount: false,
        },
      ],
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    const activateButton = await screen.findByRole("button", {name: "Activar jornada"});
    expect(activateButton).toBeEnabled();
    fireEvent.click(activateButton);
    const summary = screen.getByLabelText("Resumen de activación de jornada");
    expect(summary).toHaveTextContent("Borrador semanal");
    expect(summary).toHaveTextContent("Líneas: 1");
    expect(summary).toHaveTextContent("Auxiliar Uno · Auxiliar · Puede contar");
    expect(summary).toHaveTextContent("Supervisor Pruebas · Supervisor · No cuenta");
    expect(screen.getByText(/Campo podrá ver esta jornada/)).toBeInTheDocument();
    expect(screen.getByText(/no podrá editarse/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Confirmar activación"}));
    await waitFor(() => expect(repository.activatedDrafts).toHaveLength(1));
    expect(repository.activatedDrafts[0]).toMatchObject({
      journeyId: "JORNADA-BORRADOR-1",
      versions: {journey: 1, lineSelection: 1, participantSelection: 1},
    });
    expect(await screen.findByText(/Jornada activada correctamente/)).toHaveTextContent("Campo ya puede verla");
    expect(screen.queryByRole("button", {name: /Borrador semanal/})).not.toBeInTheDocument();
    expect(repository.activeJourneyListCalls).toBe(2);
  });

  it("conserva la clave al recuperar una respuesta fallida y muestra conflictos centrales", async () => {
    const repository = new FakeMonitorRepository();
    repository.participantsData = {
      ...repository.participantsData,
      participants: [
        ...repository.participantsData.participants,
        {id: "uid-supervisor", displayName: "Supervisor Pruebas", role: "SUPERVISOR", canCount: false},
      ],
    };
    repository.activationErrors.push("No fue posible recibir la confirmación central.");
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    fireEvent.click(await screen.findByRole("button", {name: "Activar jornada"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar activación"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("confirmación central");
    fireEvent.click(screen.getByRole("button", {name: "Confirmar activación"}));
    await waitFor(() => expect(repository.activatedDrafts).toHaveLength(2));
    expect(repository.activatedDrafts[1]?.key).toBe(repository.activatedDrafts[0]?.key);
    expect(await screen.findByText(/Jornada activada correctamente/)).toBeInTheDocument();
  });

  it("mantiene el borrador cuando el backend informa una linea ocupada", async () => {
    const repository = new FakeMonitorRepository();
    repository.participantsData = {
      ...repository.participantsData,
      participants: [
        ...repository.participantsData.participants,
        {id: "uid-supervisor", displayName: "Supervisor Pruebas", role: "SUPERVISOR", canCount: false},
      ],
    };
    repository.activationErrors.push("Una línea seleccionada ya pertenece a otra jornada ACTIVA.");
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    fireEvent.click(await screen.findByRole("button", {name: "Activar jornada"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar activación"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("otra jornada ACTIVA");
    expect(screen.getByRole("button", {name: /Borrador semanal/})).toBeInTheDocument();
  });

  it("cancela con resumen, motivo y confirmacion explicita", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    fireEvent.click(await screen.findByRole("button", {name: "Cancelar borrador"}));
    const summary = screen.getByLabelText("Resumen de cancelación del borrador");
    expect(summary).toHaveTextContent("Líneas conservadas: 1");
    expect(summary).toHaveTextContent("Participantes conservados: 1");
    fireEvent.change(screen.getByLabelText("Motivo de cancelación"), {
      target: {value: "La preparación se retomará después."},
    });
    const confirmButton = screen.getByRole("button", {name: "Confirmar cancelación"});
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", {name: /Confirmo que deseo cancelar/}));
    fireEvent.click(confirmButton);
    await waitFor(() => expect(repository.cancelledDrafts).toHaveLength(1));
    expect(repository.cancelledDrafts[0]).toMatchObject({
      journeyId: "JORNADA-BORRADOR-1",
      expectedVersion: 1,
      reason: "La preparación se retomará después.",
    });
    expect(await screen.findByText(/Borrador cancelado/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: /Borrador semanal/})).toHaveTextContent("CANCELADO");
  });

  it("muestra cancelados en solo lectura y los reabre con sus selecciones", async () => {
    const repository = new FakeMonitorRepository();
    await repository.cancelDraftJourney(
      "JORNADA-BORRADOR-1",
      1,
      "Motivo conservado para pruebas",
      "cancel-preloaded-key-0001",
    );
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Jornadas"}));
    fireEvent.click(await screen.findByRole("button", {name: /Borrador semanal/}));
    expect(screen.getByText("BORRADOR CANCELADO — SOLO LECTURA")).toBeInTheDocument();
    expect(screen.getByText(/Motivo conservado para pruebas/)).toBeInTheDocument();
    expect(screen.getByText("Auxiliar Uno")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Activar jornada"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Reabrir borrador"}));
    expect(screen.getByLabelText("Resumen de reapertura")).toHaveTextContent("Líneas conservadas: 1");
    fireEvent.click(screen.getByRole("button", {name: "Confirmar reapertura"}));
    await waitFor(() => expect(repository.reopenedDrafts).toHaveLength(1));
    expect(repository.reopenedDrafts[0]).toMatchObject({
      journeyId: "JORNADA-BORRADOR-1",
      expectedVersion: 2,
    });
    expect(await screen.findByText(/Borrador reabierto/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Activar jornada"})).toBeInTheDocument();
  });

  it("muestra la seccion Usuarios solo a administradores y permite filtrar perfiles", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      canManageUsers: true,
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Usuarios"}));
    await screen.findByRole("heading", {name: "Usuarios"});
    expect(screen.getByText("Auxiliar Uno")).toBeInTheDocument();
    expect(screen.getByText(/1 jornada.*1 reserva/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "INACTIVO"}});
    expect(screen.getByText("Usuario Inactivo")).toBeInTheDocument();
    expect(screen.queryByText("Auxiliar Uno")).not.toBeInTheDocument();
  });

  it("desactiva con advertencia, motivo, confirmacion y version refrescada", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      canManageUsers: true,
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Usuarios"}));
    const card = (await screen.findByText("Auxiliar Uno")).closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole("button", {name: "Desactivar"}));
    expect(screen.getByRole("dialog")).toHaveTextContent("No se liberará");
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), {target: {value: "Ausencia temporal"}});
    fireEvent.click(screen.getByLabelText(/Confirmo el cambio central/));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar cambio"}));
    await waitFor(() => expect(repository.statusUpdates).toHaveLength(1));
    expect(repository.statusUpdates[0]).toMatchObject({
      userId: "uid-auxiliar-1",
      version: 1,
      active: false,
      reason: "Ausencia temporal",
    });
    expect(await screen.findByText(/actualizado a INACTIVO/)).toBeInTheDocument();
  });

  it("bloquea cambios de rol con trabajo activo y actualiza un perfil seguro", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      canManageUsers: true,
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Usuarios"}));
    const activeCard = (await screen.findByText("Auxiliar Uno")).closest("article") as HTMLElement;
    expect(within(activeCard).getByRole("button", {name: "Cambiar rol"})).toBeDisabled();
    const safeCard = screen.getByText("Usuario Inactivo").closest("article") as HTMLElement;
    fireEvent.click(within(safeCard).getByRole("button", {name: "Cambiar rol"}));
    fireEvent.change(screen.getByLabelText("Nuevo rol"), {target: {value: "SUPERVISOR"}});
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), {target: {value: "Nuevo alcance de prueba"}});
    fireEvent.click(screen.getByLabelText(/Confirmo el cambio central/));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar cambio"}));
    await waitFor(() => expect(repository.roleUpdates).toHaveLength(1));
    expect(repository.roleUpdates[0]).toMatchObject({
      userId: "uid-inactivo-prueba",
      version: 2,
      role: "SUPERVISOR",
    });
  });

  it("oculta Usuarios a supervisores y auxiliares", async () => {
    const supervisorRepository = new FakeMonitorRepository();
    await signIn(supervisorRepository);
    expect(screen.queryByRole("button", {name: "Usuarios"})).not.toBeInTheDocument();
    cleanup();
    const auxiliaryRepository = new FakeMonitorRepository();
    auxiliaryRepository.user = {
      id: "uid-auxiliar-1",
      displayName: "Auxiliar",
      role: "AUXILIAR",
      canViewReservationDetails: false,
      canReview: false,
      canRelease: false,
      canManageDraftJourneys: false,
      canManageUsers: false,
    };
    await signIn(auxiliaryRepository);
    expect(screen.queryByRole("button", {name: "Usuarios"})).not.toBeInTheDocument();
  });

  it("muestra Catalogo solo al administrador con arbol, alertas y filtros", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      ...supervisor,
      id: "uid-administrador",
      displayName: "Administrador Pruebas",
      role: "ADMINISTRADOR",
      canManageUsers: true,
      canManageCatalog: true,
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Catálogo"}));
    await screen.findByRole("heading", {name: "Catálogo"});
    expect(screen.getByText(/RAIZ · VIVERO · v1 · ACTIVA/)).toBeInTheDocument();
    expect(screen.getByText("Línea libre")).toBeInTheDocument();
    expect(screen.getByText(/Seleccionada en 1 borrador/)).toBeInTheDocument();
    expect(screen.getByText(/Bloqueada por una jornada ACTIVA/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar"), {target: {value: "ocupada"}});
    expect(screen.queryByText("Línea libre")).not.toBeInTheDocument();
    expect(screen.getByText("Línea ocupada")).toBeInTheDocument();
  });

  it("crea una ubicacion central y refresca el catalogo", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {...supervisor, role: "ADMINISTRADOR", canManageUsers: true, canManageCatalog: true};
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Catálogo"}));
    await screen.findByRole("heading", {name: "Catálogo"});
    fireEvent.click(screen.getByRole("button", {name: "Nueva ubicación raíz"}));
    fireEvent.change(screen.getByLabelText("Código"), {target: {value: "NUEVA-RAIZ"}});
    fireEvent.change(screen.getByLabelText("Tipo técnico"), {target: {value: "FIXTURE"}});
    fireEvent.change(screen.getByLabelText("Nombre visible"), {target: {value: "Nueva raíz"}});
    fireEvent.change(screen.getByLabelText("Orden"), {target: {value: "4"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear"}));
    await screen.findByText("Ubicación creada mediante operación central.");
    expect(repository.catalogChanged).toBe(1);
    expect(screen.getByText("Nueva raíz")).toBeInTheDocument();
    expect(repository.catalogListCalls).toBeGreaterThan(1);
  });

  it("confirma la desactivacion de una linea de borrador y bloquea la ocupada", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {...supervisor, role: "ADMINISTRADOR", canManageUsers: true, canManageCatalog: true};
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Catálogo"}));
    await screen.findByRole("heading", {name: "Catálogo"});
    const occupiedArticle = screen.getByText("Línea ocupada").closest("article");
    expect(occupiedArticle).not.toBeNull();
    expect(within(occupiedArticle!).getByRole("button", {name: "Editar línea"})).toBeDisabled();
    const freeArticle = screen.getByText("Línea libre").closest("article");
    fireEvent.click(within(freeArticle!).getByRole("button", {name: "Editar línea"}));
    fireEvent.click(screen.getByLabelText("Registro activo"));
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), {target: {value: "Línea fuera de uso temporal."}});
    expect(screen.getByText(/Los borradores conservarán esta línea/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Confirmo este cambio central."));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar cambio"}));
    await screen.findByText("Línea actualizada y versionada.");
    expect(repository.manageableCatalog.lines.find((line) => line.id === "LINEA-CATALOGO-1"))
      .toMatchObject({active: false, version: 2, draftSelectionCount: 1});
  });

  it("registra inventario inicial ficticio con total visual, confirmacion y refresco", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {...supervisor, role: "ADMINISTRADOR", canManageUsers: true, canManageCatalog: true};
    repository.manageableCatalog = {
      ...repository.manageableCatalog,
      lines: repository.manageableCatalog.lines.map((line) => line.id === "LINEA-CATALOGO-1"
        ? {...line, initialInventoryEligible: true}
        : {...line, initialInventoryEligible: false, initialInventoryIneligibleReason: "ACTIVIDAD_OPERATIVA"}),
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: /Cat/}));
    await screen.findByRole("heading", {name: /Cat/});
    const freeArticle = screen.getByText(/L.*nea libre/).closest("article");
    fireEvent.click(within(freeArticle!).getByRole("button", {name: "Registrar inventario inicial"}));
    const inventoryDialog = screen.getByRole("dialog", {name: "Registrar inventario inicial"});
    fireEvent.change(screen.getByLabelText("Hembras iniciales"), {target: {value: "10"}});
    fireEvent.change(screen.getByLabelText("Machos iniciales"), {target: {value: "5"}});
    fireEvent.change(screen.getByLabelText("Patrones iniciales"), {target: {value: "2"}});
    expect(screen.getByText("17")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Referencia de fuente"), {
      target: {value: "Acta de inventario inicial Maestro"},
    });
    fireEvent.click(screen.getByLabelText(/Confirmo que revisé las cifras/));
    fireEvent.click(within(inventoryDialog).getByRole("button", {name: "Registrar inventario inicial"}));
    await screen.findByText("Inventario inicial registrado de forma inmutable.");
    expect(repository.inventoryRegistrations).toHaveLength(1);
    expect(repository.inventoryRegistrations[0]).toMatchObject({females: 10, males: 5, rootstocks: 2});
    expect(screen.getByText(/H 10/)).toBeInTheDocument();
    expect(screen.getByText(/CARGA_INICIAL_ADMINISTRATIVA/)).toBeInTheDocument();
    expect(repository.catalogListCalls).toBeGreaterThan(1);
  });

  it("valida localmente, presenta y exporta un informe de migración sin importar", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {...supervisor, role: "ADMINISTRADOR", canManageUsers: true, canManageCatalog: true};
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: /Migraci.n.*Validaci.n/}));
    await screen.findByRole("heading", {name: /Migraci.n.*Validaci.n/});

    const payload = {
      formato: "paquete-migracion-catalogo-v1",
      metadatos: {nombrePaquete: "PRUEBA", creadoEn: "2026-07-16T12:00:00.000Z", referenciaFuente: "PRUEBA"},
      ubicaciones: [{claveExterna: "UB-PRUEBA"}],
      lineas: [{claveExterna: "LINEA-PRUEBA"}],
      inventariosIniciales: [{lineaClaveExterna: "LINEA-PRUEBA"}],
    };
    const file = new File([JSON.stringify(payload)], "paquete-prueba.json", {type: "application/json"});
    Object.defineProperty(file, "text", {value: async () => JSON.stringify(payload)});
    fireEvent.change(screen.getByLabelText("Archivo JSON de migración"), {target: {files: [file]}});
    await screen.findByText(/Estructura local v.lida/);
    fireEvent.click(screen.getByRole("button", {name: "Validar paquete"}));

    await screen.findByRole("heading", {name: "Resultado de validación"});
    expect(repository.migrationValidationCalls).toHaveLength(1);
    expect(screen.getByText(/No se realiz. ninguna importaci.n/)).toBeInTheDocument();
    expect(screen.getByText(/CONFLICTO_OPERATIVO/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filtrar severidad"), {target: {value: "ADVERTENCIA"}});
    expect(screen.queryByText(/CONFLICTO_OPERATIVO/)).not.toBeInTheDocument();
    expect(screen.getByText(/CODIGO_EXISTENTE/)).toBeInTheDocument();

    const createObjectUrl = vi.fn(() => "blob:informe-prueba");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {configurable: true, value: createObjectUrl});
    Object.defineProperty(URL, "revokeObjectURL", {configurable: true, value: revokeObjectUrl});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", {name: "Exportar informe seguro"}));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:informe-prueba");
    click.mockRestore();
  });

  it("confirma por fragmento de hash, importa en emulador y revierte solo una importación elegible", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {...supervisor, role: "ADMINISTRADOR", canManageUsers: true, canManageCatalog: true};
    repository.migrationValidationReport = {
      ...repository.migrationValidationReport,
      blockingErrors: [], warnings: [], eligibleToImport: true,
      conflicts: {
        locations: {newItems: 2, matchingItems: 0, blockedItems: 0},
        lines: {newItems: 1, matchingItems: 0, blockedItems: 0},
        initialInventories: {newItems: 1, matchingItems: 0, blockedItems: 0},
        existingCodes: 0, incompatibleKeys: 0, linesWithCurrentInventory: 0, operationalConflicts: 0,
      },
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: /Migraci.n.*Validaci.n/}));

    const payload = {
      formato: "paquete-migracion-catalogo-v1",
      metadatos: {nombrePaquete: "PRUEBA", creadoEn: "2026-07-16T12:00:00.000Z", referenciaFuente: "PRUEBA"},
      ubicaciones: [{claveExterna: "UB-PRUEBA"}], lineas: [{claveExterna: "LINEA-PRUEBA"}],
      inventariosIniciales: [{lineaClaveExterna: "LINEA-PRUEBA"}],
    };
    const file = new File([JSON.stringify(payload)], "paquete-prueba.json", {type: "application/json"});
    Object.defineProperty(file, "text", {value: async () => JSON.stringify(payload)});
    fireEvent.change(screen.getByLabelText("Archivo JSON de migración"), {target: {files: [file]}});
    await screen.findByText(/Estructura local v.lida/);
    fireEvent.click(screen.getByRole("button", {name: "Validar paquete"}));

    await screen.findByRole("heading", {name: "Importar paquete validado"});
    expect(screen.getByText(/12 escrituras/)).toBeInTheDocument();
    const importButton = screen.getByRole("button", {name: "Importar paquete"});
    expect(importButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirmar fragmento del hash"), {target: {value: "aaaaaaaaaaaa"}});
    fireEvent.click(importButton);

    await screen.findByRole("heading", {name: "Importación APLICADA"});
    expect(repository.migrationImportCalls).toHaveLength(1);
    expect(screen.getByText(/UB-PRUEBA.*UB-INTERNA/)).toBeInTheDocument();
    const reverseButton = await screen.findByRole("button", {name: "Revertir importación"});
    fireEvent.click(reverseButton);
    fireEvent.change(screen.getByLabelText("Motivo de reversión"), {
      target: {value: "PRUEBA reversión antes de cualquier uso"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Confirmar reversión"}));

    await screen.findByText(/Importación revertida: 8 documentos/);
    expect(repository.migrationReversalCalls).toHaveLength(1);
    expect(screen.getByText(/REVERTIDA.*IMPORTACION-PRUEBA-19/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Revertir importación"})).not.toBeInTheDocument();
  });

  it("oculta Catalogo a supervisor y auxiliar", async () => {
    const supervisorRepository = new FakeMonitorRepository();
    await signIn(supervisorRepository);
    expect(screen.queryByRole("button", {name: "Catálogo"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Migraci.n.*Validaci.n/})).not.toBeInTheDocument();
    cleanup();
    const auxiliaryRepository = new FakeMonitorRepository();
    auxiliaryRepository.user = {
      ...supervisor,
      role: "AUXILIAR",
      canViewReservationDetails: false,
      canReview: false,
      canRelease: false,
      canManageDraftJourneys: false,
      canManageUsers: false,
      canManageCatalog: false,
    };
    await signIn(auxiliaryRepository);
    expect(screen.queryByRole("button", {name: "Catálogo"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Migraci.n.*Validaci.n/})).not.toBeInTheDocument();
  });

  it("invalida de forma segura una sesion desactivada desde otra sesion", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    act(() => repository.emitAccountActive(false));
    await screen.findByRole("heading", {name: "Acceso a revisión"});
    expect(screen.getByRole("alert")).toHaveTextContent("Cuenta desactivada");
  });
});
