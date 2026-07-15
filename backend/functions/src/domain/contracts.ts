export type UserRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";

export type CentralLineState =
  | "DISPONIBLE"
  | "EN_CONTEO"
  | "PENDIENTE_REVISION"
  | "DEVUELTA"
  | "APROBADA";

export type ControlledErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_ARGUMENT"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "PERMISSION_DENIED"
  | "JOURNEY_NOT_FOUND"
  | "JOURNEY_NOT_ACTIVE"
  | "JOURNEY_NOT_DRAFT"
  | "JOURNEY_NAME_REQUIRED"
  | "JOURNEY_DRAFT_ACCESS_DENIED"
  | "JOURNEY_ACCESS_DENIED"
  | "JOURNEY_LINE_NOT_FOUND"
  | "LINE_NOT_FOUND"
  | "LINE_INACTIVE"
  | "LINE_ALREADY_IN_ACTIVE_JOURNEY"
  | "DUPLICATE_LINE_IDS"
  | "PARTICIPANT_NOT_FOUND"
  | "PARTICIPANT_INACTIVE"
  | "DUPLICATE_PARTICIPANT_IDS"
  | "ACTIVATION_STALE_SUMMARY"
  | "ACTIVATION_SELECTIONS_INCOMPLETE"
  | "ACTIVATION_LINES_REQUIRED"
  | "ACTIVATION_COUNTER_REQUIRED"
  | "ACTIVATION_REVIEWER_REQUIRED"
  | "ACTIVATION_LIMIT_EXCEEDED"
  | "ACTIVATION_PARTICIPANT_NOT_FOUND"
  | "ACTIVATION_PARTICIPANT_INACTIVE"
  | "ACTIVATION_PARTICIPANT_ROLE_CHANGED"
  | "ACTIVATION_LINE_NOT_FOUND"
  | "ACTIVATION_LINE_INACTIVE"
  | "ACTIVATION_LINE_OCCUPIED"
  | "LINE_NOT_AVAILABLE"
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_NOT_ACTIVE"
  | "RESERVATION_RELEASED"
  | "RESERVATION_RELEASE_NOT_ALLOWED"
  | "RESERVATION_RELEASE_REASON_REQUIRED"
  | "RESERVATION_ALREADY_COUNTED"
  | "RESERVATION_ACCESS_DENIED"
  | "DEVICE_MISMATCH"
  | "INVALID_RESERVATION_TOKEN"
  | "LINE_RESERVATION_MISMATCH"
  | "LINE_NOT_IN_COUNT"
  | "COUNT_NOT_FOUND"
  | "COUNT_NOT_RETURNED"
  | "COUNT_AUTHOR_MISMATCH"
  | "CORRECTION_RESPONSIBLE_MISMATCH"
  | "CORRECTION_REASSIGNMENT_NOT_ALLOWED"
  | "CORRECTION_ASSIGNEE_INACTIVE"
  | "CORRECTION_ASSIGNEE_UNAUTHORIZED"
  | "CORRECTION_REASSIGNMENT_REASON_REQUIRED"
  | "CORRECTION_REASSIGNMENT_NO_CHANGE"
  | "COUNT_NOT_PENDING_REVIEW"
  | "COUNT_LINE_MISMATCH"
  | "REVIEW_NOT_ALLOWED"
  | "SELF_APPROVAL_FORBIDDEN"
  | "EXCEPTION_REASON_REQUIRED"
  | "RETURN_REASON_REQUIRED"
  | "INVENTORY_NOT_FOUND"
  | "ACTIVE_RESERVATION_EXISTS"
  | "IDEMPOTENCY_CONFLICT"
  | "EMULATOR_ONLY"
  | "INTERNAL_ERROR";

export interface ReserveLineRequest {
  readonly jornadaLineaId: string;
  readonly dispositivoId: string;
  readonly claveIdempotencia: string;
}

export interface VisibleLocation {
  readonly vivero: string;
  readonly modulo: string;
  readonly cama: string;
  readonly linea: string;
  readonly nombreVisible: string;
  readonly orden: number;
}

