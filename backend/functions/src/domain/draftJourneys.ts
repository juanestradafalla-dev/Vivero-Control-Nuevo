import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentSnapshot, type Firestore} from "firebase-admin/firestore";

import type {
  CancelledDraftJourneySummary,
  ClosingJourneySummary,
  CreateDraftJourneyRequest,
  CreateDraftJourneyResult,
  DraftCatalogLine,
  DraftJourneySummary,
  DraftParticipant,
  InventoryReportConfiguration,
  ListManageableJourneysResult,
  TrustedOperationContext,
  UpdateDraftJourneyLinesRequest,
  UpdateDraftJourneyLinesResult,
  VisibleLocation
} from "./contracts.js";
import {domainErrors} from "./errors.js";

interface UserDocument {
  readonly activo?: boolean;
  readonly nombreVisible?: string;
  readonly roles?: unknown;
}

interface JourneyDocument {
  readonly nombreVisible?: string;
  readonly estadoAdministrativo?: string;
  readonly creadaPorUsuarioId?: string;
  readonly creadorNombreVisible?: string;
  readonly version?: number;
  readonly creadaEn?: unknown;
  readonly actualizadaEn?: unknown;
  readonly tipoInactivacion?: string | null;
  readonly cancelacionVigenteId?: string | null;
  readonly canceladaPorUsuarioId?: string;
  readonly canceladaPorNombreVisible?: string;
  readonly motivoCancelacion?: string;
  readonly canceladaEn?: unknown;
  readonly configuracionInformeInventario?: InventoryReportConfiguration;
  readonly trabajoCierreId?: unknown;
}

interface CloseJourneyWorkDocument {
  readonly estado?: unknown;
  readonly fase?: unknown;
  readonly cursor?: unknown;
  readonly cantidadLineas?: unknown;
  readonly cantidadOcupaciones?: unknown;
  readonly cantidadAutorizaciones?: unknown;
  readonly lineasProcesadas?: unknown;
  readonly ocupacionesProcesadas?: unknown;
  readonly autorizacionesProcesadas?: unknown;
  readonly intentos?: unknown;
  readonly errorCodigo?: unknown;
  readonly errorMensaje?: unknown;
  readonly actualizadoEn?: unknown;
  readonly procesandoEn?: unknown;
}

const CLOSE_JOB_LEASE_MS = 15 * 60 * 1000;

interface LineDocument {
  readonly id?: string;
  readonly ubicacionId?: string;
  readonly codigo?: string;
  readonly nombreVisible?: string;
  readonly orden?: number;
  readonly activa?: boolean;
}

interface LocationDocument {
  readonly codigo?: string;
  readonly nombreVisible?: string;
  readonly ubicacionPadreId?: string;
}

function genericVisibleLocation(
  line: LineDocument,
  locations: ReadonlyMap<string, LocationDocument>
): VisibleLocation {
  if (
    typeof line.ubicacionId !== "string" || typeof line.codigo !== "string" ||
    typeof line.nombreVisible !== "string" || !Number.isInteger(line.orden)
  ) throw domainErrors.internal();
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = line.ubicacionId;
  while (currentId !== undefined) {
    if (visited.has(currentId)) throw domainErrors.internal();
    visited.add(currentId);
    const location = locations.get(currentId);
    if (!location || typeof location.nombreVisible !== "string") throw domainErrors.internal();
    path.unshift(location.nombreVisible);
    currentId = typeof location.ubicacionPadreId === "string" ? location.ubicacionPadreId : undefined;
  }
  const root = path[0];
  const leaf = path[path.length - 1];
  if (!root || !leaf) throw domainErrors.internal();
  return {
    vivero: root,
    modulo: path.length >= 3 ? path[1] as string : root,
    cama: leaf,
    linea: line.codigo,
    nombreVisible: line.nombreVisible,
    orden: line.orden as number
  };
}

interface JourneyLineDocument {
  readonly jornadaId?: string;
  readonly lineaId?: string;
}

interface DraftSelectionDocument {
  readonly lineaIds?: unknown;
}

interface ParticipantSelectionDocument {
  readonly participantes?: unknown;
}

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

type AdministrativeRole = "SUPERVISOR" | "ADMINISTRADOR";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function administrativeRole(user: UserDocument): AdministrativeRole {
  if (!Array.isArray(user.roles)) throw domainErrors.permissionDenied();
  if (user.roles.includes("ADMINISTRADOR")) return "ADMINISTRADOR";
  if (user.roles.includes("SUPERVISOR")) return "SUPERVISOR";
  throw domainErrors.permissionDenied();
}

