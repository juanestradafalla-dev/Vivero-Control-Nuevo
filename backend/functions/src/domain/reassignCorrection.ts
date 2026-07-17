import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type Firestore} from "firebase-admin/firestore";

import type {
  ReassignCountCorrectionRequest,
  ReassignCountCorrectionResult,
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
  readonly autorNombreVisible?: string;
  readonly hembras?: number;
  readonly machos?: number;
  readonly patrones?: number;
  readonly total?: number;
  readonly observaciones?: string;
  readonly versionNumero?: number;
  readonly inmutable?: boolean;
}

interface JourneyDocument {
  readonly estadoAdministrativo?: string;
}

interface AuthorizationDocument {
  readonly activa?: boolean;
  readonly puedeContar?: boolean;
  readonly puedeRevisar?: boolean;
  readonly rolEfectivo?: string;
}

interface JourneyLineDocument {
  readonly jornadaId?: string;
  readonly lineaId?: string;
  readonly activa?: boolean;
  readonly estadoCentral?: string;
  readonly conteoVigenteId?: string;
  readonly decisionVigenteId?: string;
  readonly reservaActivaId?: string | null;
  readonly responsableCorreccionUsuarioId?: string;
  readonly reasignacionActivaId?: string | null;
  readonly version?: number;
  readonly ubicacion?: VisibleLocation;
}

interface DecisionDocument {
  readonly conteoId?: string;
  readonly decision?: string;
  readonly motivo?: string;
}

interface IdempotencyDocument {
  readonly payloadHash?: string;
  readonly resultado?: ReassignCountCorrectionResult;
}

