import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentData, type Firestore} from "firebase-admin/firestore";

import type {
  ApproveCountRequest,
  ApproveCountResult,
  InventoryDifferences,
  InventoryValues,
  ReturnCountRequest,
  ReturnCountResult,
  TrustedOperationContext,
  UserRole
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
  readonly hembras?: number;
  readonly machos?: number;
  readonly patrones?: number;
  readonly total?: number;
  readonly inmutable?: boolean;
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
  readonly lineaId?: string;
  readonly activa?: boolean;
  readonly estadoCentral?: string;
  readonly conteoVigenteId?: string;
  readonly version?: number;
}

interface InventoryDocument {
  readonly lineaId?: string;
  readonly hembras?: number;
  readonly machos?: number;
  readonly patrones?: number;
  readonly total?: number;
  readonly version?: number;
}

interface IdempotencyDocument<T> {
  readonly payloadHash?: string;
  readonly resultado?: T;
}

interface ReviewContext {
  readonly user: UserDocument;
  readonly count: CountDocument;
  readonly line: JourneyLineDocument;
  readonly role: "SUPERVISOR" | "ADMINISTRADOR";
}

const reviewRoles = new Set<UserRole>(["SUPERVISOR", "ADMINISTRADOR"]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isReviewRole(value: unknown): value is "SUPERVISOR" | "ADMINISTRADOR" {
  return typeof value === "string" && reviewRoles.has(value as UserRole);
}

function isSafeVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Number.MAX_SAFE_INTEGER;
}

function toValues(document: CountDocument | InventoryDocument): InventoryValues | undefined {
  const values = [document.hembras, document.machos, document.patrones, document.total];
  if (values.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)) return undefined;
  const total = (document.hembras as number) + (document.machos as number) + (document.patrones as number);
  if (!Number.isSafeInteger(total) || total !== document.total) return undefined;
  return {
    hembras: document.hembras as number,
    machos: document.machos as number,
    patrones: document.patrones as number,
    total
  };
}

function differences(previous: InventoryValues, current: InventoryValues): InventoryDifferences {
  return {
    hembras: current.hembras - previous.hembras,
    machos: current.machos - previous.machos,
    patrones: current.patrones - previous.patrones,
    total: current.total - previous.total
  };
}

function requireReviewContext(
  userData: DocumentData,
  countData: DocumentData,
  journeyData: DocumentData,
  authorizationData: DocumentData,
  lineData: DocumentData,
  countId: string
): ReviewContext {
  const user = userData as UserDocument;
  const count = countData as CountDocument;
  const journey = journeyData as JourneyDocument;
  const authorization = authorizationData as AuthorizationDocument;
  const line = lineData as JourneyLineDocument;

  if (user.activo !== true) throw domainErrors.userInactive();
  if (journey.estadoAdministrativo !== "ACTIVA") throw domainErrors.journeyNotActive();
  if (authorization.activa !== true || authorization.puedeRevisar !== true) {
    throw domainErrors.reviewNotAllowed();
  }
  if (!isReviewRole(authorization.rolEfectivo)) throw domainErrors.reviewNotAllowed();
  if (!Array.isArray(user.roles) || !user.roles.includes(authorization.rolEfectivo)) {
    throw domainErrors.reviewNotAllowed();
  }
  if (
    typeof count.jornadaId !== "string" ||
    typeof count.jornadaLineaId !== "string" ||
    typeof count.lineaId !== "string" ||
    typeof count.autorUsuarioId !== "string" ||
    count.inmutable !== true ||
    !toValues(count)
  ) {
    throw domainErrors.internal();
  }
  if (line.jornadaId !== count.jornadaId || line.lineaId !== count.lineaId) {
    throw domainErrors.countLineMismatch();
  }
  if (line.activa !== true || line.estadoCentral !== "PENDIENTE_REVISION") {
    throw domainErrors.countNotPendingReview();
  }
  if (line.conteoVigenteId !== countId) throw domainErrors.countLineMismatch();
  if (!isSafeVersion(line.version)) throw domainErrors.internal();

  return {user, count, line, role: authorization.rolEfectivo};
}

