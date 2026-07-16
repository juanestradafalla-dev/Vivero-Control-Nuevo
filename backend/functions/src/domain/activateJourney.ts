import {createHash, randomUUID} from "node:crypto";

import {
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot
} from "firebase-admin/firestore";

import type {
  ActivateJourneyRequest,
  ActivateJourneyResult,
  TrustedOperationContext,
  UserRole,
  VisibleLocation
} from "./contracts.js";
import {domainErrors} from "./errors.js";

const ACTIVATION_MAX_COMBINED_ITEMS = 200;

interface UserDocument {
  readonly activo?: boolean;
  readonly nombreVisible?: string;
  readonly roles?: unknown;
}

interface JourneyDocument {
  readonly estadoAdministrativo?: string;
  readonly creadaPorUsuarioId?: string;
  readonly version?: number;
}

interface LineSelectionDocument {
  readonly lineaIds?: unknown;
  readonly versionJornada?: unknown;
}

interface StoredParticipant {
  readonly usuarioId?: unknown;
  readonly rol?: unknown;
  readonly puedeContar?: unknown;
}

interface ParticipantSelectionDocument {
  readonly participantes?: unknown;
  readonly versionJornada?: unknown;
}

interface LineDocument {
  readonly ubicacionId?: string;
  readonly codigo?: string;
  readonly nombreVisible?: string;
  readonly orden?: number;
  readonly activa?: boolean;
}

interface LocationDocument {
  readonly nombreVisible?: string;
  readonly ubicacionPadreId?: string;
}

interface JourneyLineDocument {
  readonly jornadaId?: string;
}

interface OccupationDocument {
  readonly jornadaId?: string;
}

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

interface ValidatedParticipant {
  readonly usuarioId: string;
  readonly nombreVisible: string;
  readonly rol: UserRole;
  readonly puedeContar: boolean;
}

type AdministrativeRole = "SUPERVISOR" | "ADMINISTRADOR";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function assertActiveActor(snapshot: DocumentSnapshot): UserDocument {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const user = snapshot.data() as UserDocument;
  if (user.activo !== true) throw domainErrors.userInactive();
  return user;
}

function administrativeRole(user: UserDocument): AdministrativeRole {
  if (!Array.isArray(user.roles)) throw domainErrors.permissionDenied();
  if (user.roles.includes("ADMINISTRADOR")) return "ADMINISTRADOR";
  if (user.roles.includes("SUPERVISOR")) return "SUPERVISOR";
  throw domainErrors.permissionDenied();
}

function centralRole(user: UserDocument): UserRole {
  if (!Array.isArray(user.roles)) throw domainErrors.activationParticipantRoleChanged();
  if (user.roles.includes("ADMINISTRADOR")) return "ADMINISTRADOR";
  if (user.roles.includes("SUPERVISOR")) return "SUPERVISOR";
  if (user.roles.includes("AUXILIAR")) return "AUXILIAR";
  throw domainErrors.activationParticipantRoleChanged();
}

function lineIds(selection: LineSelectionDocument): string[] {
  if (
    !Array.isArray(selection.lineaIds) ||
    selection.lineaIds.some((lineId) => typeof lineId !== "string") ||
    new Set(selection.lineaIds).size !== selection.lineaIds.length
  ) {
    throw domainErrors.activationSelectionsIncomplete();
  }
  return [...selection.lineaIds].sort((left, right) => left.localeCompare(right));
}

function selectedParticipants(selection: ParticipantSelectionDocument): StoredParticipant[] {
  if (!Array.isArray(selection.participantes)) throw domainErrors.activationSelectionsIncomplete();
  const participants = selection.participantes as StoredParticipant[];
  const ids = participants.map((participant) => participant.usuarioId);
  if (
    participants.some((participant) =>
      typeof participant.usuarioId !== "string" ||
      typeof participant.rol !== "string" ||
      typeof participant.puedeContar !== "boolean"
    ) ||
    new Set(ids).size !== ids.length
  ) {
    throw domainErrors.activationSelectionsIncomplete();
  }
  return [...participants].sort((left, right) =>
    (left.usuarioId as string).localeCompare(right.usuarioId as string)
  );
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function genericVisibleLocation(
  line: {readonly id: string; readonly data: LineDocument},
  locations: ReadonlyMap<string, LocationDocument>
): VisibleLocation {
  if (
    typeof line.data.ubicacionId !== "string" || typeof line.data.codigo !== "string" ||
    typeof line.data.nombreVisible !== "string" || !Number.isInteger(line.data.orden)
  ) throw domainErrors.internal();
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = line.data.ubicacionId;
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
    linea: line.data.codigo,
    nombreVisible: line.data.nombreVisible,
    orden: line.data.orden as number
  };
}

