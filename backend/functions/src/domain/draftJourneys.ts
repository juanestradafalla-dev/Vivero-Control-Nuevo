import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentSnapshot, type Firestore} from "firebase-admin/firestore";

import type {
  CreateDraftJourneyRequest,
  CreateDraftJourneyResult,
  DraftCatalogLine,
  DraftJourneySummary,
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
}

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

interface JourneyLineDocument {
  readonly jornadaId?: string;
  readonly lineaId?: string;
}

interface DraftSelectionDocument {
  readonly lineaIds?: unknown;
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

export class CreateDraftJourneyService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: CreateDraftJourneyRequest,
    context: TrustedOperationContext
  ): Promise<CreateDraftJourneyResult> {
    const idempotencyId = sha256(`${context.actorId}:CREAR_JORNADA_BORRADOR:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({nombreVisible: request.nombreVisible}));
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
      const actorName = actor.nombreVisible ?? "Usuario de prueba";
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
        actualizadaEn: now.toDate().toISOString()
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
        entorno: "FICTICIO_EMULADOR",
        creadaEn: now,
        actualizadaEn: now
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
      if (membershipJourneys.some((snapshot) =>
        snapshot.exists && (snapshot.data() as JourneyDocument).estadoAdministrativo === "ACTIVA"
      )) {
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
    let query = this.firestore.collection("jornadas").where("estadoAdministrativo", "==", "BORRADOR");
    if (role === "SUPERVISOR") query = query.where("creadaPorUsuarioId", "==", context.actorId);
    const [journeysSnapshot, linesSnapshot, locationsSnapshot, activeJourneysSnapshot, operationalLinesSnapshot] =
      await Promise.all([
        query.get(),
        this.firestore.collection("lineas").where("activa", "==", true).get(),
        this.firestore.collection("ubicaciones").get(),
        this.firestore.collection("jornadas").where("estadoAdministrativo", "==", "ACTIVA").get(),
        this.firestore.collection("jornadaLineas").get()
      ]);
    const selectionSnapshots = journeysSnapshot.empty
      ? []
      : await this.firestore.getAll(...journeysSnapshot.docs.map((journey) =>
          this.firestore.collection("seleccionesLineasJornada").doc(journey.id)
        ));

    const journeys = journeysSnapshot.docs.map((snapshot, index) => {
      const journey = snapshot.data() as JourneyDocument;
      const selection = selectionSnapshots[index]?.exists
        ? selectionSnapshots[index]?.data() as DraftSelectionDocument
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
        creadorNombreVisible: journey.creadorNombreVisible ?? "Usuario de prueba",
        version: journey.version,
        cantidadLineas: lineIds.length,
        lineaIds: lineIds,
        creadaEn: journey.creadaEn.toDate().toISOString(),
        actualizadaEn: journey.actualizadaEn.toDate().toISOString()
      };
      return {summary, createdAt: journey.creadaEn.toMillis()};
    });

    const locations = new Map(locationsSnapshot.docs.map((snapshot) => [
      snapshot.id,
      snapshot.data() as LocationDocument
    ]));
    const activeJourneyIds = new Set(activeJourneysSnapshot.docs.map((snapshot) => snapshot.id));
    const linesInActiveJourneys = new Set(operationalLinesSnapshot.docs.flatMap((snapshot) => {
      const membership = snapshot.data() as JourneyLineDocument;
      return typeof membership.jornadaId === "string" &&
        activeJourneyIds.has(membership.jornadaId) &&
        typeof membership.lineaId === "string"
        ? [membership.lineaId]
        : [];
    }));
    const catalogLines = linesSnapshot.docs.map((snapshot): DraftCatalogLine => {
      const line = snapshot.data() as LineDocument;
      const bed = typeof line.ubicacionId === "string" ? locations.get(line.ubicacionId) : undefined;
      const module = typeof bed?.ubicacionPadreId === "string" ? locations.get(bed.ubicacionPadreId) : undefined;
      const nursery = typeof module?.ubicacionPadreId === "string" ? locations.get(module.ubicacionPadreId) : undefined;
      if (
        typeof line.nombreVisible !== "string" ||
        typeof line.codigo !== "string" ||
        !Number.isInteger(line.orden) ||
        typeof bed?.nombreVisible !== "string" ||
        typeof module?.nombreVisible !== "string" ||
        typeof nursery?.nombreVisible !== "string"
      ) {
        throw domainErrors.internal();
      }
      const location: VisibleLocation = {
        vivero: nursery.nombreVisible,
        modulo: module.nombreVisible,
        cama: bed.nombreVisible,
        linea: line.codigo,
        nombreVisible: line.nombreVisible,
        orden: line.orden as number
      };
      const selectable = !linesInActiveJourneys.has(snapshot.id);
      return {
        lineaId: snapshot.id,
        nombreVisible: line.nombreVisible,
        seleccionable: selectable,
        ...(selectable ? {} : {motivoNoSeleccionable: "JORNADA_ACTIVA" as const}),
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
      lineasCatalogo: catalogLines
    };
  }
}
