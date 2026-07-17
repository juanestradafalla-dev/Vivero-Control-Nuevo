import {createHash, randomUUID} from "node:crypto";

import {
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type Transaction
} from "firebase-admin/firestore";

import type {
  ApproveDiscardRequest,
  ApproveDiscardResult,
  DiscardLineSummary,
  InventoryValues,
  ListDiscardLinesResult,
  RegisterDiscardRequest,
  RegisterDiscardResult,
  ReturnDiscardRequest,
  ReturnDiscardResult,
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

interface LineDocument {
  readonly ubicacionId?: string;
  readonly codigo?: string;
  readonly nombreVisible?: string;
  readonly orden?: number;
  readonly activa?: boolean;
}

interface LocationDocument {
  readonly tipo?: string;
  readonly ubicacionPadreId?: string | null;
  readonly nombreVisible?: string;
  readonly orden?: number;
  readonly activa?: boolean;
}

interface InventoryDocument {
  readonly lineaId?: string;
  readonly jornadaId?: string | null;
  readonly jornadaLineaId?: string | null;
  readonly hembras?: number;
  readonly machos?: number;
  readonly patrones?: number;
  readonly total?: number;
  readonly version?: number;
}

interface DiscardDocument {
  readonly lineaId?: string;
  readonly autorUsuarioId?: string;
  readonly hembras?: number;
  readonly machos?: number;
  readonly patrones?: number;
  readonly totalUnico?: number;
  readonly causas?: unknown;
  readonly versionInventarioObservada?: number;
  readonly estado?: string;
  readonly capturaInmutable?: boolean;
}

interface IdempotencyDocument<T> {
  readonly payloadHash?: string;
  readonly resultado?: T;
}

type CaptureRole = "AUXILIAR" | "SUPERVISOR" | "ADMINISTRADOR";
type ReviewRole = "SUPERVISOR" | "ADMINISTRADOR";

const captureRoles = new Set<UserRole>(["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function activeUser(snapshot: DocumentSnapshot): UserDocument {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const user = snapshot.data() as UserDocument;
  if (user.activo !== true) throw domainErrors.userInactive();
  return user;
}

function captureRole(user: UserDocument): CaptureRole {
  if (!Array.isArray(user.roles)) throw domainErrors.permissionDenied();
  for (const role of ["ADMINISTRADOR", "SUPERVISOR", "AUXILIAR"] as const) {
    if (user.roles.includes(role) && captureRoles.has(role)) return role;
  }
  throw domainErrors.permissionDenied();
}

function reviewRole(user: UserDocument): ReviewRole {
  if (!Array.isArray(user.roles)) throw domainErrors.discardReviewNotAllowed();
  if (user.roles.includes("ADMINISTRADOR")) return "ADMINISTRADOR";
  if (user.roles.includes("SUPERVISOR")) return "SUPERVISOR";
  throw domainErrors.discardReviewNotAllowed();
}

function inventoryValues(document: InventoryDocument): InventoryValues | undefined {
  const values = [document.hembras, document.machos, document.patrones, document.total];
  if (values.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)) return undefined;
  const total = (document.hembras as number) + (document.machos as number) + (document.patrones as number);
  if (!Number.isSafeInteger(total) || document.total !== total) return undefined;
  return {
    hembras: document.hembras as number,
    machos: document.machos as number,
    patrones: document.patrones as number,
    total
  };
}

function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) < Number.MAX_SAFE_INTEGER;
}

function visibleLocation(
  line: LineDocument,
  locations: ReadonlyMap<string, LocationDocument>
): VisibleLocation | undefined {
  if (
    line.activa !== true || typeof line.ubicacionId !== "string" ||
    typeof line.nombreVisible !== "string" || !Number.isSafeInteger(line.orden)
  ) return undefined;
  const path: Array<{id: string; data: LocationDocument}> = [];
  const visited = new Set<string>();
  let currentId: string | null = line.ubicacionId;
  while (currentId !== null) {
    if (visited.has(currentId) || path.length >= 10) return undefined;
    visited.add(currentId);
    const current = locations.get(currentId);
    if (!current || current.activa !== true || typeof current.nombreVisible !== "string") return undefined;
    path.unshift({id: currentId, data: current});
    currentId = current.ubicacionPadreId ?? null;
  }
  const byType = (type: string) => path.find((part) => part.data.tipo?.toUpperCase() === type)?.data.nombreVisible;
  const vivero = byType("VIVERO");
  const modulo = byType("MODULO");
  const cama = byType("CAMA");
  if (!vivero || !modulo || !cama) return undefined;
  return {
    vivero,
    modulo,
    cama,
    linea: line.codigo ?? line.nombreVisible,
    nombreVisible: [...path.map((part) => part.data.nombreVisible), line.nombreVisible].join(" · "),
    orden: line.orden as number
  };
}

