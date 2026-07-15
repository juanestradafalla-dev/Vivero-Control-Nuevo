export type MonitorRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";

export interface MonitorUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: MonitorRole;
  readonly canViewReservationDetails: boolean;
  readonly canReview: boolean;
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
  readonly userDisplayName: string;
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

export interface MonitorLine {
  readonly id: string;
  readonly lineId: string;
  readonly state: "DISPONIBLE" | "EN_CONTEO" | "PENDIENTE_REVISION" | "DEVUELTA" | "APROBADA";
  readonly location: MonitorLocation;
  readonly currentCountId?: string;
  readonly reservation?: MonitorReservation;
  readonly count?: MonitorCount;
  readonly countHistory?: readonly MonitorCount[];
  readonly inventory?: MonitorInventory;
}

export interface MonitorSnapshot {
  readonly journeyId: string;
  readonly journeyDisplayName: string;
  readonly lines: readonly MonitorLine[];
}

export type MonitorUnsubscribe = () => void;

export interface MonitorRepository {
  readonly emulatorEnabled: boolean;
  signIn(email: string, password: string): Promise<MonitorUser>;
  signOut(): Promise<void>;
  approveCount(countId: string, idempotencyKey: string, exceptionReason?: string): Promise<void>;
  returnCount(countId: string, reason: string, idempotencyKey: string): Promise<void>;
  observeMonitor(
    user: MonitorUser,
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