export class ApproveCountService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: ApproveCountRequest, context: TrustedOperationContext): Promise<ApproveCountResult> {
    const idempotencyId = sha256(`${context.actorId}:APROBAR_CONTEO:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      conteoId: request.conteoId,
      motivoExcepcion: request.motivoExcepcion ?? null
    }));
    const decisionId = randomUUID();
    const movementId = randomUUID();
    const auditId = randomUUID();

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
      if ((userSnapshot.data() as UserDocument).activo !== true) throw domainErrors.userInactive();
      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<ApproveCountResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return previous.resultado;
      }
      if (!countSnapshot.exists) throw domainErrors.countNotFound();
      const count = countSnapshot.data() as CountDocument;
      if (typeof count.jornadaId !== "string" || typeof count.jornadaLineaId !== "string") {
        throw domainErrors.internal();
      }

      const journeyRef = this.firestore.collection("jornadas").doc(count.jornadaId);
      const authorizationRef = journeyRef.collection("autorizaciones").doc(context.actorId);
      const lineRef = this.firestore.collection("jornadaLineas").doc(count.jornadaLineaId);
      const inventoryId = typeof count.lineaId === "string" ? count.lineaId : "INVALID";
      const inventoryRef = this.firestore.collection("inventarioOficialLineas").doc(inventoryId);
      const [journeySnapshot, authorizationSnapshot, lineSnapshot, inventorySnapshot] =
        await transaction.getAll(journeyRef, authorizationRef, lineRef, inventoryRef);
      if (!journeySnapshot || !authorizationSnapshot || !lineSnapshot || !inventorySnapshot) {
        throw domainErrors.internal();
      }
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      if (!authorizationSnapshot.exists) throw domainErrors.journeyAccessDenied();
      if (!lineSnapshot.exists) throw domainErrors.journeyLineNotFound();
      const review = requireReviewContext(
        userSnapshot.data() as DocumentData,
        countSnapshot.data() as DocumentData,
        journeySnapshot.data() as DocumentData,
        authorizationSnapshot.data() as DocumentData,
        lineSnapshot.data() as DocumentData,
        request.conteoId
      );

      const selfReview = review.count.autorUsuarioId === context.actorId;
      if (selfReview && review.role === "SUPERVISOR") throw domainErrors.selfApprovalForbidden();
      if (selfReview && review.role === "ADMINISTRADOR" && !request.motivoExcepcion) {
        throw domainErrors.exceptionReasonRequired();
      }
      if (!selfReview && request.motivoExcepcion !== undefined) throw domainErrors.invalidArgument();
      if (!inventorySnapshot.exists) throw domainErrors.inventoryNotFound();
      const inventory = inventorySnapshot.data() as InventoryDocument;
      const previousValues = toValues(inventory);
      const newValues = toValues(review.count);
      if (
        inventory.lineaId !== review.count.lineaId ||
        !previousValues ||
        !newValues ||
        !isSafeVersion(inventory.version)
      ) {
        throw domainErrors.internal();
      }

      const decidedAt = Timestamp.now();
      const inventoryDifferences = differences(previousValues, newValues);
      const nextInventoryVersion = inventory.version + 1;
      const nextLineVersion = (review.line.version as number) + 1;
      const result: ApproveCountResult = {
        conteoId: request.conteoId,
        jornadaLineaId: review.count.jornadaLineaId as string,
        decisionId,
        movimientoId: movementId,
        estadoCentral: "APROBADA",
        inventarioAnterior: previousValues,
        inventarioNuevo: newValues,
        diferencias: inventoryDifferences,
        versionInventario: nextInventoryVersion,
        versionLinea: nextLineVersion,
        aprobadaEn: decidedAt.toDate().toISOString()
      };
      const decisionRef = this.firestore.collection("decisionesRevision").doc(decisionId);
      const movementRef = this.firestore.collection("movimientosInventario").doc(movementId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(decisionRef, {
        id: decisionId,
        conteoId: request.conteoId,
        jornadaId: review.count.jornadaId,
        jornadaLineaId: review.count.jornadaLineaId,
        lineaId: review.count.lineaId,
        autorUsuarioId: review.count.autorUsuarioId,
        revisorUsuarioId: context.actorId,
        revisorNombreVisible: review.user.nombreVisible ?? "Usuario de prueba",
        rolEfectivoRevisor: review.role,
        decision: "APROBAR",
        autorrevisionAdministrativa: selfReview,
        ...(request.motivoExcepcion === undefined ? {} : {motivo: request.motivoExcepcion}),
        claveIdempotencia: request.claveIdempotencia,
        decididaEn: decidedAt,
        eventoAuditoriaId: auditId,
        movimientoId: movementId
      });
      transaction.update(inventoryRef, {
        jornadaId: review.count.jornadaId,
        jornadaLineaId: review.count.jornadaLineaId,
        hembras: newValues.hembras,
        machos: newValues.machos,
        patrones: newValues.patrones,
        total: newValues.total,
        conteoAprobadoId: request.conteoId,
        version: nextInventoryVersion,
        origen: "CONTEO_APROBADO",
        actualizadoPorUsuarioId: context.actorId,
        actualizadoEn: decidedAt
      });
      transaction.create(movementRef, {
        id: movementId,
        jornadaId: review.count.jornadaId,
        jornadaLineaId: review.count.jornadaLineaId,
        lineaId: review.count.lineaId,
        conteoAprobadoId: request.conteoId,
        decisionId,
        valoresAnteriores: previousValues,
        valoresNuevos: newValues,
        diferencias: inventoryDifferences,
        versionInventarioAnterior: inventory.version,
        versionInventarioNueva: nextInventoryVersion,
        claveIdempotencia: request.claveIdempotencia,
        creadoEn: decidedAt
      });
      transaction.update(lineRef, {
        estadoCentral: "APROBADA",
        decisionVigenteId: decisionId,
        version: nextLineVersion,
        actualizadaEn: decidedAt
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "CONTEO_APROBADO",
        actorUsuarioId: context.actorId,
        recursoTipo: "CONTEO",
        recursoId: request.conteoId,
        jornadaId: review.count.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: decidedAt,
        metadatos: {
          jornadaLineaId: review.count.jornadaLineaId,
          decisionId,
          movimientoId: movementId,
          estadoAnterior: "PENDIENTE_REVISION",
          estadoNuevo: "APROBADA",
          autorrevisionAdministrativa: selfReview,
          ...(request.motivoExcepcion === undefined ? {} : {motivoExcepcion: request.motivoExcepcion}),
          versionLinea: nextLineVersion,
          versionInventario: nextInventoryVersion
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "APROBAR_CONTEO",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: decidedAt
      });
      return result;
    });
  }
}

export class ReturnCountService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: ReturnCountRequest, context: TrustedOperationContext): Promise<ReturnCountResult> {
    const idempotencyId = sha256(`${context.actorId}:DEVOLVER_CONTEO:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({conteoId: request.conteoId, motivo: request.motivo}));
    const decisionId = randomUUID();
    const auditId = randomUUID();

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
      if ((userSnapshot.data() as UserDocument).activo !== true) throw domainErrors.userInactive();
      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<ReturnCountResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return previous.resultado;
      }
      if (!countSnapshot.exists) throw domainErrors.countNotFound();
      const count = countSnapshot.data() as CountDocument;
      if (typeof count.jornadaId !== "string" || typeof count.jornadaLineaId !== "string") {
        throw domainErrors.internal();
      }

      const journeyRef = this.firestore.collection("jornadas").doc(count.jornadaId);
      const authorizationRef = journeyRef.collection("autorizaciones").doc(context.actorId);
      const lineRef = this.firestore.collection("jornadaLineas").doc(count.jornadaLineaId);
      const [journeySnapshot, authorizationSnapshot, lineSnapshot] =
        await transaction.getAll(journeyRef, authorizationRef, lineRef);
      if (!journeySnapshot || !authorizationSnapshot || !lineSnapshot) throw domainErrors.internal();
      if (!journeySnapshot.exists) throw domainErrors.journeyNotFound();
      if (!authorizationSnapshot.exists) throw domainErrors.journeyAccessDenied();
      if (!lineSnapshot.exists) throw domainErrors.journeyLineNotFound();
      const review = requireReviewContext(
        userSnapshot.data() as DocumentData,
        countSnapshot.data() as DocumentData,
        journeySnapshot.data() as DocumentData,
        authorizationSnapshot.data() as DocumentData,
        lineSnapshot.data() as DocumentData,
        request.conteoId
      );

      const decidedAt = Timestamp.now();
      const nextLineVersion = (review.line.version as number) + 1;
      const result: ReturnCountResult = {
        conteoId: request.conteoId,
        jornadaLineaId: review.count.jornadaLineaId as string,
        decisionId,
        estadoCentral: "DEVUELTA",
        versionLinea: nextLineVersion,
        devueltaEn: decidedAt.toDate().toISOString()
      };
      const decisionRef = this.firestore.collection("decisionesRevision").doc(decisionId);
      const auditRef = this.firestore.collection("auditoria").doc(auditId);

      transaction.create(decisionRef, {
        id: decisionId,
        conteoId: request.conteoId,
        jornadaId: review.count.jornadaId,
        jornadaLineaId: review.count.jornadaLineaId,
        lineaId: review.count.lineaId,
        autorUsuarioId: review.count.autorUsuarioId,
        revisorUsuarioId: context.actorId,
        revisorNombreVisible: review.user.nombreVisible ?? "Usuario de prueba",
        rolEfectivoRevisor: review.role,
        decision: "DEVOLVER",
        autorrevisionAdministrativa: false,
        motivo: request.motivo,
        claveIdempotencia: request.claveIdempotencia,
        decididaEn: decidedAt,
        eventoAuditoriaId: auditId
      });
      transaction.update(lineRef, {
        estadoCentral: "DEVUELTA",
        decisionVigenteId: decisionId,
        version: nextLineVersion,
        actualizadaEn: decidedAt
      });
      transaction.create(auditRef, {
        id: auditId,
        tipo: "CONTEO_DEVUELTO",
        actorUsuarioId: context.actorId,
        recursoTipo: "CONTEO",
        recursoId: request.conteoId,
        jornadaId: review.count.jornadaId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: decidedAt,
        metadatos: {
          jornadaLineaId: review.count.jornadaLineaId,
          decisionId,
          motivo: request.motivo,
          estadoAnterior: "PENDIENTE_REVISION",
          estadoNuevo: "DEVUELTA",
          versionLinea: nextLineVersion
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "DEVOLVER_CONTEO",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: decidedAt
      });
      return result;
    });
  }
}
