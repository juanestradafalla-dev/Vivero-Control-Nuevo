import {createHash, randomUUID} from "node:crypto";

import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore
} from "firebase-admin/firestore";

import type {
  CloseJourneyRequest,
  CloseJourneyResult,
  ClosingJourneyResult,
  ClosedJourneyResult,
  InventoryReportConfiguration,
  InventoryReportSummary,
  RetryCloseJourneyRequest,
  TrustedOperationContext,
  VisibleLocation
} from "./contracts.js";
import {DomainError, domainErrors} from "./errors.js";

export const CLOSE_MAX_LINES = 400;
export const CLOSE_BATCH_SIZE = 100;
const CLOSE_MAX_AUTHORIZATIONS = 400;
const INVENTORY_REPORT_SAFE_SIZE_BYTES = 750 * 1024;
const CLOSING_LEASE_MS = 15 * 60 * 1000;

export type CloseJobState = "PENDIENTE" | "PROCESANDO" | "ERROR" | "COMPLETADO";
export type CloseJobPhase = "LINEAS" | "OCUPACIONES" | "AUTORIZACIONES" | "FINALIZAR" | "COMPLETADO";

interface UserDocument {
  readonly activo?: boolean;
  readonly roles?: unknown;
  readonly nombreVisible?: unknown;
}

interface JourneyDocument {
  readonly estadoAdministrativo?: string;
  readonly creadaPorUsuarioId?: string;
  readonly version?: number;
  readonly nombreVisible?: string;
  readonly configuracionInformeInventario?: unknown;
  readonly activadaEn?: unknown;
  readonly trabajoCierreId?: unknown;
  readonly huellaCierre?: unknown;
}

interface JourneyLineDocument {
  readonly jornadaId?: string;
  readonly lineaId?: string;
  readonly activa?: boolean;
  readonly estadoCentral?: string;
  readonly version?: number;
  readonly reservaActivaId?: unknown;
  readonly responsableCorreccionUsuarioId?: unknown;
  readonly reasignacionActivaId?: unknown;
  readonly conteoVigenteId?: unknown;
  readonly ubicacion?: unknown;
}

interface CountDocument {
  readonly jornadaId?: string;
  readonly jornadaLineaId?: string;
  readonly lineaId?: string;
  readonly hembras?: number;
  readonly machos?: number;
  readonly patrones?: number;
  readonly plantasMuertas?: number;
  readonly total?: number;
  readonly inmutable?: boolean;
  readonly recibidoEn?: unknown;
  readonly observaciones?: unknown;
}

interface DiscardDocument {
  readonly jornadaId?: string;
  readonly jornadaLineaId?: string;
  readonly lineaId?: string;
  readonly totalUnico?: number;
  readonly causas?: unknown;
  readonly estado?: string;
  readonly capturaInmutable?: boolean;
  readonly recibidoEn?: unknown;
}

interface ReservationDocument {
  readonly jornadaId?: string;
  readonly estadoReserva?: string;
}

interface AuthorizationDocument {
  readonly jornadaId?: string;
  readonly activa?: boolean;
}

interface OccupationDocument {
  readonly jornadaId?: string;
  readonly lineaId?: string;
}

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

interface FrozenInventoryReport {
  readonly id: string;
  readonly jornadaId: string;
  readonly jornadaNombreVisible: string;
  readonly creadorJornadaUsuarioId: string;
  readonly solicitadoPorUsuarioId: string;
  readonly responsableUsuarioId: string;
  readonly responsableNombreVisible: string;
  readonly mes: number;
  readonly anio: number;
  readonly fuentePlantasMuertas: "CONTEO_FISICO" | "DESCARTES_APROBADOS";
  readonly activadaEn: Timestamp;
  readonly lineas: readonly Record<string, unknown>[];
}

export interface CloseJourneyJobDocument {
  readonly id: string;
  readonly jornadaId: string;
  readonly estado: CloseJobState;
  readonly fase: CloseJobPhase;
  readonly cursor: number;
  readonly cantidadLineas: number;
  readonly cantidadOcupaciones: number;
  readonly cantidadAutorizaciones: number;
  readonly lineasProcesadas: number;
  readonly ocupacionesProcesadas: number;
  readonly autorizacionesProcesadas: number;
  readonly intentos: number;
  readonly huellaAlcance: string;
  readonly versionInicio: number;
  readonly versionFinal: number;
  readonly actorUsuarioId: string;
  readonly claveIdempotencia: string;
  readonly idempotenciaId: string;
  readonly payloadHash: string;
  readonly lineaDocumentoIds: readonly string[];
  readonly lineaIds: readonly string[];
  readonly autorizacionIds: readonly string[];
  readonly informeCongelado?: FrozenInventoryReport;
  readonly creadoEn: Timestamp;
  readonly actualizadoEn: Timestamp;
  readonly procesamientoId?: string;
  readonly procesandoEn?: Timestamp;
  readonly errorCodigo?: string;
  readonly errorMensaje?: string;
  readonly finalizadoEn?: Timestamp;
}

type AdministrativeRole = "SUPERVISOR" | "ADMINISTRADOR";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function activeAdministrativeRole(snapshot: DocumentSnapshot): AdministrativeRole {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const user = snapshot.data() as UserDocument;
  if (user.activo !== true) throw domainErrors.userInactive();
  if (!Array.isArray(user.roles)) throw domainErrors.permissionDenied();
  if (user.roles.includes("ADMINISTRADOR")) return "ADMINISTRADOR";
  if (user.roles.includes("SUPERVISOR")) return "SUPERVISOR";
  throw domainErrors.permissionDenied();
}

