export const DEMO_PROJECT_ID: string;
export const DEMO_PASSWORD: string;
export const ACTIVE_JOURNEY_ID: string;
export const demoAccounts: ReadonlyArray<{
  uid: string;
  email: string;
  nombreVisible: string;
  rol: string;
  activo: boolean;
  autorizado: boolean;
  crearPerfil?: boolean;
}>;
export const visibleLocations: ReadonlyArray<{
  vivero: string;
  modulo: string;
  cama: string;
  linea: string;
  nombreVisible: string;
  orden: number;
}>;
export function journeyLineId(lineNumber: number): string;
