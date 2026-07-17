export type MonitorRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";

export interface MonitorUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: MonitorRole;
  readonly canViewReservationDetails: boolean;
  readonly canReview: boolean;
  readonly canRelease: boolean;
  readonly canManageDraftJourneys: boolean;
  readonly canManageUsers: boolean;
  readonly canManageCatalog?: boolean;
}

export interface MonitorJourney {
  readonly id: string;
  readonly displayName: string;
  readonly state: "ACTIVA";
  readonly effectiveRole: MonitorRole;
  readonly canCount: boolean;
  readonly lineCount: number;
  readonly version: number;
  readonly canClose: boolean;
}

export interface MonitorLocation {
  readonly nursery: string;
  readonly module: string;
  readonly bed: string;
  readonly line: string;
  readonly displayName: string;
  readonly order: number;
}

export interface MonitorReservation {
  readonly id: string;
  readonly userDisplayName: string;
  readonly type: "INICIAL" | "CORRECCION";
  readonly deviceId: string;
  readonly reservedAt: string;
}

export interface MonitorCount {
  readonly id: string;
  readonly authorUserId: string;
  readonly authorDisplayName: string;
  readonly effectiveRole: MonitorRole;
  readonly deviceId: string;
  readonly females: number;
  readonly males: number;
  readonly rootstocks: number;
  readonly total: number;
  readonly observations?: string;
  readonly deviceTimestamp: string;
  readonly serverTimestamp: string;
  readonly version: number;
  readonly previousCountId?: string;
  readonly returnReason?: string;
}

export interface MonitorInventory {
  readonly females: number;
  readonly males: number;
  readonly rootstocks: number;
  readonly total: number;
  readonly version: number;
}

export interface MonitorCorrectionCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly role: MonitorRole;
}

export interface MonitorCorrectionResponsibility {
  readonly reassignmentId: string;
  readonly originalAuthorUserId: string;
  readonly originalAuthorDisplayName: string;
  readonly responsibleUserId: string;
  readonly responsibleDisplayName: string;
  readonly assignedByUserId: string;
  readonly assignedByDisplayName: string;
  readonly reason: string;
  readonly assignedAt: string;
}

export interface MonitorLine {
  readonly id: string;
  readonly lineId: string;
  readonly version: number;
  readonly state: "DISPONIBLE" | "EN_CONTEO" | "PENDIENTE_REVISION" | "DEVUELTA" | "APROBADA";
  readonly location: MonitorLocation;
  readonly currentCountId?: string;
  readonly activeReassignmentId?: string;
  readonly reservation?: MonitorReservation;
  readonly count?: MonitorCount;
  readonly countHistory?: readonly MonitorCount[];
  readonly inventory?: MonitorInventory;
  readonly correctionResponsibility?: MonitorCorrectionResponsibility;
}

export interface MonitorSnapshot {
  readonly journeyId: string;
  readonly journeyDisplayName: string;
  readonly lines: readonly MonitorLine[];
  readonly correctionCandidates: readonly MonitorCorrectionCandidate[];
}

export interface ManageableDraftJourney {
  readonly id: string;
  readonly displayName: string;
  readonly state: "BORRADOR";
  readonly creatorUserId: string;
  readonly creatorDisplayName: string;
  readonly version: number;
  readonly lineIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DraftCatalogLine {
  readonly id: string;
  readonly displayName: string;
  readonly selectable: boolean;
  readonly unavailableReason?: "JORNADA_ACTIVA" | "LINEA_INACTIVA";
  readonly location: MonitorLocation;
}

export interface ManageableJourneysData {
  readonly journeys: readonly ManageableDraftJourney[];
  readonly cancelledJourneys: readonly CancelledDraftJourney[];
  readonly catalogLines: readonly DraftCatalogLine[];
}

export interface DraftParticipantCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly role: MonitorRole;
}

export interface DraftParticipant extends DraftParticipantCandidate {
  readonly canCount: boolean;
}