export class ActivateJourneyService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: ActivateJourneyRequest,
    context: TrustedOperationContext
  ): Promise<ActivateJourneyResult> {
    const idempotencyId = sha256(`${context.actorId}:ACTIVAR_JORNADA:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      jornadaId: request.jornadaId,
      versionJornadaEsperada: request.versionJornadaEsperada,
      versionSeleccionLineasEsperada: request.versionSeleccionLineasEsperada,
      versionSeleccionParticipantesEsperada: request.versionSeleccionParticipantesEsperada
    }));
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
      const lineSelectionRef = this.firestore.collection("seleccionesLineasJornada").doc(request.jornadaId);
      const participantSelectionRef = this.firestore
        .collection("seleccionesParticipantesJornada").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, journeySnapshot, lineSelectionSnapshot, participantSelectionSnapshot, idempotencySnapshot] =
        await transaction.getAll(
          actorRef,
          journeyRef,
          lineSelectionRef,
          participantSelectionRef,
          idempotencyRef
        );
      if (
        !actorSnapshot ||
        !journeySnapshot ||
        !lineSelectionSnapshot ||
        !participantSelectionSnapshot ||
        !idempotencySnapshot
      ) {
        throw domainErrors.internal();
      }
      const actorRole = administrativeRole(assertActiveActor(actorSnapshot));

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<ActivateJourneyResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return previous.resultado;
      }

      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      if (journey.estadoAdministrativo !== "BORRADOR") throw domainErrors.journeyNotDraft();
      if (actorRole !== "ADMINISTRADOR" && journey.creadaPorUsuarioId !== context.actorId) {
        throw domainErrors.journeyDraftAccessDenied();
      }
      if (!lineSelectionSnapshot.exists || !participantSelectionSnapshot.exists) {
        throw domainErrors.activationSelectionsIncomplete();
      }
      const lineSelection = lineSelectionSnapshot.data() as LineSelectionDocument;
      const participantSelection = participantSelectionSnapshot.data() as ParticipantSelectionDocument;
      if (
        !isVersion(journey.version) ||
        !isVersion(lineSelection.versionJornada) ||
        !isVersion(participantSelection.versionJornada) ||
        journey.version !== request.versionJornadaEsperada ||
        lineSelection.versionJornada !== request.versionSeleccionLineasEsperada ||
        participantSelection.versionJornada !== request.versionSeleccionParticipantesEsperada
      ) {
        throw domainErrors.activationStaleSummary();
      }

      const selectedLineIds = lineIds(lineSelection);
      const storedParticipants = selectedParticipants(participantSelection);
      if (selectedLineIds.length === 0) throw domainErrors.activationLinesRequired();
      if (!storedParticipants.some((participant) => participant.puedeContar === true)) {
        throw domainErrors.activationCounterRequired();
      }
      if (selectedLineIds.length + storedParticipants.length > ACTIVATION_MAX_COMBINED_ITEMS) {
        throw domainErrors.activationLimitExceeded();
      }

      const membershipSnapshots = await Promise.all(chunks(selectedLineIds, 30).map((lineIdChunk) =>
        transaction.get(this.firestore.collection("jornadaLineas").where("lineaId", "in", lineIdChunk))
      ));
      const membershipJourneyIds = [...new Set(membershipSnapshots.flatMap((snapshot) =>
        snapshot.docs.flatMap((document: QueryDocumentSnapshot) => {
          const membership = document.data() as JourneyLineDocument;
          return typeof membership.jornadaId === "string" && membership.jornadaId !== request.jornadaId
            ? [membership.jornadaId]
            : [];
        })
      ))];
      const membershipJourneys = membershipJourneyIds.length === 0
        ? []
        : await transaction.getAll(...membershipJourneyIds.map((journeyId) =>
            this.firestore.collection("jornadas").doc(journeyId)
          ));
      if (membershipJourneys.some((snapshot) =>
        snapshot.exists && (snapshot.data() as JourneyDocument).estadoAdministrativo === "ACTIVA"
      )) {
        throw domainErrors.activationLineOccupied();
      }

      const lineRefs = selectedLineIds.map((lineId) => this.firestore.collection("lineas").doc(lineId));
      const participantRefs = storedParticipants.map((participant) =>
        this.firestore.collection("usuarios").doc(participant.usuarioId as string)
      );
      const occupationRefs = selectedLineIds.map((lineId) =>
        this.firestore.collection("ocupacionesLineasActivas").doc(lineId)
      );
      const resourceSnapshots = await transaction.getAll(...lineRefs, ...participantRefs, ...occupationRefs);
      const lineSnapshots = resourceSnapshots.slice(0, lineRefs.length);
      const participantSnapshots = resourceSnapshots.slice(
        lineRefs.length,
        lineRefs.length + participantRefs.length
      );
      const occupationSnapshots = resourceSnapshots.slice(lineRefs.length + participantRefs.length);

      occupationSnapshots.forEach((snapshot) => {
        if (snapshot.exists && (snapshot.data() as OccupationDocument).jornadaId !== request.jornadaId) {
          throw domainErrors.activationLineOccupied();
        }
      });
      const lines = lineSnapshots.map((snapshot) => {
        if (!snapshot.exists) throw domainErrors.activationLineNotFound();
        const line = snapshot.data() as LineDocument;
        if (line.activa !== true) throw domainErrors.activationLineInactive();
        if (
          typeof line.ubicacionId !== "string" ||
          typeof line.codigo !== "string" ||
          typeof line.nombreVisible !== "string" ||
          !Number.isInteger(line.orden)
        ) {
          throw domainErrors.internal();
        }
        return {id: snapshot.id, data: line};
      });
      const participants = participantSnapshots.map((snapshot, index): ValidatedParticipant => {
        if (!snapshot.exists) throw domainErrors.activationParticipantNotFound();
        const user = snapshot.data() as UserDocument;
        if (user.activo !== true) throw domainErrors.activationParticipantInactive();
        if (typeof user.nombreVisible !== "string" || user.nombreVisible.length === 0) {
          throw domainErrors.activationParticipantNotFound();
        }
        const stored = storedParticipants[index];
        if (!stored) throw domainErrors.internal();
        const role = centralRole(user);
        if (role !== stored.rol) throw domainErrors.activationParticipantRoleChanged();
        return {
          usuarioId: snapshot.id,
          nombreVisible: user.nombreVisible,
          rol: role,
          puedeContar: stored.puedeContar as boolean
        };
      });
      if (!participants.some((participant) =>
        participant.rol === "SUPERVISOR" || participant.rol === "ADMINISTRADOR"
      )) {
        throw domainErrors.activationReviewerRequired();
      }

      const locationSnapshots = await transaction.get(this.firestore.collection("ubicaciones"));
      const locations = new Map(locationSnapshots.docs.map((snapshot) => [
        snapshot.id, snapshot.data() as LocationDocument
      ]));
      const visibleLocations = new Map<string, VisibleLocation>(lines.map((line) => [
        line.id, genericVisibleLocation(line, locations)
      ]));

      const now = Timestamp.now();
      const nextVersion = (journey.version as number) + 1;
      if (!Number.isSafeInteger(nextVersion)) throw domainErrors.internal();
      const journeyLineIds = selectedLineIds.map((lineId) => `${request.jornadaId}__${lineId}`);
      const participantIds = participants.map((participant) => participant.usuarioId);
      const result: ActivateJourneyResult = {
        jornadaId: request.jornadaId,
        estado: "ACTIVA",
        version: nextVersion,
        cantidadLineas: selectedLineIds.length,
        cantidadParticipantes: participants.length,
        jornadaLineaIds: journeyLineIds,
        participanteIds: participantIds,
        activadaEn: now.toDate().toISOString()
      };

      selectedLineIds.forEach((lineId, index) => {
        const journeyLineId = journeyLineIds[index];
        const location = visibleLocations.get(lineId);
        if (!journeyLineId || !location) throw domainErrors.internal();
        transaction.create(this.firestore.collection("jornadaLineas").doc(journeyLineId), {
          id: journeyLineId,
          jornadaId: request.jornadaId,
          lineaId: lineId,
          activa: true,
          estadoCentral: "DISPONIBLE",
          reservaActivaId: null,
          version: 0,
          ubicacion: location,
          actualizadaEn: now
        });
        transaction.create(this.firestore.collection("ocupacionesLineasActivas").doc(lineId), {
          id: lineId,
          lineaId: lineId,
          jornadaId: request.jornadaId,
          activadaPorUsuarioId: context.actorId,
          activadaEn: now
        });
      });
      participants.forEach((participant) => {
        transaction.create(journeyRef.collection("autorizaciones").doc(participant.usuarioId), {
          id: participant.usuarioId,
          jornadaId: request.jornadaId,
          usuarioId: participant.usuarioId,
          usuarioNombreVisible: participant.nombreVisible,
          usuarioActivo: true,
          rolEfectivo: participant.rol,
          activa: true,
          puedeContar: participant.puedeContar,
          puedeRevisar: participant.rol === "SUPERVISOR" || participant.rol === "ADMINISTRADOR",
          creadaEn: now
        });
      });
      transaction.update(journeyRef, {
        estadoAdministrativo: "ACTIVA",
        version: nextVersion,
        activadaPorUsuarioId: context.actorId,
        activadaEn: now,
        actualizadaEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "JORNADA_ACTIVADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA",
        recursoId: request.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {
          cantidadLineas: selectedLineIds.length,
          cantidadParticipantes: participants.length,
          version: nextVersion,
          payloadHash
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "ACTIVAR_JORNADA",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}
