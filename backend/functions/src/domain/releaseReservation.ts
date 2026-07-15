import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type Firestore} from "firebase-admin/firestore";

import type {
  ReleaseReservationRequest,
  ReleaseReservationResult,
  TrustedOperationContext,
  UserRole
} from "./contracts.js";
import {domainErrors} from "./errors.js";

interface UserDocument {
  readonly activo?: boolean;
  readonly nombreVisible?: string;
  readonly roles?: unknown;
}

interface ReservationDocument {
  readonly jornadaId?: string;
  readonly jornadaLineaId?: string;
  readonly usuarioId?: string;
  readonly tipoReserva?: string;
  readonly estadoReserva?: string;
  readonly conteoAnteriorId?: string;
  readonly conteoId?: string;
  readonly responsableCorreccionUsuarioId?: string;
  readonly reasignacionOrigenId?: string | null;
}

interface JourneyDocument {
  readonly estadoAdministrativo?: string;
}

interface AuthorizationDocument {
  readonly activa?: boolean;
  readonly puedeRevisar?: boolean;
  readonly rolEfectivo?: string;
}

interface JourneyLineDocument {
  readonly jornadaId?: string;
  readonly activa?: boolean;
  readonly estadoCentral?: string;
  readonly reservaActivaId?: string | null;
  readonly conteoVigenteId?: string;
  readonly responsableCorreccionUsuarioId?: string;
  readonly version?: number;
}

interface IdempotencyDocument {
  readonly payloadHash?: string;
  readonly resultado?: ReleaseReservationResult;
}

const supervisorRoles = new Set<UserRole>(["SUPERVISOR", "ADMINISTRADOR"]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isSupervisorRole(value: unknown): value is UserRole {
  return typeof value === "string" && supervisorRoles.has(value as UserRole);
}

function isSafeVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Number.MAX_SAFE_INTEGER;
}

