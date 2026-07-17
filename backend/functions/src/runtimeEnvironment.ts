import {domainErrors} from "./domain/errors.js";

export const PRODUCTION_PROJECT_ID = "viverocontrol-3f83f";

export const CALLABLE_NAMES = Object.freeze([
  "importarPaqueteMigracion",
  "listarImportacionesMigracion",
  "revertirImportacionMigracion",
  "validarPaqueteMigracion",
  "registrarInventarioInicial",
  "listarCatalogoAdministrable",
  "crearUbicacion",
  "actualizarUbicacion",
  "crearLinea",
  "actualizarLinea",
  "listarUsuariosAdministrables",
  "actualizarEstadoUsuario",
  "actualizarRolUsuario",
  "cancelarJornadaBorrador",
  "reabrirJornadaCancelada",
  "cerrarJornada",
  "activarJornada",
  "listarParticipantesJornadaBorrador",
  "actualizarParticipantesJornadaBorrador",
  "crearJornadaBorrador",
  "actualizarLineasJornadaBorrador",
  "listarJornadasAdministrables",
  "listarJornadasActivas",
  "reservarLinea",
  "enviarConteo",
  "iniciarCorreccionConteo",
  "reasignarCorreccionConteo",
  "liberarReservaLinea",
  "aprobarConteo",
  "devolverConteo",
] as const);

export type RuntimeEnvironment = "EMULATOR" | "PRODUCTION";

function configuredProjectId(): string | null {
  const gcloudProject = process.env.GCLOUD_PROJECT?.trim();
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (gcloudProject && googleCloudProject && gcloudProject !== googleCloudProject) return null;
  return gcloudProject || googleCloudProject || null;
}

export function assertRuntimeEnvironment(): RuntimeEnvironment {
  const projectId = configuredProjectId();
  const functionsEmulator = process.env.FUNCTIONS_EMULATOR === "true";

  if (functionsEmulator && projectId?.startsWith("demo-")) return "EMULATOR";

  if (
    !functionsEmulator &&
    projectId === PRODUCTION_PROJECT_ID &&
    process.env.APP_ENV === "production"
  ) {
    return "PRODUCTION";
  }

  throw domainErrors.environmentNotAllowed();
}
