import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentSnapshot, type Firestore} from "firebase-admin/firestore";

import type {
  CloseJourneyRequest,
  CloseJourneyResult,
  TrustedOperationContext
} from "./contracts.js";
import {domainErrors} from "./errors.js";

const CLOSE_MAX_COMBINED_ITEMS = 200;

interface UserDocument {
  readonly activo?: boolean;
  readonly roles?: unknown;
}

interface JourneyDocument {
  readonly estadoAdministrativo?: string;
  readonly creadaPorUsuarioId?: string;
  readonly version?: number;
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
    const auditId = randomUUID();
    let firstAttemptFingerprint: string | undefined;

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
      const actorRole = activeAdministrativeRole(actorSnapshot);

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<CloseJourneyResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return previous.resultado;
      }

      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      if (journey.estadoAdministrativo !== "ACTIVA") throw domainErrors.journeyNotActive();
      if (actorRole !== "ADMINISTRADOR" && journey.creadaPorUsuarioId !== context.actorId) {
        throw domainErrors.journeyCloseAccessDenied();
      }
      if (!Number.isSafeInteger(journey.version) || journey.version !== request.versionEsperada) {
        throw domainErrors.journeyCloseStaleVersion();
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
          reassignmentId: data.reasignacionActivaId ?? null
        })).sort((left, right) => left.id.localeCompare(right.id)),
        activeReservations: reservationsSnapshot.docs
          .filter((snapshot) => (snapshot.data() as ReservationDocument).estadoReserva === "ACTIVA")
          .map((snapshot) => snapshot.id)
          .sort()
      }));
      if (firstAttemptFingerprint === undefined) firstAttemptFingerprint = attemptFingerprint;
      else if (firstAttemptFingerprint !== attemptFingerprint) throw domainErrors.journeyCloseStaleVersion();
      if (lines.length + authorizations.length > CLOSE_MAX_COMBINED_ITEMS) {
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

      const lineIds = lines.map(({data}) => {
        if (typeof data.lineaId !== "string") throw domainErrors.internal();
        return data.lineaId;
      });
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

      const now = Timestamp.now();
      const nextVersion = (journey.version as number) + 1;
      if (!Number.isSafeInteger(nextVersion)) throw domainErrors.internal();
      const result: CloseJourneyResult = {
        jornadaId: request.jornadaId,
        estado: "INACTIVA",
        version: nextVersion,
        cantidadLineas: lines.length,
        cantidadAutorizaciones: authorizations.length,
        ocupacionesLiberadas: occupationSnapshots.length,
        cerradaEn: now.toDate().toISOString()
      };

      lines.forEach(({ref}) => transaction.update(ref, {activa: false, actualizadaEn: now}));
      authorizations.forEach(({ref, data}) => {
        if (data.jornadaId !== request.jornadaId) throw domainErrors.internal();
        transaction.update(ref, {
          activa: false,
          desactivadaEn: now,
          desactivadaPorUsuarioId: context.actorId
        });
      });
      occupationSnapshots.forEach((snapshot) => transaction.delete(snapshot.ref));
      transaction.update(journeyRef, {
        estadoAdministrativo: "INACTIVA",
        version: nextVersion,
        cerradaEn: now,
        cerradaPorUsuarioId: context.actorId,
        actualizadaEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "JORNADA_CERRADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA",
        recursoId: request.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {
          cantidadLineas: lines.length,
          cantidadAutorizaciones: authorizations.length,
          ocupacionesLiberadas: occupationSnapshots.length,
          version: nextVersion,
          payloadHash
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "CERRAR_JORNADA",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}
