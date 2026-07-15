import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentSnapshot, type Firestore} from "firebase-admin/firestore";

import type {
  DraftParticipant,
  DraftParticipantCatalogEntry,
  ListDraftJourneyParticipantsRequest,
  ListDraftJourneyParticipantsResult,
  TrustedOperationContext,
  UpdateDraftJourneyParticipantsRequest,
  UpdateDraftJourneyParticipantsResult,
  UserRole
} from "./contracts.js";
import {domainErrors} from "./errors.js";

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

interface StoredParticipant {
  readonly usuarioId?: unknown;
  readonly puedeContar?: unknown;
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

function assertActiveUser(snapshot: DocumentSnapshot): UserDocument {
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
  if (!Array.isArray(user.roles)) throw domainErrors.internal();
  if (user.roles.includes("ADMINISTRADOR")) return "ADMINISTRADOR";
  if (user.roles.includes("SUPERVISOR")) return "SUPERVISOR";
  if (user.roles.includes("AUXILIAR")) return "AUXILIAR";
  throw domainErrors.internal();
}

function assertManageableDraft(
  snapshot: DocumentSnapshot,
  actorId: string,
  role: AdministrativeRole
): JourneyDocument {
  if (!snapshot.exists) throw domainErrors.journeyNotFound();
  const journey = snapshot.data() as JourneyDocument;
  if (journey.estadoAdministrativo !== "BORRADOR") throw domainErrors.journeyNotDraft();
  if (role !== "ADMINISTRADOR" && journey.creadaPorUsuarioId !== actorId) {
    throw domainErrors.journeyDraftAccessDenied();
  }
  if (!Number.isSafeInteger(journey.version) || (journey.version as number) < 1) {
    throw domainErrors.internal();
  }
  return journey;
}

function participantCatalogEntry(snapshot: DocumentSnapshot): DraftParticipantCatalogEntry {
  const user = assertActiveUser(snapshot);
  if (typeof user.nombreVisible !== "string" || user.nombreVisible.length === 0) {
    throw domainErrors.internal();
  }
  return {
    usuarioId: snapshot.id,
    nombreVisible: user.nombreVisible,
    rol: centralRole(user)
  };
}

function storedParticipants(selection: ParticipantSelectionDocument | undefined): StoredParticipant[] {
  if (selection === undefined) return [];
  if (!Array.isArray(selection.participantes)) throw domainErrors.internal();
  return selection.participantes as StoredParticipant[];
}

export class ListDraftJourneyParticipantsService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: ListDraftJourneyParticipantsRequest,
    context: TrustedOperationContext
  ): Promise<ListDraftJourneyParticipantsResult> {
    const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
    const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
    const selectionRef = this.firestore.collection("seleccionesParticipantesJornada").doc(request.jornadaId);
    const [actorSnapshot, journeySnapshot, selectionSnapshot] = await this.firestore.getAll(
      actorRef,
      journeyRef,
      selectionRef
    );
    if (!actorSnapshot || !journeySnapshot || !selectionSnapshot) throw domainErrors.internal();
    const role = administrativeRole(assertActiveUser(actorSnapshot));
    const journey = assertManageableDraft(journeySnapshot, context.actorId, role);
    const usersSnapshot = await this.firestore.collection("usuarios").where("activo", "==", true).get();
    const users = usersSnapshot.docs.map(participantCatalogEntry).sort((left, right) =>
      left.nombreVisible.localeCompare(right.nombreVisible, "es") || left.usuarioId.localeCompare(right.usuarioId)
    );
    const byId = new Map(users.map((user) => [user.usuarioId, user]));
    const participants = storedParticipants(
      selectionSnapshot.exists ? selectionSnapshot.data() as ParticipantSelectionDocument : undefined
    ).map((stored): DraftParticipant => {
      if (typeof stored.usuarioId !== "string" || typeof stored.puedeContar !== "boolean") {
        throw domainErrors.internal();
      }
      const user = byId.get(stored.usuarioId);
      if (!user) throw domainErrors.internal();
      return {...user, puedeContar: stored.puedeContar};
    }).sort((left, right) => left.usuarioId.localeCompare(right.usuarioId));

    return {
      jornadaId: request.jornadaId,
      estado: "BORRADOR",
      version: journey.version as number,
      participantes: participants,
      usuariosActivos: users
    };
  }
}

export class UpdateDraftJourneyParticipantsService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: UpdateDraftJourneyParticipantsRequest,
    context: TrustedOperationContext
  ): Promise<UpdateDraftJourneyParticipantsResult> {
    const idempotencyId = sha256(
      `${context.actorId}:ACTUALIZAR_PARTICIPANTES_JORNADA_BORRADOR:${request.claveIdempotencia}`
    );
    const payloadHash = sha256(JSON.stringify({
      jornadaId: request.jornadaId,
      participantes: request.participantes
    }));
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const participantRefs = request.participantes.map((participant) =>
        this.firestore.collection("usuarios").doc(participant.usuarioId)
      );
      const snapshots = await transaction.getAll(actorRef, journeyRef, idempotencyRef, ...participantRefs);
      const [actorSnapshot, journeySnapshot, idempotencySnapshot, ...participantSnapshots] = snapshots;
      if (!actorSnapshot || !journeySnapshot || !idempotencySnapshot) throw domainErrors.internal();
      const role = administrativeRole(assertActiveUser(actorSnapshot));

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<UpdateDraftJourneyParticipantsResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return previous.resultado;
      }

      const journey = assertManageableDraft(journeySnapshot, context.actorId, role);
      const participants = participantSnapshots.map((snapshot, index): DraftParticipant => {
        if (!snapshot.exists) throw domainErrors.participantNotFound();
        const user = snapshot.data() as UserDocument;
        if (user.activo !== true) throw domainErrors.participantInactive();
        if (typeof user.nombreVisible !== "string" || user.nombreVisible.length === 0) {
          throw domainErrors.internal();
        }
        const requested = request.participantes[index];
        if (!requested) throw domainErrors.internal();
        return {
          usuarioId: snapshot.id,
          nombreVisible: user.nombreVisible,
          rol: centralRole(user),
          puedeContar: requested.puedeContar
        };
      }).sort((left, right) => left.usuarioId.localeCompare(right.usuarioId));

      const nextVersion = (journey.version as number) + 1;
      if (!Number.isSafeInteger(nextVersion)) throw domainErrors.internal();
      const now = Timestamp.now();
      const result: UpdateDraftJourneyParticipantsResult = {
        jornadaId: request.jornadaId,
        estado: "BORRADOR",
        version: nextVersion,
        cantidadParticipantes: participants.length,
        participantes: participants,
        actualizadaEn: now.toDate().toISOString()
      };
      const selectionRef = this.firestore.collection("seleccionesParticipantesJornada").doc(request.jornadaId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.set(selectionRef, {
        id: request.jornadaId,
        jornadaId: request.jornadaId,
        participantes: participants,
        cantidadParticipantes: participants.length,
        versionJornada: nextVersion,
        actualizadaPorUsuarioId: context.actorId,
        actualizadaEn: now
      });
      transaction.update(journeyRef, {
        cantidadParticipantesSeleccionados: participants.length,
        version: nextVersion,
        actualizadaEn: now
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "PARTICIPANTES_JORNADA_BORRADOR_ACTUALIZADOS",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA",
        recursoId: request.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {
          cantidadParticipantes: participants.length,
          version: nextVersion,
          payloadHash
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "ACTUALIZAR_PARTICIPANTES_JORNADA_BORRADOR",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}
