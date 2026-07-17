import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentSnapshot, type Firestore, type Transaction} from "firebase-admin/firestore";

import type {
  CancelDraftJourneyRequest,
  CancelDraftJourneyResult,
  ReopenCancelledJourneyRequest,
  ReopenCancelledJourneyResult,
  TrustedOperationContext
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
  readonly tipoInactivacion?: string | null;
  readonly cancelacionVigenteId?: string | null;
  readonly activadaEn?: unknown;
  readonly cerradaEn?: unknown;
  readonly cerradaPorUsuarioId?: unknown;
}

interface CancellationDocument {
  readonly jornadaId?: string;
  readonly tipoInactivacion?: string;
}

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

type AdministrativeRole = "SUPERVISOR" | "ADMINISTRADOR";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function activeAdministrativeActor(snapshot: DocumentSnapshot): {role: AdministrativeRole; name: string} {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const actor = snapshot.data() as UserDocument;
  if (actor.activo !== true) throw domainErrors.userInactive();
  if (!Array.isArray(actor.roles)) throw domainErrors.permissionDenied();
  const role = actor.roles.includes("ADMINISTRADOR")
    ? "ADMINISTRADOR"
    : actor.roles.includes("SUPERVISOR")
      ? "SUPERVISOR"
      : undefined;
  if (!role) throw domainErrors.permissionDenied();
  return {role, name: actor.nombreVisible ?? "Usuario"};
}

function assertOwner(journey: JourneyDocument, actorId: string, role: AdministrativeRole): void {
  if (role !== "ADMINISTRADOR" && journey.creadaPorUsuarioId !== actorId) {
    throw domainErrors.journeyDraftAccessDenied();
  }
}

function nextVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= Number.MAX_SAFE_INTEGER) {
    throw domainErrors.internal();
  }
  return (value as number) + 1;
}

async function assertNoOperationalData(
  transaction: Transaction,
  firestore: Firestore,
  journeyId: string
): Promise<void> {
  const journeyRef = firestore.collection("jornadas").doc(journeyId);
  const [lines, authorizations, reservations, occupations] = await Promise.all([
    transaction.get(firestore.collection("jornadaLineas").where("jornadaId", "==", journeyId)),
    transaction.get(journeyRef.collection("autorizaciones")),
    transaction.get(firestore.collection("reservas").where("jornadaId", "==", journeyId)),
    transaction.get(firestore.collection("ocupacionesLineasActivas").where("jornadaId", "==", journeyId))
  ]);
  if (!lines.empty || !authorizations.empty || !reservations.empty || !occupations.empty) {
    throw domainErrors.draftCancellationOperationalDataExists();
  }
}