function inventoryReportConfiguration(value: unknown): InventoryReportConfiguration | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw domainErrors.inventoryReportConfigurationInvalid();
  }
  const configuration = value as Record<string, unknown>;
  if (
    Object.keys(configuration).length !== 4 ||
    Object.keys(configuration).some((field) =>
      !["habilitado", "mes", "anio", "fuentePlantasMuertas"].includes(field)
    ) ||
    configuration.habilitado !== true ||
    !Number.isSafeInteger(configuration.mes) || (configuration.mes as number) < 1 ||
    (configuration.mes as number) > 12 ||
    !Number.isSafeInteger(configuration.anio) || (configuration.anio as number) < 2000 ||
    (configuration.anio as number) > 2100 ||
    (configuration.fuentePlantasMuertas !== "CONTEO_FISICO" &&
      configuration.fuentePlantasMuertas !== "DESCARTES_APROBADOS")
  ) {
    throw domainErrors.inventoryReportConfigurationInvalid();
  }
  return configuration as unknown as InventoryReportConfiguration;
}

function isVisibleLocation(value: unknown): value is VisibleLocation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const location = value as Record<string, unknown>;
  return ["vivero", "modulo", "cama", "linea", "nombreVisible"].every((field) =>
    typeof location[field] === "string" && location[field] !== ""
  ) && Number.isSafeInteger(location.orden);
}

function validCountValues(count: CountDocument): boolean {
  const values = [count.hembras, count.machos, count.patrones, count.total];
  if (values.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)) return false;
  const total = (count.hembras as number) + (count.machos as number) + (count.patrones as number);
  return Number.isSafeInteger(total) && count.total === total;
}

