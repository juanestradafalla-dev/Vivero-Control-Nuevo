export type MonitorRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";

export interface MonitorUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: MonitorRole;
  readonly canViewReservationDetails: boolean;
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

export interface MonitorLine {
  readonly id: string;
  readonly state: "DISPONIBLE" | "EN_CONTEO";
  readonly location: MonitorLocation;
  readonly reservation?: MonitorReservation;
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
