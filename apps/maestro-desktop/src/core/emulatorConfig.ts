export interface EmulatorConfig {
  readonly projectId: string;
  readonly host: string;
}

export function loadEmulatorConfig(): EmulatorConfig {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-vivero-control-etapa3";
  const useEmulators = (import.meta.env.VITE_USE_FIREBASE_EMULATORS || "true") === "true";
  if (!useEmulators || !projectId.startsWith("demo-")) {
    throw new Error("Vivero Maestro solo admite un proyecto demo-* conectado a emuladores.");
  }
  return {
    projectId,
    host: import.meta.env.VITE_EMULATOR_HOST || "127.0.0.1",
  };
}