export interface CancelledDraftJourney {
  readonly id: string;
  readonly displayName: string;
  readonly state: "INACTIVA";
  readonly inactiveType: "CANCELACION_BORRADOR";
  readonly creatorUserId: string;
  readonly creatorDisplayName: string;
  readonly version: number;
  readonly lineIds: readonly string[];
  readonly participants: readonly DraftParticipant[];
  readonly cancellationId: string;
  readonly cancelledByUserId: string;
  readonly cancelledByDisplayName: string;
  readonly cancellationReason: string;
  readonly cancelledAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DraftParticipantsData {
  readonly journeyId: string;
  readonly state: "BORRADOR";
  readonly version: number;
  readonly lineSelectionVersion: number;
  readonly participantSelectionVersion: number;
  readonly participants: readonly DraftParticipant[];
  readonly activeUsers: readonly DraftParticipantCandidate[];
}

export interface DraftParticipantInput {
  readonly userId: string;
  readonly canCount: boolean;
}

export interface DraftActivationVersions {
  readonly journey: number;
  readonly lineSelection: number;
  readonly participantSelection: number;
}

export interface DraftActivationResult {
  readonly journeyId: string;
  readonly state: "ACTIVA";
  readonly version: number;
  readonly lineCount: number;
  readonly participantCount: number;
  readonly activatedAt: string;
}

export type UserRoleChangeBlocker = "JORNADA_ACTIVA" | "RESERVA_ACTIVA" | "CORRECCION_PENDIENTE";

export interface UserActiveWorkSummary {
  readonly activeJourneys: number;
  readonly activeReservations: number;
  readonly pendingCorrections: number;
  readonly hasActiveWork: boolean;
  readonly roleChangeBlockers: readonly UserRoleChangeBlocker[];
}

export interface ManageableUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: MonitorRole;
  readonly active: boolean;
  readonly version: number;
  readonly canChangeRole: boolean;
  readonly activeWork: UserActiveWorkSummary;
}

export interface ManageableCatalogLocation {
  readonly id: string;
  readonly code: string;
  readonly type: string;
  readonly parentId?: string;
  readonly displayName: string;
  readonly order: number;
  readonly active: boolean;
  readonly version: number;
  readonly activeChildCount: number;
  readonly activeLineCount: number;
}

export interface ManageableCatalogLine {
  readonly id: string;
  readonly locationId: string;
  readonly code: string;
  readonly displayName: string;
  readonly order: number;
  readonly active: boolean;
  readonly version: number;
  readonly occupiedByActiveJourney: boolean;
  readonly draftSelectionCount: number;
  readonly inventory?: ManageableCatalogInventory;
  readonly initialInventoryEligible?: boolean;
  readonly initialInventoryIneligibleReason?: string;
}

export interface ManageableCatalogInventory {
  readonly females: number;
  readonly males: number;
  readonly rootstocks: number;
  readonly total: number;
  readonly version: number;
  readonly origin: string;
  readonly actorUserId: string;
  readonly actorDisplayName: string;
  readonly updatedAt: string;
  readonly initialSourceReference?: string;
}

export interface ManageableCatalogData {
  readonly locations: readonly ManageableCatalogLocation[];
  readonly lines: readonly ManageableCatalogLine[];
}

export type MigrationValidationEntity = "PAQUETE" | "UBICACION" | "LINEA" | "INVENTARIO_INICIAL";

export interface MigrationValidationIssue {
  readonly code: string;
  readonly severity: "ERROR" | "ADVERTENCIA";
  readonly entity: MigrationValidationEntity;
  readonly externalKey?: string;
  readonly message: string;
}

export interface MigrationEntitySummary {
  readonly newItems: number;
  readonly matchingItems: number;
  readonly blockedItems: number;
}

export interface MigrationValidationReport {
  readonly format: string;
  readonly packageHash: string;
  readonly counts: {readonly locations: number; readonly lines: number; readonly initialInventories: number};
  readonly blockingErrors: readonly MigrationValidationIssue[];
  readonly warnings: readonly MigrationValidationIssue[];
  readonly conflicts: {
    readonly locations: MigrationEntitySummary;
    readonly lines: MigrationEntitySummary;
    readonly initialInventories: MigrationEntitySummary;
    readonly existingCodes: number;
    readonly incompatibleKeys: number;
    readonly linesWithCurrentInventory: number;
    readonly operationalConflicts: number;
  };
  readonly eligibleToImport: boolean;
  readonly validationOnly: true;
}

export interface MigrationImportMapEntry {
  readonly externalKey: string;
  readonly internalId: string;
  readonly codeLockId: string;
}

export interface MigrationImportResult {
  readonly importId: string;
  readonly packageHash: string;
  readonly status: "APLICADA";
  readonly version: 1;
  readonly counts: MigrationValidationReport["counts"];
  readonly writes: number;
  readonly map: {
    readonly locations: readonly MigrationImportMapEntry[];
    readonly lines: readonly MigrationImportMapEntry[];
  };
  readonly appliedByUserId: string;
  readonly appliedAt: string;
}