function discardValues(document: DiscardDocument): InventoryValues | undefined {
  const values = inventoryValues({
    hembras: document.hembras,
    machos: document.machos,
    patrones: document.patrones,
    total: document.totalUnico
  });
  return values;
}

function exceeds(discard: InventoryValues, inventory: InventoryValues): boolean {
  return discard.hembras > inventory.hembras ||
    discard.machos > inventory.machos ||
    discard.patrones > inventory.patrones;
}

export class ListDiscardLinesService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<ListDiscardLinesResult> {
    const userSnapshot = await this.firestore.collection("usuarios").doc(context.actorId).get();
    captureRole(activeUser(userSnapshot));
    const [linesSnapshot, locationsSnapshot, inventoriesSnapshot] = await Promise.all([
      this.firestore.collection("lineas").get(),
      this.firestore.collection("ubicaciones").get(),
      this.firestore.collection("inventarioOficialLineas").get()
    ]);
    const locations = new Map(locationsSnapshot.docs.map((snapshot) => [
      snapshot.id, snapshot.data() as LocationDocument
    ]));
    const inventories = new Map(inventoriesSnapshot.docs.map((snapshot) => [
      snapshot.id, snapshot.data() as InventoryDocument
    ]));
    const lines: DiscardLineSummary[] = [];
    for (const snapshot of linesSnapshot.docs) {
      const line = snapshot.data() as LineDocument;
      const inventory = inventories.get(snapshot.id);
      const location = visibleLocation(line, locations);
      const values = inventory ? inventoryValues(inventory) : undefined;
      if (!location || !inventory || inventory.lineaId !== snapshot.id || !values || !validVersion(inventory.version)) {
        continue;
      }
      lines.push({
        lineaId: snapshot.id,
        ubicacion: location,
        inventario: values,
        versionInventario: inventory.version
      });
    }
    return {
      lineas: lines.sort((left, right) =>
        left.ubicacion.nombreVisible.localeCompare(right.ubicacion.nombreVisible, "es", {numeric: true}) ||
        left.lineaId.localeCompare(right.lineaId, "es", {numeric: true})
      )
    };
  }
}

