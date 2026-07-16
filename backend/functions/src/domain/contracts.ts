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
  | "JOURNEY_CLOSE_ACCESS_DENIED"
  | "JOURNEY_CLOSE_STALE_VERSION"
  | "JOURNEY_CLOSE_PENDING_LINES"
  | "JOURNEY_CLOSE_ACTIVE_RESERVATIONS"
  | "JOURNEY_CLOSE_PENDING_CORRECTIONS"
  | "JOURNEY_CLOSE_LIMIT_EXCEEDED"
  | "JOURNEY_CLOSE_OCCUPATION_MISMATCH"
  | "DRAFT_CANCELLATION_REASON_REQUIRED"
  | "DRAFT_CANCELLATION_STALE_VERSION"
  | "DRAFT_CANCELLATION_INVALID_STATE"
  | "DRAFT_CANCELLATION_OPERATIONAL_DATA_EXISTS"
  | "DRAFT_REOPEN_STALE_VERSION"
  | "DRAFT_REOPEN_INVALID_STATE"
  | "DRAFT_REOPEN_NOT_ALLOWED"
  | "USER_PROFILE_STALE_VERSION"
  | "SELF_DEACTIVATION_FORBIDDEN"
  | "SELF_ADMIN_ROLE_REMOVAL_FORBIDDEN"
  | "LAST_ACTIVE_ADMIN_REQUIRED"
  | "USER_ROLE_CHANGE_BLOCKED_ACTIVE_WORK"
  | "USER_PROFILE_NO_CHANGE"
  | "CATALOG_LOCATION_NOT_FOUND"
  | "CATALOG_LOCATION_INACTIVE"
  | "CATALOG_LINE_NOT_FOUND"
  | "CATALOG_STALE_VERSION"
  | "CATALOG_DUPLICATE_CODE"
  | "CATALOG_PARENT_CYCLE"
  | "CATALOG_LOCATION_HAS_ACTIVE_CHILDREN"
  | "CATALOG_LOCATION_HAS_ACTIVE_LINES"
  | "CATALOG_LINE_OCCUPIED"
  | "CATALOG_NO_CHANGE"
  | "INVENTORY_INITIAL_LINE_INACTIVE"
  | "INVENTORY_INITIAL_STALE_VERSION"
  | "INVENTORY_ALREADY_EXISTS"
  | "INVENTORY_INITIAL_ZERO_NOT_ALLOWED"
  | "INVENTORY_INITIAL_SOURCE_INVALID"
  | "INVENTORY_INITIAL_OPERATIONAL_ACTIVITY"
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
  readonly version: number;
  readonly puedeCerrar: boolean;
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

export interface CancelledDraftJourneySummary {
  readonly jornadaId: string;
  readonly nombreVisible: string;
  readonly estado: "INACTIVA";
  readonly tipoInactivacion: "CANCELACION_BORRADOR";
  readonly creadorUsuarioId: string;
  readonly creadorNombreVisible: string;
  readonly version: number;
  readonly cantidadLineas: number;
  readonly lineaIds: readonly string[];
  readonly participantes: readonly DraftParticipant[];
  readonly cancelacionId: string;
  readonly canceladaPorUsuarioId: string;
  readonly canceladaPorNombreVisible: string;
  readonly motivoCancelacion: string;
  readonly canceladaEn: string;
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
  readonly motivoNoSeleccionable?: "JORNADA_ACTIVA" | "LINEA_INACTIVA";
  readonly ubicacion: VisibleLocation;
}