export interface MigrationImportSummary {
  readonly importId: string;
  readonly packageHash: string;
  readonly status: "APLICADA" | "REVERTIDA";
  readonly version: number;
  readonly counts: MigrationValidationReport["counts"];
  readonly writes: number;
  readonly appliedByUserId: string;
  readonly appliedByDisplayName: string;
  readonly appliedAt: string;
  readonly reversalEligible: boolean;
  readonly reversalBlockers: readonly string[];
  readonly revertedByUserId?: string;
  readonly revertedAt?: string;
  readonly reversalReason?: string;
}

export interface MigrationReversalResult {
  readonly importId: string;
  readonly packageHash: string;
  readonly status: "REVERTIDA";
  readonly version: number;
  readonly deletedDocuments: number;
  readonly revertedByUserId: string;
  readonly revertedAt: string;
  readonly reason: string;
}

export type MonitorUnsubscribe = () => void;

export interface MonitorRepository {
  readonly environment: "EMULATOR" | "PRODUCTION" | "DISABLED";
  readonly emulatorEnabled: boolean;
  signIn(email: string, password: string): Promise<MonitorUser>;
  signOut(): Promise<void>;
  observeAccountStatus(
    userId: string,
    onActiveChanged: (active: boolean) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe;
  listActiveJourneys(): Promise<readonly MonitorJourney[]>;
  listManageableJourneys(): Promise<ManageableJourneysData>;
  createDraftJourney(displayName: string, idempotencyKey: string): Promise<ManageableDraftJourney>;
  updateDraftJourneyLines(
    journeyId: string,
    lineIds: readonly string[],
    idempotencyKey: string,
  ): Promise<void>;
  listDraftJourneyParticipants(journeyId: string): Promise<DraftParticipantsData>;
  updateDraftJourneyParticipants(
    journeyId: string,
    participants: readonly DraftParticipantInput[],
    idempotencyKey: string,
  ): Promise<void>;
  activateDraftJourney(
    journeyId: string,
    versions: DraftActivationVersions,
    idempotencyKey: string,
  ): Promise<DraftActivationResult>;
  cancelDraftJourney(
    journeyId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<void>;
  reopenCancelledJourney(journeyId: string, expectedVersion: number, idempotencyKey: string): Promise<void>;
  listManageableUsers(): Promise<readonly ManageableUser[]>;
  updateUserStatus(
    userId: string,
    expectedVersion: number,
    active: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableUser>;
  updateUserRole(
    userId: string,
    expectedVersion: number,
    role: MonitorRole,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableUser>;
  listManageableCatalog(): Promise<ManageableCatalogData>;
  createCatalogLocation(
    code: string,
    type: string,
    parentId: string | undefined,
    displayName: string,
    order: number,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLocation>;
  updateCatalogLocation(
    location: ManageableCatalogLocation,
    displayName: string,
    order: number,
    active: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLocation>;
  createCatalogLine(
    locationId: string,
    code: string,
    displayName: string,
    order: number,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLine>;
  updateCatalogLine(
    line: ManageableCatalogLine,
    displayName: string,
    order: number,
    active: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableCatalogLine>;
  registerInitialInventory(
    line: ManageableCatalogLine,
    females: number,
    males: number,
    rootstocks: number,
    sourceReference: string,
    idempotencyKey: string,
  ): Promise<void>;
  validateMigrationPackage(packageData: unknown): Promise<MigrationValidationReport>;
  importMigrationPackage(
    packageData: unknown,
    expectedHash: string,
    idempotencyKey: string,
  ): Promise<MigrationImportResult>;
  listMigrationImports(): Promise<readonly MigrationImportSummary[]>;
  revertMigrationImport(
    migrationImport: MigrationImportSummary,
    reason: string,
    idempotencyKey: string,
  ): Promise<MigrationReversalResult>;
  closeJourney(journeyId: string, expectedVersion: number, idempotencyKey: string): Promise<void>;
  approveCount(countId: string, idempotencyKey: string, exceptionReason?: string): Promise<void>;
  returnCount(countId: string, reason: string, idempotencyKey: string): Promise<void>;
  reassignCountCorrection(countId: string, newUserId: string, reason: string, idempotencyKey: string): Promise<void>;
  releaseReservation(reservationId: string, reason: string, idempotencyKey: string): Promise<void>;
  observeMonitor(
    user: MonitorUser,
    journeyId: string,
    onSnapshot: (snapshot: MonitorSnapshot) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe;
}

export function sortMonitorLines(lines: readonly MonitorLine[]): MonitorLine[] {
  return [...lines].sort(
    (left, right) =>
      left.location.module.localeCompare(right.location.module) ||
      left.location.bed.localeCompare(right.location.bed) ||
      left.location.order - right.location.order ||
      left.location.line.localeCompare(right.location.line),
  );
}