export class ReleaseReservationService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: ReleaseReservationRequest,
    context: TrustedOperationContext
  ): Promise<ReleaseReservationResult> {
    const idempotencyId = sha256(`${context.actorId}:LIBERAR_RESERVA_LINEA:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({motivo: request.motivo, reservaId: request.reservaId}));
    const releaseId = randomUUID();
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const reservationRef = this.firestore.collection("reservas").doc(request.reservaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, reservationSnapshot, idempotencySnapshot] = await transaction.getAll(
        actorRef,
        reservationRef,
        idempotencyRef
      );
      if (!actorSnapshot || !reservationSnapshot || !idempotencySnapshot) throw domainErrors.internal();
      if (!actorSnapshot.exists) throw domainErrors.userNotFound();
      const actor = actorSnapshot.data() as UserDocument;
      if (actor.activo !== true) throw domainErrors.userInactive();

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }

      if (!reservationSnapshot.exists) throw domainErrors.reservationNotFound();
      const reservation = reservationSnapshot.data() as ReservationDocument;
      if (reservation.estadoReserva !== "ACTIVA") throw domainErrors.reservationNotActive();
      if (typeof reservation.conteoId === "string" && reservation.conteoId !== "") {
        throw domainErrors.reservationAlreadyCounted();
      }
      if (typeof reservation.jornadaId !== "string" || typeof reservation.jornadaLineaId !== "string") {
        throw domainErrors.internal();
      }
      const reservationType = reservation.tipoReserva ?? "INICIAL";
      if (reservationType !== "INICIAL" && reservationType !== "CORRECCION") throw domainErrors.internal();

      const journeyRef = this.firestore.collection("jornadas").doc(reservation.jornadaId);
      const authorizationRef = journeyRef.collection("autorizaciones").doc(context.actorId);
      const lineRef = this.firestore.collection("jornadaLineas").doc(reservation.jornadaLineaId);
      const [journeySnapshot, authorizationSnapshot, lineSnapshot] = await transaction.getAll(
        journeyRef,
        authorizationRef,
        lineRef
      );
      if (!journeySnapshot || !authorizationSnapshot || !lineSnapshot) throw domainErrors.internal();
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      if ((journeySnapshot.data() as JourneyDocument).estadoAdministrativo !== "ACTIVA") {
        throw domainErrors.journeyNotActive();
      }
      if (!authorizationSnapshot.exists) throw domainErrors.journeyAccessDenied();
      const authorization = authorizationSnapshot.data() as AuthorizationDocument;
      if (
        authorization.activa !== true ||
        authorization.puedeRevisar !== true ||
        !isSupervisorRole(authorization.rolEfectivo) ||
        !Array.isArray(actor.roles) ||
        !actor.roles.includes(authorization.rolEfectivo)
      ) {
        throw domainErrors.reservationReleaseNotAllowed();
      }

      if (!lineSnapshot.exists) throw domainErrors.journeyLineNotFound();
      const line = lineSnapshot.data() as JourneyLineDocument;
      if (line.jornadaId !== reservation.jornadaId) throw domainErrors.lineReservationMismatch();
      if (line.activa !== true || line.estadoCentral !== "EN_CONTEO") throw domainErrors.lineNotInCount();
      if (line.reservaActivaId !== request.reservaId) throw domainErrors.lineReservationMismatch();
      if (!isSafeVersion(line.version)) throw domainErrors.internal();

      if (reservationType === "CORRECCION") {
        if (
          typeof reservation.conteoAnteriorId !== "string" ||
          line.conteoVigenteId !== reservation.conteoAnteriorId ||
          typeof reservation.responsableCorreccionUsuarioId !== "string" ||
          line.responsableCorreccionUsuarioId !== reservation.responsableCorreccionUsuarioId ||
          !(
            reservation.reasignacionOrigenId === null ||
            reservation.reasignacionOrigenId === undefined ||
            typeof reservation.reasignacionOrigenId === "string"
          )
        ) {
          throw domainErrors.countLineMismatch();
        }
      }

      const releasedAt = Timestamp.now();
      const nextLineVersion = line.version + 1;
      const targetState = reservationType === "CORRECCION" ? "DEVUELTA" : "DISPONIBLE";
      const result: ReleaseReservationResult = {
        liberacionId: releaseId,
        reservaId: request.reservaId,
        jornadaLineaId: reservation.jornadaLineaId,
        tipoReserva: reservationType,
        estadoReserva: "LIBERADA",
        estadoCentral: targetState,
        versionLinea: nextLineVersion,
        liberadaEn: releasedAt.toDate().toISOString()
      };
      const releaseRef = this.firestore.collection("liberacionesReserva").doc(releaseId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(releaseRef, {
        id: releaseId,
        reservaId: request.reservaId,
        jornadaId: reservation.jornadaId,
        jornadaLineaId: reservation.jornadaLineaId,
        titularUsuarioId: reservation.usuarioId ?? null,
        tipoReserva: reservationType,
        estadoAnterior: "EN_CONTEO",
        estadoRestaurado: targetState,
        actorUsuarioId: context.actorId,
        actorNombreVisible: actor.nombreVisible ?? "Usuario de prueba",
        rolEfectivoActor: authorization.rolEfectivo,
        motivo: request.motivo,
        liberadaEn: releasedAt,
        versionLinea: nextLineVersion,
        ...(reservationType === "CORRECCION" ? {
          conteoAnteriorId: reservation.conteoAnteriorId,
          responsableCorreccionUsuarioId: reservation.responsableCorreccionUsuarioId,
          reasignacionActivaId: reservation.reasignacionOrigenId ?? null
        } : {}),
        inmutable: true,
        eventoAuditoriaId: auditId
      });
      transaction.update(reservationRef, {
        estadoReserva: "LIBERADA",
        liberacionId: releaseId,
        liberadaEn: releasedAt,
        liberadaPorUsuarioId: context.actorId,
        motivoLiberacion: request.motivo
      });
      transaction.update(lineRef, {
        estadoCentral: targetState,
        reservaActivaId: null,
        ...(reservationType === "CORRECCION"
          ? {reasignacionActivaId: reservation.reasignacionOrigenId ?? null}
          : {}),
        version: nextLineVersion,
        actualizadaEn: releasedAt
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "RESERVA_LINEA_LIBERADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "RESERVA",
        recursoId: request.reservaId,
        jornadaId: reservation.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: releasedAt,
        metadatos: {
          jornadaLineaId: reservation.jornadaLineaId,
          liberacionId: releaseId,
          tipoReserva: reservationType,
          estadoAnterior: "EN_CONTEO",
          estadoNuevo: targetState,
          motivo: request.motivo,
          versionLinea: nextLineVersion
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "LIBERAR_RESERVA_LINEA",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: releasedAt
      });
      return result;
    });
  }
}
