import { TECHNICAL_CONFIG } from "../core/technicalConfig";
import type { FoundationRepository } from "../domain/FoundationRepository";
import type { FoundationStatus } from "../domain/FoundationStatus";

export class StaticFoundationRepository implements FoundationRepository {
  currentStatus(): FoundationStatus {
    return {
      title: "Vivero Maestro",
      message: "Fundación técnica instalada",
      firebaseStatus:
        window.viveroFoundation?.getRuntimeStatus() ?? TECHNICAL_CONFIG.firebaseStatus,
    };
  }
}
