export const DEMO_PROJECT_ID = "demo-vivero-control-etapa3";
export const DEMO_PASSWORD = "SoloEmulador-Etapa3!";
export const ACTIVE_JOURNEY_ID = "JORNADA-PRUEBA-ETAPA-3";
export const SECOND_ACTIVE_JOURNEY_ID = "JORNADA-PRUEBA-ETAPA-9-B";
export const UNAUTHORIZED_ACTIVE_JOURNEY_ID = "JORNADA-PRUEBA-SIN-AUTORIZACION";
export const DRAFT_JOURNEY_ID = "JORNADA-BORRADOR-SUPERVISOR";
export const OTHER_SUPERVISOR_DRAFT_JOURNEY_ID = "JORNADA-BORRADOR-OTRO-SUPERVISOR";
export const FREE_CATALOG_LINE_ID = "LINEA-CATALOGO-LIBRE-1";
export const SECOND_FREE_CATALOG_LINE_ID = "LINEA-CATALOGO-LIBRE-2";
export const INACTIVE_CATALOG_LINE_ID = "LINEA-CATALOGO-INACTIVA";

export const demoAccounts = [
  {uid: "uid-auxiliar-1", email: "auxiliar1@prueba.local", nombreVisible: "Auxiliar ficticio 1", rol: "AUXILIAR", activo: true, autorizado: true},
  {uid: "uid-auxiliar-2", email: "auxiliar2@prueba.local", nombreVisible: "Auxiliar ficticio 2", rol: "AUXILIAR", activo: true, autorizado: true},
  {uid: "uid-supervisor", email: "supervisor@prueba.local", nombreVisible: "Supervisor ficticio", rol: "SUPERVISOR", activo: true, autorizado: true},
  {uid: "uid-supervisor-2", email: "supervisor2@prueba.local", nombreVisible: "Supervisor ficticio 2", rol: "SUPERVISOR", activo: true, autorizado: false},
  {uid: "uid-administrador", email: "administrador@prueba.local", nombreVisible: "Administrador ficticio", rol: "ADMINISTRADOR", activo: true, autorizado: true},
  {uid: "uid-inactivo-prueba", email: "inactivo@prueba.local", nombreVisible: "Usuario inactivo ficticio", rol: "AUXILIAR", activo: false, autorizado: true},
  {uid: "uid-sin-acceso-prueba", email: "sin-acceso@prueba.local", nombreVisible: "Usuario sin acceso ficticio", rol: "AUXILIAR", activo: true, autorizado: false},
  {uid: "uid-sin-perfil-prueba", email: "sin-perfil@prueba.local", nombreVisible: "Cuenta sin perfil ficticia", rol: "AUXILIAR", activo: true, autorizado: false, crearPerfil: false}
];

export const visibleLocations = [1, 2, 3].map((number) => ({
  vivero: "VIVERO-PRUEBA",
  modulo: "MODULO-PRUEBA-1",
  cama: "CAMA-PRUEBA-1",
  linea: `LINEA-PRUEBA-${number}`,
  nombreVisible: `Línea ficticia ${number}`,
  orden: number
}));

export const secondJourneyLocations = [1, 2].map((number) => ({
  vivero: "VIVERO-PRUEBA",
  modulo: "MODULO-PRUEBA-2",
  cama: "CAMA-PRUEBA-2",
  linea: `LINEA-PRUEBA-B-${number}`,
  nombreVisible: `Línea ficticia B${number}`,
  orden: number
}));

export function journeyLineId(lineNumber) {
  return `${ACTIVE_JOURNEY_ID}__LINEA-PRUEBA-${lineNumber}`;
}

export function secondJourneyLineId(lineNumber) {
  return `${SECOND_ACTIVE_JOURNEY_ID}__LINEA-PRUEBA-B-${lineNumber}`;
}
