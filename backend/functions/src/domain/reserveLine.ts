import {createHash, randomBytes, randomUUID} from "node:crypto";

import {Timestamp, type Firestore} from "firebase-admin/firestore";

import type {
  ReserveLineRequest,
  ReserveLineResult,
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
  readonly version?: number;
  readonly ubicacion?: VisibleLocation;
}

interface IdempotencyDocument {
  readonly payloadHash?: string;
  readonly resultado?: ReserveLineResult;
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

export class ReserveLineService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: ReserveLineRequest,
    context: TrustedOperationContext
  ): Promise<ReserveLineResult> {
    const idempotencyId = sha256(`${context.actorId}:RESERVAR_LINEA:${request.claveIdempotencia}`);
    const payloadHash = sha256(
      JSON.stringify({
        dispositivoId: request.dispositivoId,
        jornadaLineaId: request.jornadaLineaId
      })
    );
    const reservationId = randomUUID();
    const auditId = randomUUID();
    const opaqueToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(opaqueToken);

    return this.firestore.runTransaction(async (transaction) => {
      const journeyLineRef = this.firestore.collection("jornadaLineas").doc(request.jornadaLineaId);
      const userRef = this.firestore.collection("usuarios").doc(context.actorId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const firstSnapshots = await transaction.getAll(
        journeyLineRef,
        userRef,
        idempotencyRef
      );
      const journeyLineSnapshot = firstSnapshots[0];
      const userSnapshot = firstSnapshots[1];
      const idempotencySnapshot = firstSnapshots[2];

      if (!journeyLineSnapshot || !userSnapshot || !idempotencySnapshot) {
        throw domainErrors.internal();
      }

      if (!journeyLineSnapshot.exists) throw domainErrors.journeyLineNotFound();
      if (!userSnapshot.exists) throw domainErrors.userNotFound();

      const user = userSnapshot.data() as UserDocument;
      if (user.activo !== true) throw domainErrors.userInactive();

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument;
        if (previous.payloadHash !== payloadHash || !previous.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return previous.resultado;
      }

      const journeyLine = journeyLineSnapshot.data() as JourneyLineDocument;
      if (typeof journeyLine.jornadaId !== "string") throw domainErrors.journeyNotFound();
      const journeyRef = this.firestore.collection("jornadas").doc(journeyLine.jornadaId);
      const authorizationRef = journeyRef.collection("autorizaciones").doc(context.actorId);
      const centralSnapshots = await transaction.getAll(
        journeyRef,
        authorizationRef
      );
      const journeySnapshot = centralSnapshots[0];
      const authorizationSnapshot = centralSnapshots[1];

      if (!journeySnapshot || !authorizationSnapshot) throw domainErrors.internal();

      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      const journey = journeySnapshot.data() as JourneyDocument;
      if (journey.estadoAdministrativo !== "ACTIVA") throw domainErrors.journeyNotActive();
      if (!authorizationSnapshot.exists) throw domainErrors.journeyAccessDenied();

      const authorization = authorizationSnapshot.data() as AuthorizationDocument;
      if (authorization.activa !== true || authorization.puedeContar !== true) {
        throw domainErrors.journeyAccessDenied();
      }
      if (!isRole(authorization.rolEfectivo)) throw domainErrors.permissionDenied();
      if (!Array.isArray(user.roles) || !user.roles.includes(authorization.rolEfectivo)) {
        throw domainErrors.permissionDenied();
      }
      if (
        journeyLine.activa !== true ||
        journeyLine.estadoCentral !== "DISPONIBLE" ||
        (typeof journeyLine.reservaActivaId === "string" && journeyLine.reservaActivaId !== "")
      ) {
        throw domainErrors.lineNotAvailable();
      }
      if (!Number.isInteger(journeyLine.version) || !isLocation(journeyLine.ubicacion)) {
        throw domainErrors.internal();
      }

      const reservedAt = Timestamp.now();
      const nextVersion = (journeyLine.version ?? 0) + 1;
      const result: ReserveLineResult = {
        reservaId: reservationId,
        jornadaId: journeyLine.jornadaId,
        jornadaLineaId: request.jornadaLineaId,
        estadoCentral: "EN_CONTEO",
        tokenReserva: opaqueToken,
        reservadaEn: reservedAt.toDate().toISOString(),
        version: nextVersion,
        ubicacion: journeyLine.ubicacion
      };
      const reservationRef = this.firestore.collection("reservas").doc(reservationId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(reservationRef, {
        id: reservationId,
        tipoReserva: "INICIAL",
        jornadaId: journeyLine.jornadaId,
        jornadaLineaId: request.jornadaLineaId,
        usuarioId: context.actorId,
        usuarioNombreVisible: user.nombreVisible ?? "Usuario de prueba",
        rolEfectivo: authorization.rolEfectivo,
        dispositivoId: request.dispositivoId,
        claveIdempotencia: request.claveIdempotencia,
        tokenReservaHash: tokenHash,
        reservadaEn: reservedAt,
        estadoReserva: "ACTIVA",
        politicaLiberacion: "MANUAL_SUPERVISOR_MVP"
      });
      transaction.update(journeyLineRef, {
        estadoCentral: "EN_CONTEO",
        reservaActivaId: reservationId,
        version: nextVersion,
        actualizadaEn: reservedAt
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "LINEA_RESERVADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "JORNADA_LINEA",
        recursoId: request.jornadaLineaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: reservedAt,
        metadatos: {
          estadoAnterior: "DISPONIBLE",
          estadoNuevo: "EN_CONTEO",
          reservaId: reservationId,
          version: nextVersion,
          dispositivoId: request.dispositivoId
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "RESERVAR_LINEA",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: reservedAt
      });

      return result;
    });
  }
}