export interface ReserveLineResult {
  readonly reservaId: string;
  readonly jornadaId: string;
  readonly jornadaLineaId: string;
  readonly estadoCentral: "EN_CONTEO";
  readonly tokenReserva: string;
  readonly reservadaEn: string;
  readonly version: number;
  readonly ubicacion: VisibleLocation;
}

export interface InitiateCountCorrectionRequest {
  readonly conteoId: string;
  readonly dispositivoId: string;
  readonly claveIdempotencia: string;
}

export interface InitiateCountCorrectionResult {
  readonly reservaId: string;
  readonly jornadaId: string;
  readonly jornadaLineaId: string;
  readonly conteoAnteriorId: string;
  readonly estadoCentral: "EN_CONTEO";
  readonly tipoReserva: "CORRECCION";
  readonly tokenReserva: string;
  readonly reservadaEn: string;
  readonly version: number;
  readonly versionConteoSiguiente: number;
  readonly ubicacion: VisibleLocation;
}

export interface ReassignCountCorrectionRequest {
  readonly conteoId: string;
  readonly nuevoUsuarioId: string;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface ReassignCountCorrectionResult {
  readonly reasignacionId: string;
  readonly conteoId: string;
  readonly jornadaLineaId: string;
  readonly autorOriginalUsuarioId: string;
  readonly responsableCorreccionUsuarioId: string;
  readonly responsableCorreccionNombreVisible: string;
  readonly actorUsuarioId: string;
  readonly motivo: string;
  readonly versionLinea: number;
  readonly reasignadaEn: string;
}

export interface SendCountRequest {
  readonly reservaId: string;
  readonly tokenReserva: string;
  readonly dispositivoId: string;
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly observaciones?: string;
  readonly timestampDispositivo: string;
  readonly claveIdempotencia: string;
}

export interface SendCountResult {
  readonly conteoId: string;
  readonly jornadaLineaId: string;
  readonly estadoCentral: "PENDIENTE_REVISION";
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly total: number;
  readonly versionConteo: number;
  readonly versionLinea: number;
  readonly recibidoEn: string;
}

/** Contexto construido exclusivamente desde Authentication y fuentes centrales. */
export interface TrustedOperationContext {
  readonly actorId: string;
}

export interface ActiveJourneySummary {
  readonly jornadaId: string;
  readonly nombreVisible: string;
  readonly estado: "ACTIVA";
  readonly rolEfectivo: UserRole;
  readonly puedeContar: boolean;
  readonly cantidadLineas: number;
}

export interface ListActiveJourneysResult {
  readonly jornadas: readonly ActiveJourneySummary[];
}

export interface CreateDraftJourneyRequest {
  readonly nombreVisible: string;
  readonly claveIdempotencia: string;
}

export interface DraftJourneySummary {
  readonly jornadaId: string;
  readonly nombreVisible: string;
  readonly estado: "BORRADOR";
  readonly creadorUsuarioId: string;
  readonly creadorNombreVisible: string;
  readonly version: number;
  readonly cantidadLineas: number;
  readonly lineaIds: readonly string[];
  readonly creadaEn: string;
  readonly actualizadaEn: string;
}

export type CreateDraftJourneyResult = DraftJourneySummary;

export interface UpdateDraftJourneyLinesRequest {
  readonly jornadaId: string;
  readonly lineaIds: readonly string[];
  readonly claveIdempotencia: string;
}

export interface UpdateDraftJourneyLinesResult {
  readonly jornadaId: string;
  readonly estado: "BORRADOR";
  readonly version: number;
  readonly cantidadLineas: number;
  readonly lineaIds: readonly string[];
  readonly actualizadaEn: string;
}

export interface DraftCatalogLine {
  readonly lineaId: string;
  readonly nombreVisible: string;
  readonly seleccionable: boolean;
  readonly motivoNoSeleccionable?: "JORNADA_ACTIVA";
  readonly ubicacion: VisibleLocation;
}

export interface ListManageableJourneysResult {
  readonly jornadas: readonly DraftJourneySummary[];
  readonly lineasCatalogo: readonly DraftCatalogLine[];
}

export interface ListDraftJourneyParticipantsRequest {
  readonly jornadaId: string;
}

export interface DraftParticipantInput {
  readonly usuarioId: string;
  readonly puedeContar: boolean;
}

export interface DraftParticipant extends DraftParticipantInput {
  readonly nombreVisible: string;
  readonly rol: UserRole;
}

export interface DraftParticipantCatalogEntry {
  readonly usuarioId: string;
  readonly nombreVisible: string;
  readonly rol: UserRole;
}

export interface ListDraftJourneyParticipantsResult {
  readonly jornadaId: string;
  readonly estado: "BORRADOR";
  readonly version: number;
  readonly versionSeleccionLineas: number;
  readonly versionSeleccionParticipantes: number;
  readonly participantes: readonly DraftParticipant[];
  readonly usuariosActivos: readonly DraftParticipantCatalogEntry[];
}

export interface UpdateDraftJourneyParticipantsRequest {
  readonly jornadaId: string;
  readonly participantes: readonly DraftParticipantInput[];
  readonly claveIdempotencia: string;
}

export interface UpdateDraftJourneyParticipantsResult {
  readonly jornadaId: string;
  readonly estado: "BORRADOR";
  readonly version: number;
  readonly cantidadParticipantes: number;
  readonly participantes: readonly DraftParticipant[];
  readonly actualizadaEn: string;
}

export interface ActivateJourneyRequest {
  readonly jornadaId: string;
  readonly versionJornadaEsperada: number;
  readonly versionSeleccionLineasEsperada: number;
  readonly versionSeleccionParticipantesEsperada: number;
  readonly claveIdempotencia: string;
}

export interface ActivateJourneyResult {
  readonly jornadaId: string;
  readonly estado: "ACTIVA";
  readonly version: number;
  readonly cantidadLineas: number;
  readonly cantidadParticipantes: number;
  readonly jornadaLineaIds: readonly string[];
  readonly participanteIds: readonly string[];
  readonly activadaEn: string;
}

/** Contrato de frontera reservado para una futura operación de revisión; no es enviarConteo. */
export interface SubmitCountRequest {
  readonly jornadaLineaId: string;
  readonly reservaId: string;
  readonly dispositivoId: string;
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly observaciones?: string;
  readonly claveIdempotencia: string;
}

export interface ReleaseReservationRequest {
  readonly reservaId: string;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface ReleaseReservationResult {
  readonly liberacionId: string;
  readonly reservaId: string;
  readonly jornadaLineaId: string;
  readonly tipoReserva: "INICIAL" | "CORRECCION";
  readonly estadoReserva: "LIBERADA";
  readonly estadoCentral: "DISPONIBLE" | "DEVUELTA";
  readonly versionLinea: number;
  readonly liberadaEn: string;
}

export interface ReturnCountRequest {
  readonly conteoId: string;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface ApproveCountRequest {
  readonly conteoId: string;
  readonly motivoExcepcion?: string;
  readonly claveIdempotencia: string;
}

export interface InventoryValues {
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly total: number;
}

export interface InventoryDifferences {
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly total: number;
}

export interface ApproveCountResult {
  readonly conteoId: string;
  readonly jornadaLineaId: string;
  readonly decisionId: string;
  readonly movimientoId: string;
  readonly estadoCentral: "APROBADA";
  readonly inventarioAnterior: InventoryValues;
  readonly inventarioNuevo: InventoryValues;
  readonly diferencias: InventoryDifferences;
  readonly versionInventario: number;
  readonly versionLinea: number;
  readonly aprobadaEn: string;
}

export interface ReturnCountResult {
  readonly conteoId: string;
  readonly jornadaLineaId: string;
  readonly decisionId: string;
  readonly estadoCentral: "DEVUELTA";
  readonly versionLinea: number;
  readonly devueltaEn: string;
}

export interface OperationResult {
  readonly accepted: boolean;
  readonly operationId: string;
}
