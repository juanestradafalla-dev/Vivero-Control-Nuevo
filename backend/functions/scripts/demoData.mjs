export const DEMO_PROJECT_ID = "demo-vivero-control-etapa3";
export const DEMO_PASSWORD = "SoloEmulador-Etapa3!";
export const ACTIVE_JOURNEY_ID = "JORNADA-PRUEBA-ETAPA-3";

export const demoAccounts = [
  {uid: "uid-auxiliar-1", email: "auxiliar1@prueba.local", nombreVisible: "Auxiliar ficticio 1", rol: "AUXILIAR", activo: true, autorizado: true},
  {uid: "uid-auxiliar-2", email: "auxiliar2@prueba.local", nombreVisible: "Auxiliar ficticio 2", rol: "AUXILIAR", activo: true, autorizado: true},
  {uid: "uid-supervisor", email: "supervisor@prueba.local", nombreVisible: "Supervisor ficticio", rol: "SUPERVISOR", activo: true, autorizado: true},
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

export function journeyLineId(lineNumber) {
  return `${ACTIVE_JOURNEY_ID}__LINEA-PRUEBA-${lineNumber}`;
}