function assertActiveUser(snapshot: DocumentSnapshot): UserDocument {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const user = snapshot.data() as UserDocument;
  if (user.activo !== true) throw domainErrors.userInactive();
  return user;
}

function isSafeVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) < Number.MAX_SAFE_INTEGER;
}

function selectionLineIds(selection: DraftSelectionDocument | undefined): string[] {
  if (selection === undefined) return [];
  if (!Array.isArray(selection.lineaIds) || selection.lineaIds.some((lineId) => typeof lineId !== "string")) {
    throw domainErrors.internal();
  }
  return [...selection.lineaIds].sort((left, right) => left.localeCompare(right));
}

function selectionParticipants(selection: ParticipantSelectionDocument | undefined): DraftParticipant[] {
  if (selection === undefined) return [];
  if (!Array.isArray(selection.participantes)) throw domainErrors.internal();
  return selection.participantes.map((value): DraftParticipant => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw domainErrors.internal();
    const participant = value as Record<string, unknown>;
    if (
      typeof participant.usuarioId !== "string" ||
      typeof participant.nombreVisible !== "string" ||
      !["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"].includes(participant.rol as string) ||
      typeof participant.puedeContar !== "boolean"
    ) {
      throw domainErrors.internal();
    }
    return {
      usuarioId: participant.usuarioId,
      nombreVisible: participant.nombreVisible,
      rol: participant.rol as DraftParticipant["rol"],
      puedeContar: participant.puedeContar
    };
  }).sort((left, right) => left.usuarioId.localeCompare(right.usuarioId));
}