const reviewRoles = new Set<UserRole>(["SUPERVISOR", "ADMINISTRADOR"]);
const countRoles = new Set<UserRole>(["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRole(value: unknown, allowed: ReadonlySet<UserRole>): value is UserRole {
  return typeof value === "string" && allowed.has(value as UserRole);
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

function isSafeCount(count: CountDocument): boolean {
  const values = [count.hembras, count.machos, count.patrones, count.total];
  if (values.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)) return false;
  return (count.hembras as number) + (count.machos as number) + (count.patrones as number) === count.total;
}

export class ReassignCountCorrectionService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: ReassignCountCorrectionRequest,
    context: TrustedOperationContext
  ): Promise<ReassignCountCorrectionResult> {
    const idempotencyId = sha256(`${context.actorId}:REASIGNAR_CORRECCION_CONTEO:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      conteoId: request.conteoId,
      nuevoUsuarioId: request.nuevoUsuarioId,
      motivo: request.motivo
    }));
    const reassignmentId = randomUUID();
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const targetRef = this.firestore.collection("usuarios").doc(request.nuevoUsuarioId);
      const countRef = this.firestore.collection("conteos").doc(request.conteoId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, targetSnapshot, countSnapshot, idempotencySnapshot] = await transaction.getAll(
        actorRef,
        targetRef,
        countRef,
        idempotencyRef
      );
      if (!actorSnapshot || !targetSnapshot || !countSnapshot || !idempotencySnapshot) throw domainErrors.internal();
      if (!actorSnapshot.exists) throw domainErrors.userNotFound();
      const actor = actorSnapshot.data() as UserDocument;
      if (actor.activo !== true) throw domainErrors.userInactive();

      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }

      if (!countSnapshot.exists) throw domainErrors.countNotFound();
      const count = countSnapshot.data() as CountDocument;
      if (
        typeof count.jornadaId !== "string" ||
        typeof count.jornadaLineaId !== "string" ||
        typeof count.lineaId !== "string" ||
        typeof count.autorUsuarioId !== "string" ||
        count.inmutable !== true ||
        !isSafeVersion(count.versionNumero) ||
        !isSafeCount(count)
      ) {
        throw domainErrors.internal();
      }

      const journeyRef = this.firestore.collection("jornadas").doc(count.jornadaId);
      const actorAuthorizationRef = journeyRef.collection("autorizaciones").doc(context.actorId);
      const targetAuthorizationRef = journeyRef.collection("autorizaciones").doc(request.nuevoUsuarioId);
      const lineRef = this.firestore.collection("jornadaLineas").doc(count.jornadaLineaId);
      const [journeySnapshot, actorAuthorizationSnapshot, targetAuthorizationSnapshot, lineSnapshot] =
        await transaction.getAll(journeyRef, actorAuthorizationRef, targetAuthorizationRef, lineRef);
      if (!journeySnapshot || !actorAuthorizationSnapshot || !targetAuthorizationSnapshot || !lineSnapshot) {
        throw domainErrors.internal();
      }
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      if ((journeySnapshot.data() as JourneyDocument).estadoAdministrativo !== "ACTIVA") {
        throw domainErrors.journeyNotActive();
      }
      if (!actorAuthorizationSnapshot.exists) throw domainErrors.journeyAccessDenied();
      const actorAuthorization = actorAuthorizationSnapshot.data() as AuthorizationDocument;
      if (
        actorAuthorization.activa !== true ||
        actorAuthorization.puedeRevisar !== true ||
        !isRole(actorAuthorization.rolEfectivo, reviewRoles) ||
        !Array.isArray(actor.roles) ||
        !actor.roles.includes(actorAuthorization.rolEfectivo)
      ) {
        throw domainErrors.correctionReassignmentNotAllowed();
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
      if (line.activa !== true || line.estadoCentral !== "DEVUELTA") throw domainErrors.countNotReturned();
      if (typeof line.reservaActivaId === "string" && line.reservaActivaId !== "") {
        throw domainErrors.activeReservationExists();
      }
      if (!isSafeVersion(line.version) || !isLocation(line.ubicacion) || typeof line.decisionVigenteId !== "string") {
        throw domainErrors.internal();
      }

      if (!targetSnapshot.exists) throw domainErrors.correctionAssigneeUnauthorized();
      const target = targetSnapshot.data() as UserDocument;
      if (target.activo !== true) throw domainErrors.correctionAssigneeInactive();
      if (!targetAuthorizationSnapshot.exists) throw domainErrors.correctionAssigneeUnauthorized();
      const targetAuthorization = targetAuthorizationSnapshot.data() as AuthorizationDocument;
      if (
        targetAuthorization.activa !== true ||
        targetAuthorization.puedeContar !== true ||
        !isRole(targetAuthorization.rolEfectivo, countRoles) ||
        !Array.isArray(target.roles) ||
        !target.roles.includes(targetAuthorization.rolEfectivo)
      ) {
        throw domainErrors.correctionAssigneeUnauthorized();
      }

      const currentResponsibleId =
        typeof line.responsableCorreccionUsuarioId === "string" && line.responsableCorreccionUsuarioId !== ""
          ? line.responsableCorreccionUsuarioId
          : count.autorUsuarioId;
      if (currentResponsibleId === request.nuevoUsuarioId) throw domainErrors.correctionReassignmentNoChange();

      const decisionRef = this.firestore.collection("decisionesRevision").doc(line.decisionVigenteId);
      const decisionSnapshot = await transaction.get(decisionRef);
      if (!decisionSnapshot.exists) throw domainErrors.internal();
      const decision = decisionSnapshot.data() as DecisionDocument;
      if (
        decision.conteoId !== request.conteoId ||
        decision.decision !== "DEVOLVER" ||
        typeof decision.motivo !== "string"
      ) {
        throw domainErrors.internal();
      }

      const reassignedAt = Timestamp.now();
      const nextLineVersion = (line.version as number) + 1;
      const result: ReassignCountCorrectionResult = {
        reasignacionId: reassignmentId,
        conteoId: request.conteoId,
        jornadaLineaId: count.jornadaLineaId,
        autorOriginalUsuarioId: count.autorUsuarioId,
        responsableCorreccionUsuarioId: request.nuevoUsuarioId,
        responsableCorreccionNombreVisible: target.nombreVisible ?? "Usuario",
        actorUsuarioId: context.actorId,
        motivo: request.motivo,
        versionLinea: nextLineVersion,
        reasignadaEn: reassignedAt.toDate().toISOString()
      };
      const reassignmentRef = this.firestore.collection("reasignacionesCorreccion").doc(reassignmentId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(reassignmentRef, {
        id: reassignmentId,
        conteoId: request.conteoId,
        jornadaId: count.jornadaId,
        jornadaLineaId: count.jornadaLineaId,
        lineaId: count.lineaId,
        autorOriginalUsuarioId: count.autorUsuarioId,
        autorOriginalNombreVisible: count.autorNombreVisible ?? "Usuario",
        responsableAnteriorUsuarioId: currentResponsibleId,
        nuevoUsuarioId: request.nuevoUsuarioId,
        nuevoUsuarioNombreVisible: target.nombreVisible ?? "Usuario",
        rolEfectivoNuevoUsuario: targetAuthorization.rolEfectivo,
        actorUsuarioId: context.actorId,
        actorNombreVisible: actor.nombreVisible ?? "Usuario",
        rolEfectivoActor: actorAuthorization.rolEfectivo,
        motivo: request.motivo,
        motivoDevolucion: decision.motivo,
        claveIdempotencia: request.claveIdempotencia,
        reasignadaEn: reassignedAt,
        versionLinea: nextLineVersion,
        conteoReferencia: {
          hembras: count.hembras,
          machos: count.machos,
          patrones: count.patrones,
          total: count.total,
          observaciones: count.observaciones ?? "",
          versionNumero: count.versionNumero,
          ubicacion: line.ubicacion
        },
        inmutable: true,
        eventoAuditoriaId: auditId
      });
      transaction.update(lineRef, {
        responsableCorreccionUsuarioId: request.nuevoUsuarioId,
        responsableCorreccionNombreVisible: target.nombreVisible ?? "Usuario",
        reasignacionActivaId: reassignmentId,
        reasignadaPorUsuarioId: context.actorId,
        reasignadaPorNombreVisible: actor.nombreVisible ?? "Usuario",
        motivoReasignacion: request.motivo,
        version: nextLineVersion,
        actualizadaEn: reassignedAt
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "CORRECCION_CONTEO_REASIGNADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "CONTEO",
        recursoId: request.conteoId,
        jornadaId: count.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: reassignedAt,
        metadatos: {
          jornadaLineaId: count.jornadaLineaId,
          reasignacionId: reassignmentId,
          responsableAnteriorUsuarioId: currentResponsibleId,
          responsableNuevoUsuarioId: request.nuevoUsuarioId,
          motivo: request.motivo,
          versionLinea: nextLineVersion
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "REASIGNAR_CORRECCION_CONTEO",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: reassignedAt
      });
      return result;
    });
  }
}