export class CancelDraftJourneyService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: CancelDraftJourneyRequest,
    context: TrustedOperationContext
  ): Promise<CancelDraftJourneyResult> {
    const idempotencyId = sha256(`${context.actorId}:CANCELAR_JORNADA_BORRADOR:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      jornadaId: request.jornadaId,
      versionEsperada: request.versionEsperada,
      motivo: request.motivo
    }));
    const cancellationId = randomUUID();
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, journeySnapshot, idempotencySnapshot] = await transaction.getAll(
        actorRef,
        journeyRef,
        idempotencyRef
      );
      if (!actorSnapshot || !journeySnapshot || !idempotencySnapshot) throw domainErrors.internal();
      const actor = activeAdministrativeActor(actorSnapshot);

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<CancelDraftJourneyResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      assertOwner(journey, context.actorId, actor.role);
      if (journey.estadoAdministrativo !== "BORRADOR") throw domainErrors.draftCancellationInvalidState();
      if (journey.version !== request.versionEsperada) throw domainErrors.draftCancellationStaleVersion();
      const version = nextVersion(journey.version);
      await assertNoOperationalData(transaction, this.firestore, request.jornadaId);

      const now = Timestamp.now();
      const result: CancelDraftJourneyResult = {
        jornadaId: request.jornadaId,
        estado: "INACTIVA",
        tipoInactivacion: "CANCELACION_BORRADOR",
        version,
        cancelacionId: cancellationId,
        motivo: request.motivo,
        canceladaPorUsuarioId: context.actorId,
        canceladaPorNombreVisible: actor.name,
        canceladaEn: now.toDate().toISOString()
      };
      transaction.update(journeyRef, {
        estadoAdministrativo: "INACTIVA",
        tipoInactivacion: "CANCELACION_BORRADOR",
        cancelacionVigenteId: cancellationId,
        ultimaCancelacionId: cancellationId,
        canceladaPorUsuarioId: context.actorId,
        canceladaPorNombreVisible: actor.name,
        motivoCancelacion: request.motivo,
        canceladaEn: now,
        version,
        actualizadaEn: now
      });
      transaction.create(this.firestore.collection("cancelacionesJornadas").doc(cancellationId), {
        id: cancellationId,
        jornadaId: request.jornadaId,
        tipoInactivacion: "CANCELACION_BORRADOR",
        actorUsuarioId: context.actorId,
        actorNombreVisible: actor.name,
        motivo: request.motivo,
        versionAnterior: request.versionEsperada,
        version,
        canceladaEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "JORNADA_BORRADOR_CANCELADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA",
        recursoId: request.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {cancelacionId: cancellationId, motivo: request.motivo, version, payloadHash}
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "CANCELAR_JORNADA_BORRADOR",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}

export class ReopenCancelledJourneyService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: ReopenCancelledJourneyRequest,
    context: TrustedOperationContext
  ): Promise<ReopenCancelledJourneyResult> {
    const idempotencyId = sha256(`${context.actorId}:REABRIR_JORNADA_CANCELADA:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      jornadaId: request.jornadaId,
      versionEsperada: request.versionEsperada
    }));
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const journeyRef = this.firestore.collection("jornadas").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, journeySnapshot, idempotencySnapshot] = await transaction.getAll(
        actorRef,
        journeyRef,
        idempotencyRef
      );
      if (!actorSnapshot || !journeySnapshot || !idempotencySnapshot) throw domainErrors.internal();
      const actor = activeAdministrativeActor(actorSnapshot);

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<ReopenCancelledJourneyResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      assertOwner(journey, context.actorId, actor.role);
      if (
        journey.estadoAdministrativo !== "INACTIVA" ||
        journey.tipoInactivacion !== "CANCELACION_BORRADOR" ||
        typeof journey.cancelacionVigenteId !== "string"
      ) {
        throw domainErrors.draftReopenInvalidState();
      }
      if (journey.activadaEn != null || journey.cerradaEn != null || journey.cerradaPorUsuarioId != null) {
        throw domainErrors.draftReopenNotAllowed();
      }
      if (journey.version !== request.versionEsperada) throw domainErrors.draftReopenStaleVersion();
      const version = nextVersion(journey.version);
      const cancellationRef = this.firestore.collection("cancelacionesJornadas").doc(journey.cancelacionVigenteId);
      const cancellationSnapshot = await transaction.get(cancellationRef);
      const cancellation = cancellationSnapshot.data() as CancellationDocument | undefined;
      if (
        !cancellationSnapshot.exists ||
        cancellation?.jornadaId !== request.jornadaId ||
        cancellation.tipoInactivacion !== "CANCELACION_BORRADOR"
      ) {
        throw domainErrors.draftReopenNotAllowed();
      }
      await assertNoOperationalData(transaction, this.firestore, request.jornadaId);

      const now = Timestamp.now();
      const result: ReopenCancelledJourneyResult = {
        jornadaId: request.jornadaId,
        estado: "BORRADOR",
        version,
        cancelacionAnteriorId: cancellationRef.id,
        reabiertaEn: now.toDate().toISOString()
      };
      transaction.update(journeyRef, {
        estadoAdministrativo: "BORRADOR",
        tipoInactivacion: null,
        cancelacionVigenteId: null,
        reabiertaPorUsuarioId: context.actorId,
        reabiertaPorNombreVisible: actor.name,
        reabiertaEn: now,
        version,
        actualizadaEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "JORNADA_CANCELADA_REABIERTA",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA",
        recursoId: request.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {cancelacionAnteriorId: cancellationRef.id, version, payloadHash}
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "REABRIR_JORNADA_CANCELADA",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}
