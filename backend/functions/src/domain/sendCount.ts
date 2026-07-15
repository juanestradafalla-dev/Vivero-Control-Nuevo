import {createHash, randomUUID, timingSafeEqual} from "node:crypto";

import {Timestamp, type Firestore} from "firebase-admin/firestore";

import type {
  SendCountRequest,
  SendCountResult,
  TrustedOperationContext,
  UserRole,
  VisibleLocation
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
  readonly rolEfectivo?: string;
  readonly dispositivoId?: string;
  readonly tokenReservaHash?: string;
  readonly estadoReserva?: string;
  readonly tipoReserva?: string;
  readonly conteoAnteriorId?: string;
}

interface CountDocument {
  readonly jornadaId?: string;
  readonly jornadaLineaId?: string;
  readonly lineaId?: string;
  readonly autorUsuarioId?: string;
  readonly versionNumero?: number;
  readonly inmutable?: boolean;
}

interface JourneyDocument {
  readonly estadoAdministrativo?: string;
}

interface AuthorizationDocument {
  readonly activa?: boolean;
  readonly puedeContar?: boolean;
  readonly rolEfectivo?: string;
}

interface JourneyLineDocument {
  readonly jornadaId?: string;
  readonly lineaId?: string;
  readonly activa?: boolean;
  readonly estadoCentral?: string;
  readonly reservaActivaId?: string | null;
  readonly conteoVigenteId?: string;
  readonly version?: number;
  readonly ubicacion?: VisibleLocation;
}

interface IdempotencyDocument {
  readonly payloadHash?: string;
  readonly resultado?: SendCountResult;
}

const allowedRoles = new Set<UserRole>(["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && allowedRoles.has(value as UserRole);
}

function isLocation(value: unknown): value is VisibleLocation {
  if (typeof value !== "object" || value === null) return false;
  const location = value as Record<string, unknown>;
  return (
    ["vivero", "modulo", "cama", "linea", "nombreVisible"].every(
      (field) => typeof location[field] === "string" && location[field] !== ""
    ) && Number.isInteger(location.orden)
  );
}

function safeHashEquals(storedHash: unknown, token: string): boolean {
  if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const actualHash = sha256(token);
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(actualHash, "hex"));
}

function hashPayload(request: SendCountRequest): string {
  return sha256(JSON.stringify({
    dispositivoId: request.dispositivoId,
    hembras: request.hembras,
    machos: request.machos,
    observaciones: request.observaciones ?? null,
    patrones: request.patrones,
    reservaId: request.reservaId,
    timestampDispositivo: request.timestampDispositivo,
    tokenReservaHash: sha256(request.tokenReserva)
  }));
}

