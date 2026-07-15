import {createHash, randomBytes, randomUUID} from "node:crypto";

import {Timestamp, type Firestore} from "firebase-admin/firestore";

import type {
  InitiateCountCorrectionRequest,
  InitiateCountCorrectionResult,
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
  readonly conteoVigenteId?: string;
  readonly reservaActivaId?: string | null;
  readonly version?: number;
  readonly ubicacion?: VisibleLocation;
}

interface IdempotencyDocument {
  readonly payloadHash?: string;
  readonly resultado?: InitiateCountCorrectionResult;
}

const allowedRoles = new Set<UserRole>(["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && allowedRoles.has(value as UserRole);
}

function isSafeVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Number.MAX_SAFE_INTEGER;
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

export class InitiateCountCorrectionService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: InitiateCountCorrectionRequest,
    context: TrustedOperationContext
  ): Promise<InitiateCountCorrectionResult> {
    const idempotencyId = sha256(`${context.actorId}:INICIAR_CORRECCION_CONTEO:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      conteoId: request.conteoId,
      dispositivoId: request.dispositivoId
    }));
    const reservationId = randomUUID();
    const auditId = randomUUID();
    const opaqueToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(opaqueToken);

    return this.firestore.runTransaction(async (transaction) => {
      const userRef = this.firestore.collection("usuarios").doc(context.actorId);
      const countRef = this.firestore.collection("conteos").doc(request.conteoId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [userSnapshot, countSnapshot, idempotencySnapshot] = await transaction.getAll(
        userRef,
        countRef,
        idempotencyRef
      );
      if (!userSnapshot || !countSnapshot || !idempotencySnapshot) throw domainErrors.internal();
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

      if (!countSnapshot.exists) throw domainErrors.countNotFound();
      const count = countSnapshot.data() as CountDocument;
      if (count.autorUsuarioId !== context.actorId) throw domainErrors.countAuthorMismatch();
      if (
        typeof count.jornadaId !== "string" ||
        typeof count.jornadaLineaId !== "string" ||
        typeof count.lineaId !== "string" ||
        count.inmutable !== true ||
        !isSafeVersion(count.versionNumero) ||
        count.versionNumero < 1
      ) {
        throw domainErrors.internal();
      }

      const journeyRef = this.firestore.collection("jornadas").doc(count.jornadaId);
      const authorizationRef = journeyRef.collection("autorizaciones").doc(context.actorId);
      const lineRef = this.firestore.collection("jornadaLineas").doc(count.jornadaLineaId);
      const activeReservationsQuery = this.firestore.collection("reservas")
        .where("usuarioId", "==", context.actorId);
      const [journeySnapshot, authorizationSnapshot, lineSnapshot, reservationsSnapshot] = await Promise.all([
        transaction.get(journeyRef),
        transaction.get(authorizationRef),
        transaction.get(lineRef),
        transaction.get(activeReservationsQuery)
      ]);
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      if ((journeySnapshot.data() as JourneyDocument).estadoAdministrativo !== "ACTIVA") {
        throw domainErrors.journeyNotActive();
      }
      if (!authorizationSnapshot.exists) throw domainErrors.journeyAccessDenied();
      const authorization = authorizationSnapshot.data() as AuthorizationDocument;
      if (authorization.activa !== true || authorization.puedeContar !== true) {
        throw domainErrors.journeyAccessDenied();
      }
      if (!isRole(authorization.rolEfectivo) || !Array.isArray(user.roles) || !user.roles.includes(authorization.rolEfectivo)) {
        throw domainErrors.permissionDenied();
      }
      if (!lineSnapshot.exists) throw domainErrors.journeyLineNotFound();
      const line = lineSnapshot.data() as JourneyLineDocument;
      if (
        line.jornadaId !== count.jornadaId ||
        line.lineaId !== count.lineaId ||
        line.conteoVigenteId !== request.conteoId
      ) {
        throw domainErrors.countLineMismatch();
      }
      if (line.activa !== true || line.estadoCentral !== "DEVUELTA") {
        throw domainErrors.countNotReturned();
      }
      if (typeof line.reservaActivaId === "string" && line.reservaActivaId !== "") {
        throw domainErrors.activeReservationExists();
      }
      if (reservationsSnapshot.docs.some((document) => document.data().estadoReserva === "ACTIVA")) {
        throw domainErrors.activeReservationExists();
      }
      if (!isSafeVersion(line.version) || !isLocation(line.ubicacion)) throw domainErrors.internal();

      const reservedAt = Timestamp.now();
      const nextLineVersion = line.version + 1;
      const nextCountVersion = count.versionNumero + 1;
      const result: InitiateCountCorrectionResult = {
        reservaId: reservationId,
        jornadaLineaId: count.jornadaLineaId,
        conteoAnteriorId: request.conteoId,
        estadoCentral: "EN_CONTEO",
        tipoReserva: "CORRECCION",
        tokenReserva: opaqueToken,
        reservadaEn: reservedAt.toDate().toISOString(),
        version: nextLineVersion,
        versionConteoSiguiente: nextCountVersion,
        ubicacion: line.ubicacion
      };
      const reservationRef = this.firestore.collection("reservas").doc(reservationId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(reservationRef, {
        id: reservationId,
        tipoReserva: "CORRECCION",
        conteoAnteriorId: request.conteoId,
        jornadaId: count.jornadaId,
        jornadaLineaId: count.jornadaLineaId,
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
      transaction.update(lineRef, {
        estadoCentral: "EN_CONTEO",
        reservaActivaId: reservationId,
        version: nextLineVersion,
        actualizadaEn: reservedAt
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "CORRECCION_CONTEO_INICIADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "CONTEO",
        recursoId: request.conteoId,
        jornadaId: count.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: reservedAt,
        metadatos: {
          jornadaLineaId: count.jornadaLineaId,
          reservaId: reservationId,
          estadoAnterior: "DEVUELTA",
          estadoNuevo: "EN_CONTEO",
          versionLinea: nextLineVersion,
          versionConteoSiguiente: nextCountVersion,
          dispositivoId: request.dispositivoId
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "INICIAR_CORRECCION_CONTEO",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: reservedAt
      });
      return result;
    });
  }
}
