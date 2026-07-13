import type { FoundationStatus } from "./FoundationStatus";

export interface FoundationRepository {
  currentStatus(): FoundationStatus;
}