export class SendCountService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: SendCountRequest, context: TrustedOperationContext): Promise<SendCountResult> {
    const idempotencyId = sha256(`${context.actorId}:ENVIAR_CONTEO:${request.claveIdempotencia}`);
    const requestHash = hashPayload(request);
    const countId = randomUUID();
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const userRef = this.firestore.collection("usuarios").doc(context.actorId);
      const reservationRef = this.firestore.collection("reservas").doc(request.reservaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const firstSnapshots = await transaction.getAll(userRef, reservationRef, idempotencyRef);
      const userSnapshot = firstSnapshots[0];
      const reservationSnapshot = firstSnapshots[1];
      const idempotencySnapshot = firstSnapshots[2];
      if (!userSnapshot || !reservationSnapshot || !idempotencySnapshot) throw domainErrors.internal();
      if (!userSnapshot.exists) throw domainErrors.userNotFound();
      const user = userSnapshot.data() as UserDocument;
      if (user.activo !== true) throw domainErrors.userInactive();

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument;
        if (previous.payloadHash !== requestHash || !previous.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return previous.resultado;
      }

      if (!reservationSnapshot.exists) throw domainErrors.reservationNotFound();
      const reservation = reservationSnapshot.data() as ReservationDocument;
      if (reservation.usuarioId !== context.actorId) throw domainErrors.reservationAccessDenied();
      if (reservation.dispositivoId !== request.dispositivoId) throw domainErrors.deviceMismatch();
      if (!safeHashEquals(reservation.tokenReservaHash, request.tokenReserva)) {
        throw domainErrors.invalidReservationToken();
      }
      if (reservation.estadoReserva !== "ACTIVA") throw domainErrors.reservationNotActive();
      if (typeof reservation.jornadaId !== "string" || typeof reservation.jornadaLineaId !== "string") {
        throw domainErrors.internal();
      }

      const journeyRef = this.firestore.collection("jornadas").doc(reservation.jornadaId);
      const authorizationRef = journeyRef.collection("autorizaciones").doc(context.actorId);
      const lineRef = this.firestore.collection("jornadaLineas").doc(reservation.jornadaLineaId);
      const centralSnapshots = await transaction.getAll(journeyRef, authorizationRef, lineRef);
      const journeySnapshot = centralSnapshots[0];
      const authorizationSnapshot = centralSnapshots[1];
      const lineSnapshot = centralSnapshots[2];
      if (!journeySnapshot || !authorizationSnapshot || !lineSnapshot) throw domainErrors.internal();
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      if ((journeySnapshot.data() as JourneyDocument).estadoAdministrativo !== "ACTIVA") {
        throw domainErrors.journeyNotActive();
      }
      if (!authorizationSnapshot.exists) throw domainErrors.journeyAccessDenied();
      const authorization = authorizationSnapshot.data() as AuthorizationDocument;
      if (authorization.activa !== true || authorization.puedeContar !== true) {
        throw domainErrors.journeyAccessDenied();
      }
      if (!isRole(authorization.rolEfectivo)) {
        throw domainErrors.permissionDenied();
      }
      if (!Array.isArray(user.roles) || !user.roles.includes(authorization.rolEfectivo)) {
        throw domainErrors.permissionDenied();
      }
      if (!lineSnapshot.exists) throw domainErrors.journeyLineNotFound();
      const line = lineSnapshot.data() as JourneyLineDocument;
      if (line.jornadaId !== reservation.jornadaId) throw domainErrors.lineReservationMismatch();
      if (line.activa !== true) throw domainErrors.lineNotInCount();
      if (line.estadoCentral !== "EN_CONTEO") throw domainErrors.lineNotInCount();
      if (line.reservaActivaId !== request.reservaId) throw domainErrors.lineReservationMismatch();
      if (
        !Number.isSafeInteger(line.version) ||
        (line.version as number) >= Number.MAX_SAFE_INTEGER ||
        !isLocation(line.ubicacion) ||
        typeof line.lineaId !== "string"
      ) {
        throw domainErrors.internal();
      }

      const isCorrection = reservation.tipoReserva === "CORRECCION";
      let previousCountId: string | null = null;
      let countVersion = 1;
      if (isCorrection) {
        if (typeof reservation.conteoAnteriorId !== "string") throw domainErrors.internal();
        const previousCountSnapshot = await transaction.get(
          this.firestore.collection("conteos").doc(reservation.conteoAnteriorId)
        );
        if (!previousCountSnapshot.exists) throw domainErrors.countNotFound();
        const previousCount = previousCountSnapshot.data() as CountDocument;
        if (
          previousCount.jornadaId !== reservation.jornadaId ||
          previousCount.jornadaLineaId !== reservation.jornadaLineaId ||
          previousCount.lineaId !== line.lineaId ||
          previousCount.autorUsuarioId !== context.actorId ||
          previousCount.inmutable !== true ||
          !Number.isSafeInteger(previousCount.versionNumero) ||
          (previousCount.versionNumero as number) < 1 ||
          (previousCount.versionNumero as number) >= Number.MAX_SAFE_INTEGER ||
          line.conteoVigenteId !== reservation.conteoAnteriorId
        ) {
          throw domainErrors.countLineMismatch();
        }
        previousCountId = reservation.conteoAnteriorId;
        countVersion = (previousCount.versionNumero as number) + 1;
      } else if (reservation.tipoReserva !== undefined && reservation.tipoReserva !== "INICIAL") {
        throw domainErrors.internal();
      }

      const receivedAt = Timestamp.now();
      const total = request.hembras + request.machos + request.patrones;
      const nextLineVersion = (line.version ?? 0) + 1;
      const result: SendCountResult = {
        conteoId: countId,
        jornadaLineaId: reservation.jornadaLineaId,
        estadoCentral: "PENDIENTE_REVISION",
        hembras: request.hembras,
        machos: request.machos,
        patrones: request.patrones,
        total,
        versionConteo: countVersion,
        versionLinea: nextLineVersion,
        recibidoEn: receivedAt.toDate().toISOString()
      };
      const countRef = this.firestore.collection("conteos").doc(countId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(countRef, {
        id: countId,
        jornadaId: reservation.jornadaId,
        jornadaLineaId: reservation.jornadaLineaId,
        lineaId: line.lineaId,
        reservaId: request.reservaId,
        autorUsuarioId: context.actorId,
        autorNombreVisible: user.nombreVisible ?? "Usuario de prueba",
        rolEfectivo: authorization.rolEfectivo,
        dispositivoId: request.dispositivoId,
        hembras: request.hembras,
        machos: request.machos,
        patrones: request.patrones,
        total,
        ...(request.observaciones === undefined ? {} : {observaciones: request.observaciones}),
        versionNumero: countVersion,
        conteoAnteriorId: previousCountId,
        claveIdempotencia: request.claveIdempotencia,
        timestampDispositivo: request.timestampDispositivo,
        recibidoEn: receivedAt,
        ubicacion: line.ubicacion,
        inmutable: true
      });
      transaction.update(reservationRef, {estadoReserva: "CONSUMIDA", consumidaEn: receivedAt});
      transaction.update(lineRef, {
        estadoCentral: "PENDIENTE_REVISION",
        conteoVigenteId: countId,
        reservaActivaId: null,
        version: nextLineVersion,
        actualizadaEn: receivedAt
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "CONTEO_ENVIADO",
        actorUsuarioId: context.actorId,
        recursoTipo: "CONTEO",
        recursoId: countId,
        jornadaId: reservation.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: receivedAt,
        metadatos: {
          jornadaLineaId: reservation.jornadaLineaId,
          reservaId: request.reservaId,
          estadoAnterior: "EN_CONTEO",
          estadoNuevo: "PENDIENTE_REVISION",
          versionLinea: nextLineVersion,
          versionConteo: countVersion,
          tipoReserva: isCorrection ? "CORRECCION" : "INICIAL"
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "ENVIAR_CONTEO",
        claveHash: idempotencyId,
        payloadHash: requestHash,
        resultado: result,
        creadoEn: receivedAt
      });
      return result;
    });
  }
}
