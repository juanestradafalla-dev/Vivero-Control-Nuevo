export type MonitorRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";

export interface MonitorUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: MonitorRole;
  readonly canViewReservationDetails: boolean;
  readonly canReview: boolean;
  readonly canRelease: boolean;
  readonly canManageDraftJourneys: boolean;
}

export interface MonitorJourney {
  readonly id: string;
  readonly displayName: string;
  readonly state: "ACTIVA";
  readonly effectiveRole: MonitorRole;
  readonly canCount: boolean;
  readonly lineCount: number;
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
  readonly unavailableReason?: "JORNADA_ACTIVA";
  readonly location: MonitorLocation;
}

export interface ManageableJourneysData {
  readonly journeys: readonly ManageableDraftJourney[];
  readonly catalogLines: readonly DraftCatalogLine[];
}

export type MonitorUnsubscribe = () => void;

export interface MonitorRepository {
  readonly emulatorEnabled: boolean;
  signIn(email: string, password: string): Promise<MonitorUser>;
  signOut(): Promise<void>;
  listActiveJourneys(): Promise<readonly MonitorJourney[]>;
  listManageableJourneys(): Promise<ManageableJourneysData>;
  createDraftJourney(displayName: string, idempotencyKey: string): Promise<ManageableDraftJourney>;
  updateDraftJourneyLines(
    journeyId: string,
    lineIds: readonly string[],
    idempotencyKey: string,
  ): Promise<void>;
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