export class RegisterDiscardService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: RegisterDiscardRequest,
    context: TrustedOperationContext
  ): Promise<RegisterDiscardResult> {
    const idempotencyId = sha256(`${context.actorId}:REGISTRAR_DESCARTE:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      lineaId: request.lineaId,
      versionInventarioObservada: request.versionInventarioObservada,
      dispositivoId: request.dispositivoId,
      hembras: request.hembras,
      machos: request.machos,
      patrones: request.patrones,
      causas: request.causas,
      observaciones: request.observaciones ?? null,
      timestampDispositivo: request.timestampDispositivo
    }));
    const discardId = randomUUID();
    const auditId = randomUUID();
    return this.firestore.runTransaction(async (transaction) => {
      const userRef = this.firestore.collection("usuarios").doc(context.actorId);
      const lineRef = this.firestore.collection("lineas").doc(request.lineaId);
      const inventoryRef = this.firestore.collection("inventarioOficialLineas").doc(request.lineaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [userSnapshot, lineSnapshot, inventorySnapshot, previousSnapshot] = await transaction.getAll(
        userRef, lineRef, inventoryRef, idempotencyRef
      );
      if (!userSnapshot || !lineSnapshot || !inventorySnapshot || !previousSnapshot) throw domainErrors.internal();
      const user = activeUser(userSnapshot);
      const role = captureRole(user);
      if (previousSnapshot.exists) {
        const previous = previousSnapshot.data() as IdempotencyDocument<RegisterDiscardResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      if (!lineSnapshot.exists) throw domainErrors.catalogLineNotFound();
      const line = lineSnapshot.data() as LineDocument;
      if (line.activa !== true) throw domainErrors.lineInactive();
      if (!inventorySnapshot.exists) throw domainErrors.inventoryNotFound();
      const inventory = inventorySnapshot.data() as InventoryDocument;
      const currentValues = inventoryValues(inventory);
      if (inventory.lineaId !== request.lineaId || !currentValues || !validVersion(inventory.version)) {
        throw domainErrors.internal();
      }
      if (inventory.version !== request.versionInventarioObservada) throw domainErrors.discardStaleInventory();
      const submittedValues: InventoryValues = {
        hembras: request.hembras,
        machos: request.machos,
        patrones: request.patrones,
        total: request.hembras + request.machos + request.patrones
      };
      if (exceeds(submittedValues, currentValues)) throw domainErrors.discardExceedsInventory();

      const locationsSnapshot = await transaction.get(this.firestore.collection("ubicaciones"));
      const locations = new Map(locationsSnapshot.docs.map((snapshot) => [
        snapshot.id, snapshot.data() as LocationDocument
      ]));
      const location = visibleLocation(line, locations);
      if (!location) throw domainErrors.catalogLocationInactive();

      const receivedAt = Timestamp.now();
      const result: RegisterDiscardResult = {
        descarteId: discardId,
        lineaId: request.lineaId,
        estado: "PENDIENTE_REVISION",
        hembras: request.hembras,
        machos: request.machos,
        patrones: request.patrones,
        totalUnico: submittedValues.total,
        causas: request.causas,
        versionInventarioObservada: request.versionInventarioObservada,
        recibidoEn: receivedAt.toDate().toISOString()
      };
      transaction.create(this.firestore.collection("descartes").doc(discardId), {
        id: discardId,
        lineaId: request.lineaId,
        ubicacion: location,
        autorUsuarioId: context.actorId,
        autorNombreVisible: user.nombreVisible ?? "Usuario",
        rolEfectivo: role,
        dispositivoId: request.dispositivoId,
        hembras: request.hembras,
        machos: request.machos,
        patrones: request.patrones,
        totalUnico: submittedValues.total,
        causas: request.causas,
        ...(request.observaciones === undefined ? {} : {observaciones: request.observaciones}),
        versionInventarioObservada: request.versionInventarioObservada,
        estado: "PENDIENTE_REVISION",
        claveIdempotencia: request.claveIdempotencia,
        timestampDispositivo: request.timestampDispositivo,
        recibidoEn: receivedAt,
        capturaInmutable: true
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "DESCARTE_REGISTRADO",
        actorUsuarioId: context.actorId,
        recursoTipo: "DESCARTE",
        recursoId: discardId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: receivedAt,
        metadatos: {
          lineaId: request.lineaId,
          totalUnico: submittedValues.total,
          versionInventarioObservada: request.versionInventarioObservada
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "REGISTRAR_DESCARTE",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: receivedAt
      });
      return result;
    });
  }
}

interface ReviewContext {
  readonly user: UserDocument;
  readonly discard: DiscardDocument;
  readonly role: ReviewRole;
  readonly values: InventoryValues;
}

function requirePendingReview(userSnapshot: DocumentSnapshot, discardSnapshot: DocumentSnapshot): ReviewContext {
  const user = activeUser(userSnapshot);
  const role = reviewRole(user);
  if (!discardSnapshot.exists) throw domainErrors.discardNotFound();
  const discard = discardSnapshot.data() as DiscardDocument;
  const values = discardValues(discard);
  if (
    discard.estado !== "PENDIENTE_REVISION" || discard.capturaInmutable !== true ||
    typeof discard.lineaId !== "string" || typeof discard.autorUsuarioId !== "string" ||
    !validVersion(discard.versionInventarioObservada) || !values
  ) {
    if (discard.estado !== "PENDIENTE_REVISION") throw domainErrors.discardNotPendingReview();
    throw domainErrors.internal();
  }
  return {user, discard, role, values};
}

function writeReviewIdempotency<T>(
  transaction: Transaction,
  firestore: Firestore,
  id: string,
  actorId: string,
  operation: string,
  payloadHash: string,
  result: T,
  now: Timestamp
): void {
  transaction.create(firestore.collection("idempotencia").doc(id), {
    id, actorUsuarioId: actorId, operacion: operation, claveHash: id,
    payloadHash, resultado: result, creadoEn: now
  });
}

export class ApproveDiscardService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: ApproveDiscardRequest, context: TrustedOperationContext): Promise<ApproveDiscardResult> {
    const idempotencyId = sha256(`${context.actorId}:APROBAR_DESCARTE:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      descarteId: request.descarteId,
      motivoExcepcion: request.motivoExcepcion ?? null
    }));
    const decisionId = randomUUID();
    const movementId = randomUUID();
    const auditId = randomUUID();
    return this.firestore.runTransaction(async (transaction) => {
      const userRef = this.firestore.collection("usuarios").doc(context.actorId);
      const discardRef = this.firestore.collection("descartes").doc(request.descarteId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [userSnapshot, discardSnapshot, previousSnapshot] = await transaction.getAll(
        userRef, discardRef, idempotencyRef
      );
      if (!userSnapshot || !discardSnapshot || !previousSnapshot) throw domainErrors.internal();
      activeUser(userSnapshot);
      if (previousSnapshot.exists) {
        const previous = previousSnapshot.data() as IdempotencyDocument<ApproveDiscardResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      const review = requirePendingReview(userSnapshot, discardSnapshot);
      const selfReview = review.discard.autorUsuarioId === context.actorId;
      if (selfReview && review.role === "SUPERVISOR") throw domainErrors.selfApprovalForbidden();
      if (selfReview && review.role === "ADMINISTRADOR" && !request.motivoExcepcion) {
        throw domainErrors.exceptionReasonRequired();
      }
      if (!selfReview && request.motivoExcepcion !== undefined) throw domainErrors.invalidArgument();

      const inventoryRef = this.firestore.collection("inventarioOficialLineas").doc(review.discard.lineaId as string);
      const inventorySnapshot = await transaction.get(inventoryRef);
      if (!inventorySnapshot.exists) throw domainErrors.inventoryNotFound();
      const inventory = inventorySnapshot.data() as InventoryDocument;
      const previousValues = inventoryValues(inventory);
      if (inventory.lineaId !== review.discard.lineaId || !previousValues || !validVersion(inventory.version)) {
        throw domainErrors.internal();
      }
      if (inventory.version !== review.discard.versionInventarioObservada) {
        throw domainErrors.discardStaleInventory();
      }
      if (exceeds(review.values, previousValues)) throw domainErrors.discardExceedsInventory();
      const newValues: InventoryValues = {
        hembras: previousValues.hembras - review.values.hembras,
        machos: previousValues.machos - review.values.machos,
        patrones: previousValues.patrones - review.values.patrones,
        total: previousValues.total - review.values.total
      };
      const differences = {
        hembras: -review.values.hembras,
        machos: -review.values.machos,
        patrones: -review.values.patrones,
        total: -review.values.total
      };
      const now = Timestamp.now();
      const nextVersion = inventory.version + 1;
      const result: ApproveDiscardResult = {
        descarteId: request.descarteId,
        lineaId: review.discard.lineaId as string,
        decisionId,
        movimientoId: movementId,
        estado: "APROBADO",
        inventarioAnterior: previousValues,
        inventarioNuevo: newValues,
        versionInventario: nextVersion,
        aprobadaEn: now.toDate().toISOString()
      };
      transaction.create(this.firestore.collection("decisionesDescartes").doc(decisionId), {
        id: decisionId,
        descarteId: request.descarteId,
        lineaId: review.discard.lineaId,
        autorUsuarioId: review.discard.autorUsuarioId,
        revisorUsuarioId: context.actorId,
        revisorNombreVisible: review.user.nombreVisible ?? "Usuario",
        rolEfectivoRevisor: review.role,
        decision: "APROBAR",
        autorrevisionAdministrativa: selfReview,
        ...(request.motivoExcepcion === undefined ? {} : {motivo: request.motivoExcepcion}),
        claveIdempotencia: request.claveIdempotencia,
        decididaEn: now,
        eventoAuditoriaId: auditId,
        movimientoId: movementId
      });
      transaction.update(inventoryRef, {
        hembras: newValues.hembras,
        machos: newValues.machos,
        patrones: newValues.patrones,
        total: newValues.total,
        version: nextVersion,
        origen: "DESCARTE_APROBADO",
        ultimoDescarteAprobadoId: request.descarteId,
        actualizadoPorUsuarioId: context.actorId,
        actualizadoEn: now
      });
      transaction.create(this.firestore.collection("movimientosInventario").doc(movementId), {
        id: movementId,
        tipo: "DESCARTE_APROBADO",
        jornadaId: inventory.jornadaId ?? null,
        jornadaLineaId: inventory.jornadaLineaId ?? null,
        lineaId: review.discard.lineaId,
        descarteId: request.descarteId,
        decisionDescarteId: decisionId,
        valoresAnteriores: previousValues,
        valoresNuevos: newValues,
        diferencias: differences,
        versionInventarioAnterior: inventory.version,
        versionInventarioNueva: nextVersion,
        claveIdempotencia: request.claveIdempotencia,
        creadoEn: now
      });
      transaction.update(discardRef, {
        estado: "APROBADO",
        decisionId,
        movimientoId: movementId,
        revisadoPorUsuarioId: context.actorId,
        revisadoEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "DESCARTE_APROBADO",
        actorUsuarioId: context.actorId,
        recursoTipo: "DESCARTE",
        recursoId: request.descarteId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {
          lineaId: review.discard.lineaId,
          decisionId,
          movimientoId: movementId,
          totalUnico: review.values.total,
          versionInventario: nextVersion,
          autorrevisionAdministrativa: selfReview
        }
      });
      writeReviewIdempotency(
        transaction, this.firestore, idempotencyId, context.actorId, "APROBAR_DESCARTE",
        payloadHash, result, now
      );
      return result;
    });
  }
}