export class CloseJourneyService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: CloseJourneyRequest,
    context: TrustedOperationContext
  ): Promise<CloseJourneyResult> {
    const idempotencyId = sha256(`${context.actorId}:CERRAR_JORNADA:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      jornadaId: request.jornadaId,
      versionEsperada: request.versionEsperada
    }));
    let firstAttemptFingerprint: string | undefined;

    const initiation = await this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const closeJobRef = this.firestore.collection("trabajosCierreJornada").doc(request.jornadaId);
      const [actorSnapshot, journeySnapshot, idempotencySnapshot, closeJobSnapshot] = await transaction.getAll(
        actorRef,
        journeyRef,
        idempotencyRef,
        closeJobRef
      );
      if (!actorSnapshot || !journeySnapshot || !idempotencySnapshot || !closeJobSnapshot) {
        throw domainErrors.internal();
      }
      const actorRole = activeAdministrativeRole(actorSnapshot);

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<CloseJourneyResult>;
        if (previous.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
        if (previous.resultado) return {result: previous.resultado};
        if (!closeJobSnapshot.exists) throw domainErrors.internal();
        const existingJob = closeJobSnapshot.data() as CloseJourneyJobDocument;
        if (
          existingJob.idempotenciaId !== idempotencyId ||
          existingJob.payloadHash !== payloadHash ||
          existingJob.actorUsuarioId !== context.actorId
        ) throw domainErrors.idempotencyConflict();
        return {result: closingResultFromJob(existingJob)};
      }

      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      if (journey.estadoAdministrativo === "CERRANDO") throw domainErrors.journeyCloseInProgress();
      if (journey.estadoAdministrativo !== "ACTIVA") throw domainErrors.journeyNotActive();
      if (closeJobSnapshot.exists) throw domainErrors.journeyCloseInProgress();
      if (actorRole !== "ADMINISTRADOR" && journey.creadaPorUsuarioId !== context.actorId) {
        throw domainErrors.journeyCloseAccessDenied();
      }
      if (!Number.isSafeInteger(journey.version) || journey.version !== request.versionEsperada) {
        throw domainErrors.journeyCloseStaleVersion();
      }
      const reportConfiguration = inventoryReportConfiguration(journey.configuracionInformeInventario);
      const actor = actorSnapshot.data() as UserDocument;
      if (reportConfiguration !== undefined && (
        typeof journey.nombreVisible !== "string" || journey.nombreVisible.trim() === "" ||
        typeof journey.creadaPorUsuarioId !== "string" ||
        !(journey.activadaEn instanceof Timestamp) ||
        typeof actor.nombreVisible !== "string" || actor.nombreVisible.trim() === ""
      )) {
        throw domainErrors.inventoryReportConfigurationInvalid();
      }

      const [linesSnapshot, reservationsSnapshot, authorizationsSnapshot] = await Promise.all([
        transaction.get(this.firestore.collection("jornadaLineas").where("jornadaId", "==", request.jornadaId)),
        transaction.get(this.firestore.collection("reservas").where("jornadaId", "==", request.jornadaId)),
        transaction.get(journeyRef.collection("autorizaciones"))
      ]);
      const lines = linesSnapshot.docs.map((snapshot) => ({ref: snapshot.ref, data: snapshot.data() as JourneyLineDocument}));
      const authorizations = authorizationsSnapshot.docs.map((snapshot) => ({
        ref: snapshot.ref,
        data: snapshot.data() as AuthorizationDocument
      }));
      const attemptFingerprint = sha256(JSON.stringify({
        journeyVersion: journey.version,
        lines: lines.map(({ref, data}) => ({
          id: ref.id,
          state: data.estadoCentral,
          active: data.activa,
          version: data.version,
          reservationId: data.reservaActivaId ?? null,
          correctionUserId: data.responsableCorreccionUsuarioId ?? null,
          reassignmentId: data.reasignacionActivaId ?? null,
          countId: data.conteoVigenteId ?? null
        })).sort((left, right) => left.id.localeCompare(right.id)),
        activeReservations: reservationsSnapshot.docs
          .filter((snapshot) => (snapshot.data() as ReservationDocument).estadoReserva === "ACTIVA")
          .map((snapshot) => snapshot.id)
          .sort()
      }));
      if (firstAttemptFingerprint === undefined) firstAttemptFingerprint = attemptFingerprint;
      else if (firstAttemptFingerprint !== attemptFingerprint) throw domainErrors.journeyCloseStaleVersion();
      if (lines.length === 0 || lines.length > CLOSE_MAX_LINES ||
          authorizations.length > CLOSE_MAX_AUTHORIZATIONS) {
        throw domainErrors.journeyCloseLimitExceeded();
      }
      if (lines.some(({data}) => data.activa !== true || data.estadoCentral !== "APROBADA")) {
        throw domainErrors.journeyClosePendingLines();
      }
      if (reservationsSnapshot.docs.some((snapshot) => {
        const reservation = snapshot.data() as ReservationDocument;
        return reservation.jornadaId === request.jornadaId && reservation.estadoReserva === "ACTIVA";
      })) {
        throw domainErrors.journeyCloseActiveReservations();
      }
      if (lines.some(({data}) =>
        data.reservaActivaId != null ||
        data.responsableCorreccionUsuarioId != null ||
        data.reasignacionActivaId != null
      )) {
        throw domainErrors.journeyClosePendingCorrections();
      }
      const now = Timestamp.now();

      let reportLines: Array<{
        jornadaLineaId: string;
        lineaId: string;
        conteoId: string;
        ubicacion: VisibleLocation;
        hembras: number;
        machos: number;
        patrones: number;
        total: number;
        plantasMuertas: number;
        conteoRecibidoEn: string;
        observaciones?: string;
      }> | undefined;
      if (reportConfiguration !== undefined) {
        const countIds = lines.map(({data}) => {
          if (typeof data.conteoVigenteId !== "string") {
            throw domainErrors.inventoryReportCountIncompatible();
          }
          return data.conteoVigenteId;
        });
        if (new Set(countIds).size !== countIds.length) {
          throw domainErrors.inventoryReportCountIncompatible();
        }
        const countSnapshots = await transaction.getAll(...countIds.map((countId) =>
          this.firestore.collection("conteos").doc(countId)
        ));
        const approvedDeadPlants = new Map<string, number>();
        const expectedLines = new Map(lines.map(({ref, data}) => [ref.id, data.lineaId]));
        if (reportConfiguration.fuentePlantasMuertas === "DESCARTES_APROBADOS") {
          const discardsSnapshot = await transaction.get(
            this.firestore.collection("descartes").where("jornadaId", "==", request.jornadaId)
          );
          if (discardsSnapshot.docs.some((snapshot) =>
            (snapshot.data() as DiscardDocument).estado === "PENDIENTE_REVISION"
          )) {
            throw domainErrors.inventoryReportPendingDiscards();
          }
          for (const snapshot of discardsSnapshot.docs) {
            const discard = snapshot.data() as DiscardDocument;
            if (discard.estado !== "APROBADO") continue;
            if (
              discard.jornadaId !== request.jornadaId ||
              typeof discard.jornadaLineaId !== "string" ||
              typeof discard.lineaId !== "string" ||
              expectedLines.get(discard.jornadaLineaId) !== discard.lineaId ||
              discard.capturaInmutable !== true ||
              !(discard.recibidoEn instanceof Timestamp) ||
              discard.recibidoEn.toMillis() < (journey.activadaEn as Timestamp).toMillis() ||
              discard.recibidoEn.toMillis() > now.toMillis() ||
              typeof discard.causas !== "object" || discard.causas === null ||
              !Number.isSafeInteger((discard.causas as Record<string, unknown>).muertos) ||
              ((discard.causas as Record<string, unknown>).muertos as number) < 0
            ) {
              throw domainErrors.inventoryReportCountIncompatible();
            }
            const next = (approvedDeadPlants.get(discard.jornadaLineaId) ?? 0) +
              ((discard.causas as Record<string, unknown>).muertos as number);
            if (!Number.isSafeInteger(next)) throw domainErrors.inventoryReportCountIncompatible();
            approvedDeadPlants.set(discard.jornadaLineaId, next);
          }
        }
        reportLines = lines.map(({ref, data}, index) => {
          const countSnapshot = countSnapshots[index];
          const countId = countIds[index];
          if (!countSnapshot?.exists || countSnapshot.id !== countId) {
            throw domainErrors.inventoryReportCountIncompatible();
          }
          const count = countSnapshot.data() as CountDocument;
          if (
            count.inmutable !== true ||
            count.jornadaId !== request.jornadaId ||
            count.jornadaLineaId !== ref.id ||
            count.lineaId !== data.lineaId ||
            !validCountValues(count) ||
            !(count.recibidoEn instanceof Timestamp) ||
            (count.observaciones !== undefined && typeof count.observaciones !== "string") ||
            typeof data.lineaId !== "string" ||
            !isVisibleLocation(data.ubicacion)
          ) {
            throw domainErrors.inventoryReportCountIncompatible();
          }
          let deadPlants: number;
          if (reportConfiguration.fuentePlantasMuertas === "CONTEO_FISICO") {
            if (!Number.isSafeInteger(count.plantasMuertas) || (count.plantasMuertas as number) < 0) {
              throw domainErrors.inventoryReportCountIncompatible();
            }
            deadPlants = count.plantasMuertas as number;
          } else {
            if (count.plantasMuertas !== undefined) {
              throw domainErrors.inventoryReportCountIncompatible();
            }
            deadPlants = approvedDeadPlants.get(ref.id) ?? 0;
          }
          return {
            jornadaLineaId: ref.id,
            lineaId: data.lineaId,
            conteoId: countId as string,
            ubicacion: data.ubicacion,
            hembras: count.hembras as number,
            machos: count.machos as number,
            patrones: count.patrones as number,
            total: count.total as number,
            plantasMuertas: deadPlants,
            conteoRecibidoEn: count.recibidoEn.toDate().toISOString(),
            ...(count.observaciones === undefined ? {} : {observaciones: count.observaciones})
          };
        });
      }

      const lineIds = lines.map(({data}) => {
        if (typeof data.lineaId !== "string") throw domainErrors.internal();
        return data.lineaId;
      });
      if (new Set(lineIds).size !== lineIds.length) {
        throw domainErrors.journeyCloseOccupationMismatch();
      }
      const occupationSnapshots = lineIds.length === 0
        ? []
        : await transaction.getAll(...lineIds.map((lineId) =>
            this.firestore.collection("ocupacionesLineasActivas").doc(lineId)
          ));
      occupationSnapshots.forEach((snapshot, index) => {
        const occupation = snapshot.data() as OccupationDocument | undefined;
        if (
          !snapshot.exists ||
          occupation?.jornadaId !== request.jornadaId ||
          occupation.lineaId !== lineIds[index]
        ) {
          throw domainErrors.journeyCloseOccupationMismatch();
        }
      });

      const nextVersion = (journey.version as number) + 1;
      if (!Number.isSafeInteger(nextVersion)) throw domainErrors.internal();
      const frozenReport: FrozenInventoryReport | undefined =
        reportConfiguration !== undefined && reportLines !== undefined
        ? {
            id: request.jornadaId,
            jornadaId: request.jornadaId,
            jornadaNombreVisible: journey.nombreVisible as string,
            creadorJornadaUsuarioId: journey.creadaPorUsuarioId as string,
            solicitadoPorUsuarioId: context.actorId,
            responsableUsuarioId: context.actorId,
            responsableNombreVisible: actor.nombreVisible as string,
            mes: reportConfiguration.mes,
            anio: reportConfiguration.anio,
            fuentePlantasMuertas: reportConfiguration.fuentePlantasMuertas,
            activadaEn: journey.activadaEn as Timestamp,
            lineas: [...reportLines].sort((left, right) =>
              left.jornadaLineaId.localeCompare(right.jornadaLineaId)
            )
          }
        : undefined;
      if (frozenReport !== undefined &&
          Buffer.byteLength(JSON.stringify(frozenReport), "utf8") > INVENTORY_REPORT_SAFE_SIZE_BYTES) {
        throw domainErrors.journeyCloseLimitExceeded();
      }
      const sortedLines = [...lines].sort((left, right) => left.ref.id.localeCompare(right.ref.id));
      const sortedAuthorizations = [...authorizations]
        .sort((left, right) => left.ref.id.localeCompare(right.ref.id));
      sortedAuthorizations.forEach(({data}) => {
        if (data.jornadaId !== request.jornadaId) throw domainErrors.internal();
      });
      const sortedLineIds = sortedLines.map(({data}) => data.lineaId as string);
      const scopeHash = sha256(JSON.stringify({
        jornadaId: request.jornadaId,
        versionInicio: journey.version,
        versionFinal: nextVersion,
        lineas: sortedLines.map(({ref, data}) => ({
          documentoId: ref.id,
          lineaId: data.lineaId,
          estadoCentral: data.estadoCentral,
          activa: data.activa,
          version: data.version,
          conteoVigenteId: data.conteoVigenteId ?? null
        })),
        autorizaciones: sortedAuthorizations.map(({ref, data}) => ({id: ref.id, activa: data.activa})),
        ocupaciones: sortedLineIds,
        informe: frozenReport === undefined ? null : {
          mes: frozenReport.mes,
          anio: frozenReport.anio,
          fuentePlantasMuertas: frozenReport.fuentePlantasMuertas,
          lineas: frozenReport.lineas
        }
      }));
      const closeJob: CloseJourneyJobDocument = {
        id: request.jornadaId,
        jornadaId: request.jornadaId,
        estado: "PENDIENTE",
        fase: "LINEAS",
        cursor: 0,
        cantidadLineas: sortedLines.length,
        cantidadOcupaciones: sortedLineIds.length,
        cantidadAutorizaciones: sortedAuthorizations.length,
        lineasProcesadas: 0,
        ocupacionesProcesadas: 0,
        autorizacionesProcesadas: 0,
        intentos: 0,
        huellaAlcance: scopeHash,
        versionInicio: journey.version as number,
        versionFinal: nextVersion,
        actorUsuarioId: context.actorId,
        claveIdempotencia: request.claveIdempotencia,
        idempotenciaId: idempotencyId,
        payloadHash,
        lineaDocumentoIds: sortedLines.map(({ref}) => ref.id),
        lineaIds: sortedLineIds,
        autorizacionIds: sortedAuthorizations.map(({ref}) => ref.id),
        ...(frozenReport === undefined ? {} : {informeCongelado: frozenReport}),
        creadoEn: now,
        actualizadoEn: now
      };
      if (Buffer.byteLength(JSON.stringify(closeJob), "utf8") > 900 * 1024) {
        throw domainErrors.journeyCloseLimitExceeded();
      }
      const result = closingResultFromJob(closeJob);

      transaction.create(closeJobRef, closeJob);
      transaction.update(journeyRef, {
        estadoAdministrativo: "CERRANDO",
        version: nextVersion,
        trabajoCierreId: closeJobRef.id,
        huellaCierre: scopeHash,
        cierreIniciadoEn: now,
        cierreIniciadoPorUsuarioId: context.actorId,
        actualizadaEn: now
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "CERRAR_JORNADA",
        claveHash: idempotencyId,
        payloadHash,
        estado: "EN_PROCESO",
        trabajoCierreId: closeJobRef.id,
        claveIdempotencia: request.claveIdempotencia,
        resultado: result,
        creadoEn: now
      });
      return {result};
    });
    return initiation.result;
  }
}

interface ClaimedCloseJob {
  readonly jobId: string;
  readonly processingId: string;
}

export interface CloseJourneyWorkerHooks {
  readonly afterBatch?: (progress: {
    readonly jobId: string;
    readonly phase: CloseJobPhase;
    readonly cursor: number;
  }) => Promise<void>;
}

function sanitizedCloseError(error: unknown): {code: string; message: string} {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message.replace(/[\r\n\t]+/gu, " ").slice(0, 500) ||
        "El cierre no pudo continuar por una validacion central."
    };
  }
  return {
    code: "JOURNEY_CLOSE_PROCESSING_FAILED",
    message: "El cierre se interrumpio. Un usuario autorizado puede reanudarlo sin repetir lotes confirmados."
  };
}

function closingResultFromJob(job: CloseJourneyJobDocument): ClosingJourneyResult {
  if (job.fase === "COMPLETADO") throw domainErrors.internal();
  return {
    jornadaId: job.jornadaId,
    estado: "CERRANDO",
    version: job.versionFinal,
    trabajoCierreId: job.id,
    huellaAlcance: job.huellaAlcance,
    cantidadLineas: job.cantidadLineas,
    cantidadAutorizaciones: job.cantidadAutorizaciones,
    cantidadOcupaciones: job.cantidadOcupaciones,
    fase: job.fase,
    cursor: job.cursor,
    lineasProcesadas: job.lineasProcesadas,
    ocupacionesProcesadas: job.ocupacionesProcesadas,
    autorizacionesProcesadas: job.autorizacionesProcesadas,
    intentos: job.intentos,
    iniciadoEn: job.creadoEn.toDate().toISOString(),
    actualizadoEn: job.actualizadoEn.toDate().toISOString()
  };
}

function closeResultFromJob(job: CloseJourneyJobDocument, closedAt: Timestamp): ClosedJourneyResult {
  let reportSummary: InventoryReportSummary | undefined;
  if (job.informeCongelado !== undefined) {
    const timestamp = closedAt.toDate().toISOString();
    reportSummary = {
      informeId: job.jornadaId,
      jornadaId: job.jornadaId,
      jornadaNombreVisible: job.informeCongelado.jornadaNombreVisible,
      estado: "PENDIENTE",
      mes: job.informeCongelado.mes,
      anio: job.informeCongelado.anio,
      fuentePlantasMuertas: job.informeCongelado.fuentePlantasMuertas,
      intentos: 0,
      creadoEn: timestamp,
      actualizadoEn: timestamp
    };
  }
  return {
    jornadaId: job.jornadaId,
    estado: "INACTIVA",
    version: job.versionFinal,
    cantidadLineas: job.cantidadLineas,
    cantidadAutorizaciones: job.cantidadAutorizaciones,
    ocupacionesLiberadas: job.cantidadOcupaciones,
    cerradaEn: closedAt.toDate().toISOString(),
    ...(reportSummary === undefined ? {} : {informeInventario: reportSummary})
  };
}

function assertValidJob(jobId: string, job: CloseJourneyJobDocument): void {
  if (
    job.id !== jobId || job.jornadaId !== jobId ||
    !["PENDIENTE", "PROCESANDO", "ERROR", "COMPLETADO"].includes(job.estado) ||
    !["LINEAS", "OCUPACIONES", "AUTORIZACIONES", "FINALIZAR", "COMPLETADO"].includes(job.fase) ||
    !Number.isSafeInteger(job.cursor) || job.cursor < 0 ||
    !Number.isSafeInteger(job.intentos) || job.intentos < 0 ||
    job.lineaDocumentoIds.length !== job.cantidadLineas ||
    job.lineaIds.length !== job.cantidadLineas ||
    job.lineaIds.length !== job.cantidadOcupaciones ||
    job.autorizacionIds.length !== job.cantidadAutorizaciones ||
    job.cantidadLineas < 1 || job.cantidadLineas > CLOSE_MAX_LINES ||
    job.cantidadAutorizaciones < 0 || job.cantidadAutorizaciones > CLOSE_MAX_AUTHORIZATIONS ||
    typeof job.huellaAlcance !== "string" || job.huellaAlcance.length !== 64 ||
    !Number.isSafeInteger(job.versionInicio) || !Number.isSafeInteger(job.versionFinal) ||
    job.versionFinal !== job.versionInicio + 1
  ) throw domainErrors.internal();
}

function nextBatchState(
  phase: CloseJobPhase,
  end: number,
  total: number
): {phase: CloseJobPhase; cursor: number} {
  if (end < total) return {phase, cursor: end};
  if (phase === "LINEAS") return {phase: "OCUPACIONES", cursor: 0};
  if (phase === "OCUPACIONES") return {phase: "AUTORIZACIONES", cursor: 0};
  if (phase === "AUTORIZACIONES") return {phase: "FINALIZAR", cursor: 0};
  return {phase: "COMPLETADO", cursor: 0};
}

export class ProcessCloseJourneyService {
  constructor(
    private readonly firestore: Firestore,
    private readonly hooks: CloseJourneyWorkerHooks = {}
  ) {}

  private async claim(jobId: string): Promise<ClaimedCloseJob | undefined> {
    const processingId = randomUUID();
    return this.firestore.runTransaction(async (transaction) => {
      const jobRef = this.firestore.collection("trabajosCierreJornada").doc(jobId);
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists) throw domainErrors.journeyCloseJobNotFound();
      const job = snapshot.data() as CloseJourneyJobDocument;
      assertValidJob(jobId, job);
      if (job.estado === "COMPLETADO" || job.estado === "ERROR") return undefined;
      const now = Timestamp.now();
      const staleLease = job.estado === "PROCESANDO" && (
        !(job.procesandoEn instanceof Timestamp) ||
        now.toMillis() - job.procesandoEn.toMillis() >= CLOSING_LEASE_MS
      );
      if (job.estado === "PROCESANDO" && !staleLease) return undefined;
      if (job.intentos >= Number.MAX_SAFE_INTEGER) throw domainErrors.internal();
      transaction.update(jobRef, {
        estado: "PROCESANDO",
        procesamientoId: processingId,
        procesandoEn: now,
        intentos: job.intentos + 1,
        actualizadoEn: now,
        errorCodigo: FieldValue.delete(),
        errorMensaje: FieldValue.delete()
      });
      return {jobId, processingId};
    });
  }

  private validateClaimedJob(job: CloseJourneyJobDocument, claim: ClaimedCloseJob): void {
    assertValidJob(claim.jobId, job);
    if (job.estado !== "PROCESANDO" || job.procesamientoId !== claim.processingId) {
      throw domainErrors.journeyCloseLeaseLost();
    }
  }

  private async applyOperationalBatch(
    claim: ClaimedCloseJob,
    releaseInline: boolean
  ): Promise<{
    readonly phase: CloseJobPhase;
    readonly cursor: number;
    readonly completed: boolean;
  }> {
    return this.firestore.runTransaction(async (transaction) => {
      const jobRef = this.firestore.collection("trabajosCierreJornada").doc(claim.jobId);
      const journeyRef = this.firestore.collection("jornadas").doc(claim.jobId);
      const [jobSnapshot, journeySnapshot] = await transaction.getAll(jobRef, journeyRef);
      if (!jobSnapshot || !journeySnapshot || !jobSnapshot.exists || !journeySnapshot.exists) {
        throw domainErrors.internal();
      }
      const job = jobSnapshot.data() as CloseJourneyJobDocument;
      this.validateClaimedJob(job, claim);
      const journey = journeySnapshot.data() as JourneyDocument;
      if (
        journey.estadoAdministrativo !== "CERRANDO" ||
        journey.version !== job.versionFinal ||
        journey.trabajoCierreId !== job.id ||
        journey.huellaCierre !== job.huellaAlcance
      ) throw domainErrors.journeyCloseScopeChanged();

      if (job.fase === "FINALIZAR") {
        const now = Timestamp.now();
        const result = closeResultFromJob(job, now);
        const auditId = sha256(`JORNADA_CERRADA:${job.id}`);
        const auditRef = this.firestore.collection("auditoria").doc(auditId);
        const idempotencyRef = this.firestore.collection("idempotencia").doc(job.idempotenciaId);
        const reportRef = this.firestore.collection("informesInventario").doc(job.jornadaId);
        const refs: DocumentReference[] = [auditRef, idempotencyRef];
        if (job.informeCongelado !== undefined) refs.push(reportRef);
        const snapshots = await transaction.getAll(...refs);
        const auditSnapshot = snapshots[0];
        const idempotencySnapshot = snapshots[1];
        const reportSnapshot = job.informeCongelado === undefined ? undefined : snapshots[2];
        if (!auditSnapshot || !idempotencySnapshot || !idempotencySnapshot.exists) {
          throw domainErrors.internal();
        }
        if (auditSnapshot.exists || reportSnapshot?.exists) throw domainErrors.journeyCloseScopeChanged();
        const idempotency = idempotencySnapshot.data() as IdempotencyDocument<CloseJourneyResult>;
        if (idempotency.payloadHash !== job.payloadHash || idempotency.resultado?.estado !== "CERRANDO") {
          throw domainErrors.idempotencyConflict();
        }
        if (job.informeCongelado !== undefined) {
          transaction.create(reportRef, {
            ...job.informeCongelado,
            estado: "PENDIENTE",
            versionJornadaCierre: job.versionFinal,
            cerradaEn: now,
            intentos: 0,
            creadoEn: now,
            actualizadoEn: now
          });
        }
        transaction.update(journeyRef, {
          estadoAdministrativo: "INACTIVA",
          cerradaEn: now,
          cerradaPorUsuarioId: job.actorUsuarioId,
          actualizadaEn: now,
          ...(job.informeCongelado === undefined ? {} : {informeInventarioId: job.jornadaId})
        });
        transaction.create(auditRef, {
          id: auditId,
          tipo: "JORNADA_CERRADA",
          actorUsuarioId: job.actorUsuarioId,
          recursoTipo: "JORNADA",
          recursoId: job.jornadaId,
          claveIdempotencia: job.claveIdempotencia,
          ocurridoEn: now,
          metadatos: {
            cantidadLineas: job.cantidadLineas,
            cantidadAutorizaciones: job.cantidadAutorizaciones,
            ocupacionesLiberadas: job.cantidadOcupaciones,
            version: job.versionFinal,
            huellaAlcance: job.huellaAlcance,
            ...(job.informeCongelado === undefined ? {} : {informeInventarioId: job.jornadaId}),
            payloadHash: job.payloadHash
          }
        });
        transaction.update(idempotencyRef, {
          estado: "COMPLETADO",
          resultado: result,
          completadoEn: now
        });
        transaction.update(jobRef, {
          estado: "COMPLETADO",
          fase: "COMPLETADO",
          cursor: 0,
          actualizadoEn: now,
          finalizadoEn: now,
          procesamientoId: FieldValue.delete(),
          procesandoEn: FieldValue.delete(),
          errorCodigo: FieldValue.delete(),
          errorMensaje: FieldValue.delete()
        });
        return {phase: "COMPLETADO", cursor: 0, completed: true};
      }
      if (job.fase === "COMPLETADO") return {phase: "COMPLETADO", cursor: 0, completed: true};

      const ids = job.fase === "LINEAS" ? job.lineaDocumentoIds :
        job.fase === "OCUPACIONES" ? job.lineaIds : job.autorizacionIds;
      const start = job.cursor;
      if (ids.length === 0 && start === 0) {
        const next = nextBatchState(job.fase, 0, 0);
        const now = Timestamp.now();
        transaction.update(jobRef, {
          fase: next.phase,
          cursor: next.cursor,
          ...(job.fase === "LINEAS" ? {lineasProcesadas: 0} : {}),
          ...(job.fase === "OCUPACIONES" ? {ocupacionesProcesadas: 0} : {}),
          ...(job.fase === "AUTORIZACIONES" ? {autorizacionesProcesadas: 0} : {}),
          ...(releaseInline ? {
            estado: "PENDIENTE",
            procesamientoId: FieldValue.delete(),
            procesandoEn: FieldValue.delete()
          } : {}),
          actualizadoEn: now
        });
        return {phase: next.phase, cursor: next.cursor, completed: false};
      }
      const end = Math.min(start + CLOSE_BATCH_SIZE, ids.length);
      if (start > ids.length || end <= start) throw domainErrors.internal();
      const refs = ids.slice(start, end).map((id) => {
        if (job.fase === "LINEAS") return this.firestore.collection("jornadaLineas").doc(id);
        if (job.fase === "OCUPACIONES") return this.firestore.collection("ocupacionesLineasActivas").doc(id);
        return this.firestore.collection("jornadas").doc(job.jornadaId).collection("autorizaciones").doc(id);
      });
      const snapshots = await transaction.getAll(...refs);
      const now = Timestamp.now();
      snapshots.forEach((snapshot, offset) => {
        if (!snapshot?.exists) throw domainErrors.journeyCloseScopeChanged();
        if (job.fase === "LINEAS") {
          const line = snapshot.data() as JourneyLineDocument;
          const expectedLineId = job.lineaIds[start + offset];
          if (
            line.jornadaId !== job.jornadaId || line.lineaId !== expectedLineId ||
            line.activa !== true || line.estadoCentral !== "APROBADA" ||
            line.reservaActivaId != null || line.responsableCorreccionUsuarioId != null ||
            line.reasignacionActivaId != null
          ) throw domainErrors.journeyCloseScopeChanged();
          transaction.update(snapshot.ref, {activa: false, actualizadaEn: now});
        } else if (job.fase === "OCUPACIONES") {
          const occupation = snapshot.data() as OccupationDocument;
          if (occupation.jornadaId !== job.jornadaId || occupation.lineaId !== ids[start + offset]) {
            throw domainErrors.journeyCloseScopeChanged();
          }
          transaction.delete(snapshot.ref);
        } else {
          const authorization = snapshot.data() as AuthorizationDocument;
          if (authorization.jornadaId !== job.jornadaId) throw domainErrors.journeyCloseScopeChanged();
          transaction.update(snapshot.ref, {
            activa: false,
            desactivadaEn: now,
            desactivadaPorUsuarioId: job.actorUsuarioId
          });
        }
      });
      const next = nextBatchState(job.fase, end, ids.length);
      transaction.update(jobRef, {
        fase: next.phase,
        cursor: next.cursor,
        ...(job.fase === "LINEAS" ? {lineasProcesadas: end} : {}),
        ...(job.fase === "OCUPACIONES" ? {ocupacionesProcesadas: end} : {}),
        ...(job.fase === "AUTORIZACIONES" ? {autorizacionesProcesadas: end} : {}),
        ...(releaseInline ? {
          estado: "PENDIENTE",
          procesamientoId: FieldValue.delete(),
          procesandoEn: FieldValue.delete()
        } : {}),
        actualizadoEn: now
      });
      return {phase: next.phase, cursor: next.cursor, completed: false};
    });
  }

  private async releaseClaim(claim: ClaimedCloseJob): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.collection("trabajosCierreJornada").doc(claim.jobId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw domainErrors.journeyCloseJobNotFound();
      const job = snapshot.data() as CloseJourneyJobDocument;
      if (job.estado === "COMPLETADO") return;
      this.validateClaimedJob(job, claim);
      transaction.update(ref, {
        estado: "PENDIENTE",
        procesamientoId: FieldValue.delete(),
        procesandoEn: FieldValue.delete(),
        actualizadoEn: Timestamp.now()
      });
    });
  }

  private async markError(claim: ClaimedCloseJob, error: unknown): Promise<void> {
    const sanitized = sanitizedCloseError(error);
    await this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.collection("trabajosCierreJornada").doc(claim.jobId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const job = snapshot.data() as CloseJourneyJobDocument;
      if (job.estado !== "PROCESANDO" || job.procesamientoId !== claim.processingId) return;
      transaction.update(ref, {
        estado: "ERROR",
        errorCodigo: sanitized.code,
        errorMensaje: sanitized.message,
        procesamientoId: FieldValue.delete(),
        procesandoEn: FieldValue.delete(),
        actualizadoEn: Timestamp.now()
      });
    });
  }

  async processOneBatch(jobId: string): Promise<boolean> {
    const claim = await this.claim(jobId);
    if (!claim) return false;
    const preserveClaimForHook = this.hooks.afterBatch !== undefined;
    try {
      const progress = await this.applyOperationalBatch(claim, !preserveClaimForHook);
      if (!progress.completed) {
        if (preserveClaimForHook) {
          await this.hooks.afterBatch?.({jobId, phase: progress.phase, cursor: progress.cursor});
          await this.releaseClaim(claim);
        }
      }
      return true;
    } catch (error) {
      await this.markError(claim, error);
      throw error;
    }
  }

  async processUntilComplete(jobId: string): Promise<CloseJourneyResult> {
    for (let attempt = 0; attempt < 1_200; attempt += 1) {
      const snapshot = await this.firestore.collection("trabajosCierreJornada").doc(jobId).get();
      if (!snapshot.exists) throw domainErrors.journeyCloseJobNotFound();
      const job = snapshot.data() as CloseJourneyJobDocument;
      assertValidJob(jobId, job);
      if (job.estado === "COMPLETADO") {
        const idempotency = await this.firestore.collection("idempotencia").doc(job.idempotenciaId).get();
        const result = idempotency.data()?.resultado as CloseJourneyResult | undefined;
        if (!result) throw domainErrors.internal();
        return result;
      }
      if (job.estado === "ERROR") throw domainErrors.journeyCloseProcessingFailed();
      if (job.estado === "PROCESANDO") {
        const staleLease = !(job.procesandoEn instanceof Timestamp) ||
          Timestamp.now().toMillis() - job.procesandoEn.toMillis() >= CLOSING_LEASE_MS;
        if (staleLease) {
          await this.processOneBatch(jobId);
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
      await this.processOneBatch(jobId);
    }
    throw domainErrors.journeyCloseProcessingFailed();
  }

  async processTriggered(jobId: string, expectedScopeHash: unknown): Promise<void> {
    if (typeof expectedScopeHash !== "string") return;
    const snapshot = await this.firestore.collection("trabajosCierreJornada").doc(jobId).get();
    if (!snapshot.exists) return;
    const job = snapshot.data() as CloseJourneyJobDocument;
    if (job.huellaAlcance !== expectedScopeHash || job.estado === "COMPLETADO" || job.estado === "ERROR") return;
    if (job.estado === "PROCESANDO") {
      const staleLease = !(job.procesandoEn instanceof Timestamp) ||
        Timestamp.now().toMillis() - job.procesandoEn.toMillis() >= CLOSING_LEASE_MS;
      if (!staleLease) throw new Error("El lease del cierre sigue activo; Eventarc debe reintentar el evento.");
    }
    try {
      await this.processOneBatch(jobId);
    } catch (error) {
      if (error instanceof DomainError && error.code === "JOURNEY_CLOSE_JOB_NOT_FOUND") return;
      throw error;
    }
  }
}

export class RetryCloseJourneyService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: RetryCloseJourneyRequest,
    context: TrustedOperationContext
  ): Promise<CloseJourneyResult> {
    const idempotencyId = sha256(`${context.actorId}:REINTENTAR_CIERRE_JORNADA:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      jornadaId: request.jornadaId,
      versionEsperada: request.versionEsperada
    }));
    const outcome = await this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
      const jobRef = this.firestore.collection("trabajosCierreJornada").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, journeySnapshot, jobSnapshot, idempotencySnapshot] = await transaction.getAll(
        actorRef, journeyRef, jobRef, idempotencyRef
      );
      if (!actorSnapshot || !journeySnapshot || !jobSnapshot || !idempotencySnapshot) {
        throw domainErrors.internal();
      }
      const role = activeAdministrativeRole(actorSnapshot);
      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<CloseJourneyResult>;
        if (previous.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
        if (previous.resultado) return {result: previous.resultado};
      }
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      if (!jobSnapshot.exists) throw domainErrors.journeyCloseJobNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      const job = jobSnapshot.data() as CloseJourneyJobDocument;
      assertValidJob(jobSnapshot.id, job);
      if (role !== "ADMINISTRADOR" && journey.creadaPorUsuarioId !== context.actorId) {
        throw domainErrors.journeyCloseAccessDenied();
      }
      const now = Timestamp.now();
      const staleLease = job.estado === "PROCESANDO" && (
        !(job.procesandoEn instanceof Timestamp) ||
        now.toMillis() - job.procesandoEn.toMillis() >= CLOSING_LEASE_MS
      );
      if (journey.estadoAdministrativo !== "CERRANDO" || (job.estado !== "ERROR" && !staleLease)) {
        throw domainErrors.journeyCloseNotRetryable();
      }
      if (journey.version !== request.versionEsperada || job.versionFinal !== request.versionEsperada) {
        throw domainErrors.journeyCloseStaleVersion();
      }
      const requeuedJob: CloseJourneyJobDocument = {
        ...job,
        estado: "PENDIENTE",
        actualizadoEn: now
      };
      const result = closingResultFromJob(requeuedJob);
      transaction.update(jobRef, {
        estado: "PENDIENTE",
        errorCodigo: FieldValue.delete(),
        errorMensaje: FieldValue.delete(),
        procesamientoId: FieldValue.delete(),
        procesandoEn: FieldValue.delete(),
        actualizadoEn: now
      });
      if (!idempotencySnapshot.exists) {
        transaction.create(idempotencyRef, {
          id: idempotencyId,
          actorUsuarioId: context.actorId,
          operacion: "REINTENTAR_CIERRE_JORNADA",
          claveHash: idempotencyId,
          payloadHash,
          estado: "COMPLETADO",
          trabajoCierreId: job.id,
          resultado: result,
          completadoEn: now,
          creadoEn: now
        });
        const auditId = sha256(`CIERRE_JORNADA_REINTENTADO:${idempotencyId}`);
        transaction.create(this.firestore.collection("auditoria").doc(auditId), {
          id: auditId,
          tipo: "CIERRE_JORNADA_REINTENTADO",
          actorUsuarioId: context.actorId,
          recursoTipo: "JORNADA",
          recursoId: request.jornadaId,
          claveIdempotencia: request.claveIdempotencia,
          ocurridoEn: now,
          metadatos: {
            trabajoCierreId: job.id,
            fase: job.fase,
            cursor: job.cursor,
            intentos: job.intentos
          }
        });
      }
      return {result};
    });
    return outcome.result;
  }
}
