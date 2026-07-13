import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DisabledMonitorRepository, FirebaseMonitorRepository } from "./data/FirebaseMonitorRepository";
import type { MonitorRepository } from "./domain/MonitorModels";
import { App } from "./presentation/App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("No se encontró el contenedor raíz de Vivero Maestro.");
}

let repository: MonitorRepository;
try {
  repository = FirebaseMonitorRepository.create();
} catch {
  repository = new DisabledMonitorRepository();
}

createRoot(rootElement).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
);