export interface ListManageableJourneysResult {
  readonly jornadas: readonly DraftJourneySummary[];
  readonly jornadasCanceladas: readonly CancelledDraftJourneySummary[];
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

export interface CloseJourneyRequest {
  readonly jornadaId: string;
  readonly versionEsperada: number;
  readonly claveIdempotencia: string;
}

export interface CloseJourneyResult {
  readonly jornadaId: string;
  readonly estado: "INACTIVA";
  readonly version: number;
  readonly cantidadLineas: number;
  readonly cantidadAutorizaciones: number;
  readonly ocupacionesLiberadas: number;
  readonly cerradaEn: string;
}

export interface CancelDraftJourneyRequest {
  readonly jornadaId: string;
  readonly versionEsperada: number;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface CancelDraftJourneyResult {
  readonly jornadaId: string;
  readonly estado: "INACTIVA";
  readonly tipoInactivacion: "CANCELACION_BORRADOR";
  readonly version: number;
  readonly cancelacionId: string;
  readonly motivo: string;
  readonly canceladaPorUsuarioId: string;
  readonly canceladaPorNombreVisible: string;
  readonly canceladaEn: string;
}

export interface ReopenCancelledJourneyRequest {
  readonly jornadaId: string;
  readonly versionEsperada: number;
  readonly claveIdempotencia: string;
}

export interface ReopenCancelledJourneyResult {
  readonly jornadaId: string;
  readonly estado: "BORRADOR";
  readonly version: number;
  readonly cancelacionAnteriorId: string;
  readonly reabiertaEn: string;
}

export type UserRoleChangeBlocker = "JORNADA_ACTIVA" | "RESERVA_ACTIVA" | "CORRECCION_PENDIENTE";

export interface UserActiveWorkSummary {
  readonly jornadasActivas: number;
  readonly reservasActivas: number;
  readonly correccionesPendientes: number;
  readonly tieneTrabajoActivo: boolean;
  readonly bloqueosCambioRol: readonly UserRoleChangeBlocker[];
}

export interface ManageableUserSummary {
  readonly usuarioId: string;
  readonly nombreVisible: string;
  readonly rol: UserRole;
  readonly activo: boolean;
  readonly version: number;
  readonly puedeCambiarRol: boolean;
  readonly resumenTrabajoActivo: UserActiveWorkSummary;
}

export interface ListManageableUsersResult {
  readonly usuarios: readonly ManageableUserSummary[];
}

export interface UpdateUserStatusRequest {
  readonly usuarioId: string;
  readonly versionEsperada: number;
  readonly nuevoEstado: "ACTIVO" | "INACTIVO";
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface UpdateUserStatusResult extends ManageableUserSummary {
  readonly operacion: "ESTADO_USUARIO_ACTUALIZADO";
  readonly actualizadoEn: string;
}

export interface UpdateUserRoleRequest {
  readonly usuarioId: string;
  readonly versionEsperada: number;
  readonly nuevoRol: UserRole;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface UpdateUserRoleResult extends ManageableUserSummary {
  readonly operacion: "ROL_USUARIO_ACTUALIZADO";
  readonly actualizadoEn: string;
}

export interface CatalogLocationSummary {
  readonly ubicacionId: string;
  readonly codigo: string;
  readonly tipo: string;
  readonly ubicacionPadreId: string | null;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly activa: boolean;
  readonly version: number;
  readonly cantidadHijosActivos: number;
  readonly cantidadLineasActivas: number;
}

export interface CatalogLineSummary {
  readonly lineaId: string;
  readonly ubicacionId: string;
  readonly codigo: string;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly activa: boolean;
  readonly version: number;
  readonly ocupadaEnJornadaActiva: boolean;
  readonly seleccionesBorrador: number;
  readonly inventario: CatalogLineInventorySummary | null;
  readonly elegibleInventarioInicial: boolean;
  readonly motivoNoElegibleInventarioInicial: string | null;
}

export interface CatalogLineInventorySummary extends InventoryValues {
  readonly version: number;
  readonly origen: string;
  readonly actorUsuarioId: string;
  readonly actorNombreVisible: string;
  readonly actualizadoEn: string;
  readonly referenciaFuenteInicial: string | null;
}

export interface ListManageableCatalogResult {
  readonly ubicaciones: readonly CatalogLocationSummary[];
  readonly lineas: readonly CatalogLineSummary[];
}

export interface CreateCatalogLocationRequest {
  readonly codigo: string;
  readonly tipo: string;
  readonly ubicacionPadreId: string | null;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly claveIdempotencia: string;
}

export interface UpdateCatalogLocationRequest {
  readonly ubicacionId: string;
  readonly versionEsperada: number;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly activa: boolean;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface CatalogLocationResult extends CatalogLocationSummary {
  readonly operacion: "UBICACION_CREADA" | "UBICACION_ACTUALIZADA";
  readonly actualizadaEn: string;
}

export interface CreateCatalogLineRequest {
  readonly ubicacionId: string;
  readonly codigo: string;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly claveIdempotencia: string;
}

export interface UpdateCatalogLineRequest {
  readonly lineaId: string;
  readonly versionEsperada: number;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly activa: boolean;
  readonly motivo: string;
  readonly claveIdempotencia: string;
}

export interface CatalogLineResult extends CatalogLineSummary {
  readonly operacion: "LINEA_CREADA" | "LINEA_ACTUALIZADA";
  readonly actualizadaEn: string;
}

export interface RegisterInitialInventoryRequest {
  readonly lineaId: string;
  readonly versionLineaEsperada: number;
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly referenciaFuente: string;
  readonly claveIdempotencia: string;
}

export interface RegisterInitialInventoryResult extends InventoryValues {
  readonly lineaId: string;
  readonly cargaInventarioInicialId: string;
  readonly jornadaId: string | null;
  readonly jornadaLineaId: string | null;
  readonly versionInventario: 1;
  readonly origen: "CARGA_INICIAL_ADMINISTRATIVA_EMULADOR";
  readonly conteoAprobadoId: null;
  readonly referenciaFuente: string;
  readonly registradaPorUsuarioId: string;
  readonly registradaPorNombreVisible: string;
  readonly registradaEn: string;
}

export interface MigrationPackageMetadata {
  readonly nombrePaquete: string;
  readonly creadoEn: string;
  readonly referenciaFuente: string;
}

export interface MigrationPackageLocation {
  readonly claveExterna: string;
  readonly ubicacionPadreClaveExterna: string | null;
  readonly codigo: string;
  readonly tipo: string;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly activa: boolean;
}

export interface MigrationPackageLine {
  readonly claveExterna: string;
  readonly ubicacionClaveExterna: string;
  readonly codigo: string;
  readonly nombreVisible: string;
  readonly orden: number;
  readonly activa: boolean;
}

export interface MigrationPackageInitialInventory {
  readonly lineaClaveExterna: string;
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly referenciaFuente: string;
}

export interface MigrationCatalogPackageV1 {
  readonly formato: "paquete-migracion-catalogo-v1";
  readonly metadatos: MigrationPackageMetadata;
  readonly ubicaciones: readonly MigrationPackageLocation[];
  readonly lineas: readonly MigrationPackageLine[];
  readonly inventariosIniciales: readonly MigrationPackageInitialInventory[];
}

export type MigrationValidationEntity = "PAQUETE" | "UBICACION" | "LINEA" | "INVENTARIO_INICIAL";

export interface MigrationValidationIssue {
  readonly codigo: string;
  readonly severidad: "ERROR" | "ADVERTENCIA";
  readonly entidad: MigrationValidationEntity;
  readonly claveExterna: string | null;
  readonly mensaje: string;
}

export interface MigrationEntityConflictSummary {
  readonly nuevos: number;
  readonly coincidentes: number;
  readonly bloqueados: number;
}

export interface MigrationValidationResult {
  readonly formato: string;
  readonly hashPaquete: string;
  readonly cantidades: {
    readonly ubicaciones: number;
    readonly lineas: number;
    readonly inventariosIniciales: number;
  };
  readonly erroresBloqueantes: readonly MigrationValidationIssue[];
  readonly advertencias: readonly MigrationValidationIssue[];
  readonly resumenConflictos: {
    readonly ubicaciones: MigrationEntityConflictSummary;
    readonly lineas: MigrationEntityConflictSummary;
    readonly inventariosIniciales: MigrationEntityConflictSummary;
    readonly codigosExistentes: number;
    readonly clavesIncompatibles: number;
    readonly lineasConInventarioActual: number;
    readonly conflictosOperativos: number;
  };
  readonly aptoParaImportar: boolean;
  readonly soloValidacion: true;
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