export class CreateDraftJourneyService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: CreateDraftJourneyRequest,
    context: TrustedOperationContext
  ): Promise<CreateDraftJourneyResult> {
    const idempotencyId = sha256(`${context.actorId}:CREAR_JORNADA_BORRADOR:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      nombreVisible: request.nombreVisible,
      configuracionInformeInventario: request.configuracionInformeInventario ?? null
    }));
    const journeyId = randomUUID();
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, idempotencySnapshot] = await transaction.getAll(actorRef, idempotencyRef);
      if (!actorSnapshot || !idempotencySnapshot) throw domainErrors.internal();
      const actor = assertActiveUser(actorSnapshot);
      const role = administrativeRole(actor);

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<CreateDraftJourneyResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }

      const now = Timestamp.now();
      const actorName = actor.nombreVisible ?? "Usuario";
      const result: CreateDraftJourneyResult = {
        jornadaId: journeyId,
        nombreVisible: request.nombreVisible,
        estado: "BORRADOR",
        creadorUsuarioId: context.actorId,
        creadorNombreVisible: actorName,
        version: 1,
        cantidadLineas: 0,
        lineaIds: [],
        creadaEn: now.toDate().toISOString(),
        actualizadaEn: now.toDate().toISOString(),
        ...(request.configuracionInformeInventario === undefined ? {} : {
          configuracionInformeInventario: request.configuracionInformeInventario
        })
      };
      const journeyRef = this.firestore.collection("jornadas").doc(journeyId);
      const selectionRef = this.firestore.collection("seleccionesLineasJornada").doc(journeyId);
      const participantSelectionRef = this.firestore.collection("seleccionesParticipantesJornada").doc(journeyId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(journeyRef, {
        id: journeyId,
        nombreVisible: request.nombreVisible,
        estadoAdministrativo: "BORRADOR",
        creadaPorUsuarioId: context.actorId,
        creadorNombreVisible: actorName,
        rolCreador: role,
        version: 1,
        cantidadLineasSeleccionadas: 0,
        cantidadParticipantesSeleccionados: 0,
        entorno: "GESTION_CENTRAL",
        creadaEn: now,
        actualizadaEn: now,
        ...(request.configuracionInformeInventario === undefined ? {} : {
          configuracionInformeInventario: request.configuracionInformeInventario
        })
      });
      transaction.create(selectionRef, {
        id: journeyId,
        jornadaId: journeyId,
        lineaIds: [],
        cantidadLineas: 0,
        versionJornada: 1,
        actualizadaPorUsuarioId: context.actorId,
        actualizadaEn: now
      });
      transaction.create(participantSelectionRef, {
        id: journeyId,
        jornadaId: journeyId,
        participantes: [],
        cantidadParticipantes: 0,
        versionJornada: 1,
        actualizadaPorUsuarioId: context.actorId,
        actualizadaEn: now
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "JORNADA_BORRADOR_CREADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA",
        recursoId: journeyId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {nombreVisible: request.nombreVisible, version: 1}
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "CREAR_JORNADA_BORRADOR",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}

export class UpdateDraftJourneyLinesService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: UpdateDraftJourneyLinesRequest,
    context: TrustedOperationContext
  ): Promise<UpdateDraftJourneyLinesResult> {
    const idempotencyId = sha256(
      `${context.actorId}:ACTUALIZAR_LINEAS_JORNADA_BORRADOR:${request.claveIdempotencia}`
    );
    const payloadHash = sha256(JSON.stringify({jornadaId: request.jornadaId, lineaIds: request.lineaIds}));
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const lineRefs = request.lineaIds.map((lineId) => this.firestore.collection("lineas").doc(lineId));
      const snapshots = await transaction.getAll(actorRef, journeyRef, idempotencyRef, ...lineRefs);
      const [actorSnapshot, journeySnapshot, idempotencySnapshot, ...lineSnapshots] = snapshots;
      if (!actorSnapshot || !journeySnapshot || !idempotencySnapshot) throw domainErrors.internal();
      const actor = assertActiveUser(actorSnapshot);
      const role = administrativeRole(actor);

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<UpdateDraftJourneyLinesResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }

      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      if (journey.estadoAdministrativo !== "BORRADOR") throw domainErrors.journeyNotDraft();
      if (role !== "ADMINISTRADOR" && journey.creadaPorUsuarioId !== context.actorId) {
        throw domainErrors.journeyDraftAccessDenied();
      }
      if (!isSafeVersion(journey.version)) throw domainErrors.internal();

      for (const lineSnapshot of lineSnapshots) {
        if (!lineSnapshot.exists) throw domainErrors.lineNotFound();
        if ((lineSnapshot.data() as LineDocument).activa !== true) throw domainErrors.lineInactive();
      }

      const memberships = await Promise.all(request.lineaIds.map((lineId) => transaction.get(
        this.firestore.collection("jornadaLineas").where("lineaId", "==", lineId)
      )));
      const membershipJourneyIds = [...new Set(memberships.flatMap((snapshot) => snapshot.docs.map((document) => {
        const membership = document.data() as JourneyLineDocument;
        return membership.jornadaId;
      })).filter((journeyId): journeyId is string => typeof journeyId === "string"))];
      const membershipJourneys = membershipJourneyIds.length === 0
        ? []
        : await transaction.getAll(...membershipJourneyIds.map((journeyId) =>
            this.firestore.collection("jornadas").doc(journeyId)
          ));
      if (membershipJourneys.some((snapshot) => {
        if (!snapshot.exists) return false;
        const state = (snapshot.data() as JourneyDocument).estadoAdministrativo;
        return state === "ACTIVA" || state === "CERRANDO";
      })) {
        throw domainErrors.lineAlreadyInActiveJourney();
      }

      const now = Timestamp.now();
      const nextVersion = (journey.version as number) + 1;
      const result: UpdateDraftJourneyLinesResult = {
        jornadaId: request.jornadaId,
        estado: "BORRADOR",
        version: nextVersion,
        cantidadLineas: request.lineaIds.length,
        lineaIds: request.lineaIds,
        actualizadaEn: now.toDate().toISOString()
      };
      const selectionRef = this.firestore.collection("seleccionesLineasJornada").doc(request.jornadaId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.set(selectionRef, {
        id: request.jornadaId,
        jornadaId: request.jornadaId,
        lineaIds: request.lineaIds,
        cantidadLineas: request.lineaIds.length,
        versionJornada: nextVersion,
        actualizadaPorUsuarioId: context.actorId,
        actualizadaEn: now
      });
      transaction.update(journeyRef, {
        cantidadLineasSeleccionadas: request.lineaIds.length,
        version: nextVersion,
        actualizadaEn: now
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "LINEAS_JORNADA_BORRADOR_ACTUALIZADAS",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA",
        recursoId: request.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {cantidadLineas: request.lineaIds.length, version: nextVersion, payloadHash}
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "ACTUALIZAR_LINEAS_JORNADA_BORRADOR",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}

export class ListManageableJourneysService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<ListManageableJourneysResult> {
    const actorSnapshot = await this.firestore.collection("usuarios").doc(context.actorId).get();
    const actor = assertActiveUser(actorSnapshot);
    const role = administrativeRole(actor);
    let draftQuery = this.firestore.collection("jornadas").where("estadoAdministrativo", "==", "BORRADOR");
    let inactiveQuery = this.firestore.collection("jornadas").where("estadoAdministrativo", "==", "INACTIVA");
    let closingQuery = this.firestore.collection("jornadas").where("estadoAdministrativo", "==", "CERRANDO");
    if (role === "SUPERVISOR") {
      draftQuery = draftQuery.where("creadaPorUsuarioId", "==", context.actorId);
      inactiveQuery = inactiveQuery.where("creadaPorUsuarioId", "==", context.actorId);
      closingQuery = closingQuery.where("creadaPorUsuarioId", "==", context.actorId);
    }
    const [
      journeysSnapshot,
      inactiveJourneysSnapshot,
      closingJourneysSnapshot,
      linesSnapshot,
      locationsSnapshot,
      activeJourneysSnapshot,
      operationalLinesSnapshot
    ] =
      await Promise.all([
        draftQuery.get(),
        inactiveQuery.get(),
        closingQuery.get(),
        this.firestore.collection("lineas").get(),
        this.firestore.collection("ubicaciones").get(),
        this.firestore.collection("jornadas").where("estadoAdministrativo", "==", "ACTIVA").get(),
        this.firestore.collection("jornadaLineas").get()
      ]);
    const closingJobSnapshots = closingJourneysSnapshot.empty
      ? []
      : await this.firestore.getAll(...closingJourneysSnapshot.docs.map((journeySnapshot) => {
          const workId = (journeySnapshot.data() as JourneyDocument).trabajoCierreId;
          if (typeof workId !== "string" || workId !== journeySnapshot.id) throw domainErrors.internal();
          return this.firestore.collection("trabajosCierreJornada").doc(workId);
        }));
    const closingJobById = new Map(closingJobSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    const cancelledJourneyDocuments = inactiveJourneysSnapshot.docs.filter((snapshot) =>
      (snapshot.data() as JourneyDocument).tipoInactivacion === "CANCELACION_BORRADOR"
    );
    const manageableDocuments = [...journeysSnapshot.docs, ...cancelledJourneyDocuments];
    const selectionSnapshots = manageableDocuments.length === 0
      ? []
      : await this.firestore.getAll(...manageableDocuments.map((journey) =>
          this.firestore.collection("seleccionesLineasJornada").doc(journey.id)
        ));
    const selectionByJourneyId = new Map(selectionSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    const participantSelectionSnapshots = cancelledJourneyDocuments.length === 0
      ? []
      : await this.firestore.getAll(...cancelledJourneyDocuments.map((journey) =>
          this.firestore.collection("seleccionesParticipantesJornada").doc(journey.id)
        ));
    const participantSelectionByJourneyId = new Map(
      participantSelectionSnapshots.map((snapshot) => [snapshot.id, snapshot])
    );

    const journeys = journeysSnapshot.docs.map((snapshot) => {
      const journey = snapshot.data() as JourneyDocument;
      const selectionSnapshot = selectionByJourneyId.get(snapshot.id);
      const selection = selectionSnapshot?.exists
        ? selectionSnapshot.data() as DraftSelectionDocument
        : undefined;
      if (
        typeof journey.nombreVisible !== "string" ||
        typeof journey.creadaPorUsuarioId !== "string" ||
        !isSafeVersion(journey.version) ||
        !(journey.creadaEn instanceof Timestamp) ||
        !(journey.actualizadaEn instanceof Timestamp)
      ) {
        throw domainErrors.internal();
      }
      const lineIds = selectionLineIds(selection);
      const summary: DraftJourneySummary = {
        jornadaId: snapshot.id,
        nombreVisible: journey.nombreVisible,
        estado: "BORRADOR",
        creadorUsuarioId: journey.creadaPorUsuarioId,
        creadorNombreVisible: journey.creadorNombreVisible ?? "Usuario",
        version: journey.version,
        cantidadLineas: lineIds.length,
        lineaIds: lineIds,
        creadaEn: journey.creadaEn.toDate().toISOString(),
        actualizadaEn: journey.actualizadaEn.toDate().toISOString(),
        ...(journey.configuracionInformeInventario === undefined ? {} : {
          configuracionInformeInventario: journey.configuracionInformeInventario
        })
      };
      return {summary, createdAt: journey.creadaEn.toMillis()};
    });
    const cancelledJourneys = cancelledJourneyDocuments.map((snapshot) => {
      const journey = snapshot.data() as JourneyDocument;
      const selectionSnapshot = selectionByJourneyId.get(snapshot.id);
      const participantSelectionSnapshot = participantSelectionByJourneyId.get(snapshot.id);
      if (
        typeof journey.nombreVisible !== "string" ||
        typeof journey.creadaPorUsuarioId !== "string" ||
        !isSafeVersion(journey.version) ||
        typeof journey.cancelacionVigenteId !== "string" ||
        typeof journey.canceladaPorUsuarioId !== "string" ||
        typeof journey.canceladaPorNombreVisible !== "string" ||
        typeof journey.motivoCancelacion !== "string" ||
        !(journey.canceladaEn instanceof Timestamp) ||
        !(journey.creadaEn instanceof Timestamp) ||
        !(journey.actualizadaEn instanceof Timestamp)
      ) {
        throw domainErrors.internal();
      }
      const lineIds = selectionLineIds(selectionSnapshot?.exists
        ? selectionSnapshot.data() as DraftSelectionDocument
        : undefined);
      const summary: CancelledDraftJourneySummary = {
        jornadaId: snapshot.id,
        nombreVisible: journey.nombreVisible,
        estado: "INACTIVA",
        tipoInactivacion: "CANCELACION_BORRADOR",
        creadorUsuarioId: journey.creadaPorUsuarioId,
        creadorNombreVisible: journey.creadorNombreVisible ?? "Usuario",
        version: journey.version,
        cantidadLineas: lineIds.length,
        lineaIds: lineIds,
        participantes: selectionParticipants(participantSelectionSnapshot?.exists
          ? participantSelectionSnapshot.data() as ParticipantSelectionDocument
          : undefined),
        cancelacionId: journey.cancelacionVigenteId,
        canceladaPorUsuarioId: journey.canceladaPorUsuarioId,
        canceladaPorNombreVisible: journey.canceladaPorNombreVisible,
        motivoCancelacion: journey.motivoCancelacion,
        canceladaEn: journey.canceladaEn.toDate().toISOString(),
        creadaEn: journey.creadaEn.toDate().toISOString(),
        actualizadaEn: journey.actualizadaEn.toDate().toISOString(),
        ...(journey.configuracionInformeInventario === undefined ? {} : {
          configuracionInformeInventario: journey.configuracionInformeInventario
        })
      };
      return {summary, cancelledAt: journey.canceladaEn.toMillis()};
    });
    const closingJourneys = closingJourneysSnapshot.docs.map((snapshot) => {
      const journey = snapshot.data() as JourneyDocument;
      const workSnapshot = closingJobById.get(snapshot.id);
      const work = workSnapshot?.data() as CloseJourneyWorkDocument | undefined;
      const workState = work?.estado;
      const phase = work?.fase;
      const boundedCount = (value: unknown, maximum: number) =>
        Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
      if (
        typeof journey.nombreVisible !== "string" ||
        typeof journey.creadaPorUsuarioId !== "string" ||
        typeof journey.creadorNombreVisible !== "string" ||
        !isSafeVersion(journey.version) ||
        typeof journey.trabajoCierreId !== "string" ||
        journey.trabajoCierreId !== snapshot.id ||
        !workSnapshot?.exists ||
        !["PENDIENTE", "PROCESANDO", "ERROR"].includes(String(workState)) ||
        !["LINEAS", "OCUPACIONES", "AUTORIZACIONES", "FINALIZAR"].includes(String(phase)) ||
        !boundedCount(work?.cursor, Number.MAX_SAFE_INTEGER) ||
        !boundedCount(work?.cantidadLineas, 400) ||
        !boundedCount(work?.cantidadOcupaciones, 400) ||
        !boundedCount(work?.cantidadAutorizaciones, 400) ||
        !boundedCount(work?.lineasProcesadas, 400) ||
        !boundedCount(work?.ocupacionesProcesadas, 400) ||
        !boundedCount(work?.autorizacionesProcesadas, 400) ||
        !boundedCount(work?.intentos, Number.MAX_SAFE_INTEGER) ||
        !(work?.actualizadoEn instanceof Timestamp) ||
        (workState === "ERROR" &&
          (typeof work?.errorCodigo !== "string" || typeof work?.errorMensaje !== "string")) ||
        (workState !== "ERROR" && (work?.errorCodigo !== undefined || work?.errorMensaje !== undefined))
      ) {
        throw domainErrors.internal();
      }
      const staleProcessingLease = workState === "PROCESANDO" && (
        !(work.procesandoEn instanceof Timestamp) ||
        Timestamp.now().toMillis() - work.procesandoEn.toMillis() >= CLOSE_JOB_LEASE_MS
      );
      const summary: ClosingJourneySummary = {
        jornadaId: snapshot.id,
        nombreVisible: journey.nombreVisible,
        estado: "CERRANDO",
        creadorUsuarioId: journey.creadaPorUsuarioId,
        creadorNombreVisible: journey.creadorNombreVisible,
        version: journey.version,
        trabajoCierreId: journey.trabajoCierreId,
        estadoTrabajo: workState as ClosingJourneySummary["estadoTrabajo"],
        fase: phase as ClosingJourneySummary["fase"],
        cursor: work.cursor as number,
        cantidadLineas: work.cantidadLineas as number,
        cantidadOcupaciones: work.cantidadOcupaciones as number,
        cantidadAutorizaciones: work.cantidadAutorizaciones as number,
        lineasProcesadas: work.lineasProcesadas as number,
        ocupacionesProcesadas: work.ocupacionesProcesadas as number,
        autorizacionesProcesadas: work.autorizacionesProcesadas as number,
        intentos: work.intentos as number,
        ...(workState === "ERROR" ? {
          errorCodigo: work.errorCodigo as string,
          errorMensaje: work.errorMensaje as string
        } : {}),
        actualizadaEn: work.actualizadoEn.toDate().toISOString(),
        puedeReintentar: workState === "ERROR" || staleProcessingLease
      };
      return {summary, updatedAt: work.actualizadoEn.toMillis()};
    });

    const locations = new Map(locationsSnapshot.docs.map((snapshot) => [
      snapshot.id,
      snapshot.data() as LocationDocument
    ]));
    const activeJourneyIds = new Set(activeJourneysSnapshot.docs.map((snapshot) => snapshot.id));
    const closingJourneyIds = new Set(closingJourneysSnapshot.docs.map((snapshot) => snapshot.id));
    const unavailableJourneyByLine = new Map<string, "JORNADA_ACTIVA" | "JORNADA_CERRANDO">();
    operationalLinesSnapshot.docs.forEach((snapshot) => {
      const membership = snapshot.data() as JourneyLineDocument;
      if (typeof membership.jornadaId !== "string" || typeof membership.lineaId !== "string") return;
      if (closingJourneyIds.has(membership.jornadaId)) {
        unavailableJourneyByLine.set(membership.lineaId, "JORNADA_CERRANDO");
      } else if (activeJourneyIds.has(membership.jornadaId)) {
        unavailableJourneyByLine.set(membership.lineaId, "JORNADA_ACTIVA");
      }
    });
    const catalogLines = linesSnapshot.docs.map((snapshot): DraftCatalogLine => {
      const line = snapshot.data() as LineDocument;
      const location = genericVisibleLocation(line, locations);
      const occupiedReason = unavailableJourneyByLine.get(snapshot.id);
      const selectable = line.activa === true && occupiedReason === undefined;
      const reason = line.activa !== true ? "LINEA_INACTIVA" as const : occupiedReason;
      return {
        lineaId: snapshot.id,
        nombreVisible: location.nombreVisible,
        seleccionable: selectable,
        ...(selectable ? {} : {motivoNoSeleccionable: reason as NonNullable<DraftCatalogLine["motivoNoSeleccionable"]>}),
        ubicacion: location
      };
    }).sort((left, right) =>
      left.ubicacion.vivero.localeCompare(right.ubicacion.vivero, "es") ||
      left.ubicacion.modulo.localeCompare(right.ubicacion.modulo, "es") ||
      left.ubicacion.cama.localeCompare(right.ubicacion.cama, "es") ||
      left.ubicacion.orden - right.ubicacion.orden
    );

    return {
      jornadas: journeys
        .sort((left, right) => right.createdAt - left.createdAt ||
          left.summary.nombreVisible.localeCompare(right.summary.nombreVisible, "es"))
        .map((journey) => journey.summary),
      jornadasCanceladas: cancelledJourneys
        .sort((left, right) => right.cancelledAt - left.cancelledAt ||
          left.summary.nombreVisible.localeCompare(right.summary.nombreVisible, "es"))
        .map((journey) => journey.summary),
      jornadasCerrando: closingJourneys
        .sort((left, right) => right.updatedAt - left.updatedAt ||
          left.summary.nombreVisible.localeCompare(right.summary.nombreVisible, "es"))
        .map((journey) => journey.summary),
      lineasCatalogo: catalogLines
    };
  }
}