export class ReturnDiscardService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: ReturnDiscardRequest, context: TrustedOperationContext): Promise<ReturnDiscardResult> {
    const idempotencyId = sha256(`${context.actorId}:DEVOLVER_DESCARTE:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({descarteId: request.descarteId, motivo: request.motivo}));
    const decisionId = randomUUID();
    const auditId = randomUUID();
    return this.firestore.runTransaction(async (transaction) => {
      const userRef = this.firestore.collection("usuarios").doc(context.actorId);
      const discardRef = this.firestore.collection("descartes").doc(request.descarteId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [userSnapshot, discardSnapshot, previousSnapshot] = await transaction.getAll(
        userRef, discardRef, idempotencyRef
      );
      if (!userSnapshot || !discardSnapshot || !previousSnapshot) throw domainErrors.internal();
      activeUser(userSnapshot);
      if (previousSnapshot.exists) {
        const previous = previousSnapshot.data() as IdempotencyDocument<ReturnDiscardResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      const review = requirePendingReview(userSnapshot, discardSnapshot);
      const now = Timestamp.now();
      const result: ReturnDiscardResult = {
        descarteId: request.descarteId,
        lineaId: review.discard.lineaId as string,
        decisionId,
        estado: "DEVUELTO",
        devueltoEn: now.toDate().toISOString()
      };
      transaction.create(this.firestore.collection("decisionesDescartes").doc(decisionId), {
        id: decisionId,
        descarteId: request.descarteId,
        lineaId: review.discard.lineaId,
        autorUsuarioId: review.discard.autorUsuarioId,
        revisorUsuarioId: context.actorId,
        revisorNombreVisible: review.user.nombreVisible ?? "Usuario",
        rolEfectivoRevisor: review.role,
        decision: "DEVOLVER",
        motivo: request.motivo,
        claveIdempotencia: request.claveIdempotencia,
        decididaEn: now,
        eventoAuditoriaId: auditId
      });
      transaction.update(discardRef, {
        estado: "DEVUELTO",
        decisionId,
        motivoDevolucion: request.motivo,
        revisadoPorUsuarioId: context.actorId,
        revisadoEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "DESCARTE_DEVUELTO",
        actorUsuarioId: context.actorId,
        recursoTipo: "DESCARTE",
        recursoId: request.descarteId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {lineaId: review.discard.lineaId, decisionId, motivo: request.motivo}
      });
      writeReviewIdempotency(
        transaction, this.firestore, idempotencyId, context.actorId, "DEVOLVER_DESCARTE",
        payloadHash, result, now
      );
      return result;
    });
  }
}
