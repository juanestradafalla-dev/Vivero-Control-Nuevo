import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentSnapshot, type Firestore, type Transaction} from "firebase-admin/firestore";

import type {
  CatalogLineResult,
  CatalogLineInventorySummary,
  CatalogLineSummary,
  CatalogLocationResult,
  CatalogLocationSummary,
  CreateCatalogLineRequest,
  CreateCatalogLocationRequest,
  ListManageableCatalogResult,
  TrustedOperationContext,
  UpdateCatalogLineRequest,
  UpdateCatalogLocationRequest
} from "./contracts.js";
import {domainErrors} from "./errors.js";

interface UserDocument { readonly activo?: boolean; readonly roles?: unknown; }
interface LocationDocument {
  readonly codigo?: string;
  readonly codigoNormalizado?: string;
  readonly tipo?: string;
  readonly ubicacionPadreId?: string | null;
  readonly nombreVisible?: string;
  readonly orden?: number;
  readonly activa?: boolean;
  readonly version?: number;
}
interface LineDocument {
  readonly ubicacionId?: string;
  readonly codigo?: string;
  readonly codigoNormalizado?: string;
  readonly nombreVisible?: string;
  readonly orden?: number;
  readonly activa?: boolean;
  readonly version?: number;
}
interface DraftSelectionDocument { readonly lineaIds?: unknown; }
interface InventoryDocument {
  readonly lineaId?: string;
  readonly hembras?: number;
  readonly machos?: number;
  readonly patrones?: number;
  readonly total?: number;
  readonly version?: number;
  readonly origen?: string;
  readonly actualizadoPorUsuarioId?: string;
  readonly actualizadoEn?: unknown;
}
interface InitialLoadDocument { readonly lineaId?: string; readonly referenciaFuente?: string; }
interface IdempotencyDocument<Result> { readonly payloadHash?: string; readonly resultado?: Result; }

type CatalogOperation =
  | "CREAR_UBICACION"
  | "ACTUALIZAR_UBICACION"
  | "CREAR_LINEA"
  | "ACTUALIZAR_LINEA";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeCatalogCode(value: string): string {
  return value.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}

function assertActiveAdmin(snapshot: DocumentSnapshot): void {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const actor = snapshot.data() as UserDocument;
  if (actor.activo !== true) throw domainErrors.userInactive();
  if (!Array.isArray(actor.roles) || !actor.roles.includes("ADMINISTRADOR")) throw domainErrors.permissionDenied();
}

function versionOf(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw domainErrors.internal();
  return value as number;
}

function nextVersion(value: number): number {
  if (value >= Number.MAX_SAFE_INTEGER) throw domainErrors.internal();
  return value + 1;
}

function locationSummary(
  id: string,
  location: LocationDocument,
  activeChildren: number,
  activeLines: number
): CatalogLocationSummary {
  if (
    typeof location.codigo !== "string" || typeof location.tipo !== "string" ||
    typeof location.nombreVisible !== "string" || !Number.isSafeInteger(location.orden)
  ) throw domainErrors.internal();
  const parentId = location.ubicacionPadreId;
  if (parentId !== undefined && parentId !== null && typeof parentId !== "string") throw domainErrors.internal();
  return {
    ubicacionId: id,
    codigo: location.codigo,
    tipo: location.tipo,
    ubicacionPadreId: parentId ?? null,
    nombreVisible: location.nombreVisible,
    orden: location.orden as number,
    activa: location.activa === true,
    version: versionOf(location.version),
    cantidadHijosActivos: activeChildren,
    cantidadLineasActivas: activeLines
  };
}

function lineSummary(
  id: string,
  line: LineDocument,
  occupied: boolean,
  draftSelections: number,
  inventory: CatalogLineInventorySummary | null = null,
  ineligibleReason: string | null = null
): CatalogLineSummary {
  if (
    typeof line.ubicacionId !== "string" || typeof line.codigo !== "string" ||
    typeof line.nombreVisible !== "string" || !Number.isSafeInteger(line.orden)
  ) throw domainErrors.internal();
  return {
    lineaId: id,
    ubicacionId: line.ubicacionId,
    codigo: line.codigo,
    nombreVisible: line.nombreVisible,
    orden: line.orden as number,
    activa: line.activa === true,
    version: versionOf(line.version),
    ocupadaEnJornadaActiva: occupied,
    seleccionesBorrador: draftSelections,
    inventario: inventory,
    elegibleInventarioInicial: inventory === null && ineligibleReason === null,
    motivoNoElegibleInventarioInicial: inventory === null ? ineligibleReason : "INVENTARIO_EXISTENTE"
  };
}

function timestampIso(value: unknown): string {
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  throw domainErrors.internal();
}

function inventorySummary(
  inventory: InventoryDocument,
  initialLoad: InitialLoadDocument | undefined,
  actorName: string
): CatalogLineInventorySummary {
  const quantities = [inventory.hembras, inventory.machos, inventory.patrones, inventory.total];
  if (
    typeof inventory.lineaId !== "string" || !Number.isSafeInteger(inventory.version) ||
    typeof inventory.origen !== "string" || typeof inventory.actualizadoPorUsuarioId !== "string" ||
    quantities.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)
  ) throw domainErrors.internal();
  return {
    hembras: inventory.hembras as number,
    machos: inventory.machos as number,
    patrones: inventory.patrones as number,
    total: inventory.total as number,
    version: inventory.version as number,
    origen: inventory.origen,
    actorUsuarioId: inventory.actualizadoPorUsuarioId,
    actorNombreVisible: actorName,
    actualizadoEn: timestampIso(inventory.actualizadoEn),
    referenciaFuenteInicial: typeof initialLoad?.referenciaFuente === "string" ? initialLoad.referenciaFuente : null
  };
}

async function assertActiveParentChain(
  transaction: Transaction,
  firestore: Firestore,
  initialParentId: string | null,
  forbiddenId?: string
): Promise<void> {
  let currentId = initialParentId;
  const visited = new Set<string>();
  while (currentId !== null) {
    if (currentId === forbiddenId || visited.has(currentId)) throw domainErrors.catalogParentCycle();
    visited.add(currentId);
    const snapshot = await transaction.get(firestore.collection("ubicaciones").doc(currentId));
    if (!snapshot.exists) throw domainErrors.catalogLocationNotFound();
    const parent = snapshot.data() as LocationDocument;
    if (parent.activa !== true) throw domainErrors.catalogLocationInactive();
    const next = parent.ubicacionPadreId;
    if (next !== undefined && next !== null && typeof next !== "string") throw domainErrors.internal();
    currentId = next ?? null;
  }
}

function draftSelectionCount(snapshots: readonly DocumentSnapshot[], lineId: string): number {
  return snapshots.filter((snapshot) => {
    const ids = (snapshot.data() as DraftSelectionDocument).lineaIds;
    return Array.isArray(ids) && ids.includes(lineId);
  }).length;
}

function operationIds(actorId: string, operation: CatalogOperation, key: string, payload: unknown) {
  return {
    idempotencyId: sha256(`${actorId}:${operation}:${key}`),
    payloadHash: sha256(JSON.stringify(payload)),
    auditId: randomUUID()
  };
}

export class ListManageableCatalogService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<ListManageableCatalogResult> {
    const [actor, locations, lines, occupations, selections, inventories, initialLoads, users,
      journeyLines, reservations, counts, decisions, reassignments, movements] = await Promise.all([
      this.firestore.collection("usuarios").doc(context.actorId).get(),
      this.firestore.collection("ubicaciones").get(),
      this.firestore.collection("lineas").get(),
      this.firestore.collection("ocupacionesLineasActivas").get(),
      this.firestore.collection("seleccionesLineasJornada").get(),
      this.firestore.collection("inventarioOficialLineas").get(),
      this.firestore.collection("cargasInventarioInicial").get(),
      this.firestore.collection("usuarios").get(),
      this.firestore.collection("jornadaLineas").get(),
      this.firestore.collection("reservas").get(),
      this.firestore.collection("conteos").get(),
      this.firestore.collection("decisionesRevision").get(),
      this.firestore.collection("reasignacionesCorreccion").get(),
      this.firestore.collection("movimientosInventario").get()
    ]);
    assertActiveAdmin(actor);
    const occupied = new Set(occupations.docs.map((snapshot) => snapshot.id));
    const inventoryByLine = new Map(inventories.docs.map((snapshot) => [snapshot.id, snapshot.data() as InventoryDocument]));
    const loadByLine = new Map(initialLoads.docs.map((snapshot) => [snapshot.id, snapshot.data() as InitialLoadDocument]));
    const userNames = new Map(users.docs.map((snapshot) => [
      snapshot.id,
      typeof snapshot.data().nombreVisible === "string" ? snapshot.data().nombreVisible as string : snapshot.id
    ]));
    const activityLines = new Set<string>();
    for (const snapshot of [...reservations.docs, ...counts.docs, ...decisions.docs, ...reassignments.docs, ...movements.docs]) {
      const lineId = snapshot.data().lineaId;
      if (typeof lineId === "string") activityLines.add(lineId);
    }
    for (const snapshot of journeyLines.docs) {
      const data = snapshot.data();
      if (
        data.activa === true && typeof data.lineaId === "string" &&
        (data.estadoCentral !== "DISPONIBLE" || data.reservaActivaId !== null || data.conteoVigenteId != null ||
          data.decisionVigenteId != null || data.responsableCorreccionUsuarioId != null || data.reasignacionActivaId != null)
      ) activityLines.add(data.lineaId);
    }
    const activeChildren = new Map<string, number>();
    const activeLines = new Map<string, number>();
    locations.docs.forEach((snapshot) => {
      const location = snapshot.data() as LocationDocument;
      if (location.activa === true && typeof location.ubicacionPadreId === "string") {
        activeChildren.set(location.ubicacionPadreId, (activeChildren.get(location.ubicacionPadreId) ?? 0) + 1);
      }
    });
    lines.docs.forEach((snapshot) => {
      const line = snapshot.data() as LineDocument;
      if (line.activa === true && typeof line.ubicacionId === "string") {
        activeLines.set(line.ubicacionId, (activeLines.get(line.ubicacionId) ?? 0) + 1);
      }
    });
    return {
      ubicaciones: locations.docs.map((snapshot) => locationSummary(
        snapshot.id,
        snapshot.data() as LocationDocument,
        activeChildren.get(snapshot.id) ?? 0,
        activeLines.get(snapshot.id) ?? 0
      )).sort((left, right) => left.orden - right.orden || left.codigo.localeCompare(right.codigo)),
      lineas: lines.docs.map((snapshot) => {
        const line = snapshot.data() as LineDocument;
        const inventory = inventoryByLine.get(snapshot.id);
        const summary = inventory === undefined ? null : inventorySummary(
          inventory,
          loadByLine.get(snapshot.id),
          userNames.get(inventory.actualizadoPorUsuarioId ?? "") ?? inventory.actualizadoPorUsuarioId ?? "Administrador"
        );
        const reason = line.activa !== true ? "LINEA_INACTIVA" :
          activityLines.has(snapshot.id) ? "ACTIVIDAD_OPERATIVA" : null;
        return lineSummary(
          snapshot.id, line, occupied.has(snapshot.id), draftSelectionCount(selections.docs, snapshot.id), summary, reason
        );
      }).sort((left, right) => left.orden - right.orden || left.codigo.localeCompare(right.codigo))
    };
  }
}

export class CreateCatalogLocationService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: CreateCatalogLocationRequest, context: TrustedOperationContext): Promise<CatalogLocationResult> {
    const locationId = randomUUID();
    const normalizedCode = normalizeCatalogCode(request.codigo);
    if (normalizedCode.length === 0) throw domainErrors.invalidArgument();
    const ids = operationIds(context.actorId, "CREAR_UBICACION", request.claveIdempotencia, {
      codigo: normalizedCode,
      tipo: request.tipo,
      ubicacionPadreId: request.ubicacionPadreId,
      nombreVisible: request.nombreVisible,
      orden: request.orden
    });
    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(ids.idempotencyId);
      const lockId = sha256(`UBICACION:${request.ubicacionPadreId ?? "ROOT"}:${normalizedCode}`);
      const lockRef = this.firestore.collection("bloqueosCodigosCatalogo").doc(lockId);
      const [actor, previous, lock] = await transaction.getAll(actorRef, idempotencyRef, lockRef);
      if (!actor || !previous || !lock) throw domainErrors.internal();
      assertActiveAdmin(actor);
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument<CatalogLocationResult>;
        if (stored.payloadHash !== ids.payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      if (lock.exists) throw domainErrors.catalogDuplicateCode();
      await assertActiveParentChain(transaction, this.firestore, request.ubicacionPadreId, locationId);
      const now = Timestamp.now();
      const data: LocationDocument = {
        codigo: normalizedCode,
        codigoNormalizado: normalizedCode,
        tipo: request.tipo,
        ubicacionPadreId: request.ubicacionPadreId,
        nombreVisible: request.nombreVisible,
        orden: request.orden,
        activa: true,
        version: 1
      };
      const result: CatalogLocationResult = {
        ...locationSummary(locationId, data, 0, 0),
        operacion: "UBICACION_CREADA",
        actualizadaEn: now.toDate().toISOString()
      };
      transaction.create(this.firestore.collection("ubicaciones").doc(locationId), {
        id: locationId, ...data, creadaEn: now, actualizadaEn: now
      });
      transaction.create(lockRef, {
        id: lockId, recursoTipo: "UBICACION", recursoId: locationId,
        ambitoId: request.ubicacionPadreId ?? "ROOT", codigoNormalizado: normalizedCode, creadoEn: now
      });
      this.writeAuditAndIdempotency(transaction, ids, context, request.claveIdempotencia, result, now);
      return result;
    });
  }

  private writeAuditAndIdempotency(
    transaction: Transaction,
    ids: ReturnType<typeof operationIds>,
    context: TrustedOperationContext,
    key: string,
    result: CatalogLocationResult,
    now: Timestamp
  ): void {
    transaction.create(this.firestore.collection("auditoria").doc(ids.auditId), {
      id: ids.auditId, tipo: result.operacion, actorUsuarioId: context.actorId,
      recursoTipo: "UBICACION", recursoId: result.ubicacionId, claveIdempotencia: key,
      ocurridoEn: now, metadatos: {version: result.version, payloadHash: ids.payloadHash}
    });
    transaction.create(this.firestore.collection("idempotencia").doc(ids.idempotencyId), {
      id: ids.idempotencyId, actorUsuarioId: context.actorId, operacion: "CREAR_UBICACION",
      claveHash: ids.idempotencyId, payloadHash: ids.payloadHash, resultado: result, creadoEn: now
    });
  }
}

export class UpdateCatalogLocationService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: UpdateCatalogLocationRequest, context: TrustedOperationContext): Promise<CatalogLocationResult> {
    const ids = operationIds(context.actorId, "ACTUALIZAR_UBICACION", request.claveIdempotencia, {
      ubicacionId: request.ubicacionId, versionEsperada: request.versionEsperada,
      nombreVisible: request.nombreVisible, orden: request.orden, activa: request.activa, motivo: request.motivo
    });
    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const locationRef = this.firestore.collection("ubicaciones").doc(request.ubicacionId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(ids.idempotencyId);
      const [actor, locationSnapshot, previous] = await transaction.getAll(actorRef, locationRef, idempotencyRef);
      if (!actor || !locationSnapshot || !previous) throw domainErrors.internal();
      assertActiveAdmin(actor);
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument<CatalogLocationResult>;
        if (stored.payloadHash !== ids.payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      if (!locationSnapshot.exists) throw domainErrors.catalogLocationNotFound();
      const location = locationSnapshot.data() as LocationDocument;
      const currentVersion = versionOf(location.version);
      if (currentVersion !== request.versionEsperada) throw domainErrors.catalogStaleVersion();
      if (
        location.nombreVisible === request.nombreVisible && location.orden === request.orden &&
        (location.activa === true) === request.activa
      ) throw domainErrors.catalogNoChange();
      const children = await transaction.get(
        this.firestore.collection("ubicaciones").where("ubicacionPadreId", "==", request.ubicacionId)
      );
      const lines = await transaction.get(
        this.firestore.collection("lineas").where("ubicacionId", "==", request.ubicacionId)
      );
      const activeChildren = children.docs.filter((snapshot) => (snapshot.data() as LocationDocument).activa === true).length;
      const activeLines = lines.docs.filter((snapshot) => (snapshot.data() as LineDocument).activa === true).length;
      if (!request.activa && location.activa === true) {
        if (activeChildren > 0) throw domainErrors.catalogLocationHasActiveChildren();
        if (activeLines > 0) throw domainErrors.catalogLocationHasActiveLines();
      }
      if (request.activa && location.activa !== true) {
        const parent = location.ubicacionPadreId;
        if (parent !== undefined && parent !== null && typeof parent !== "string") throw domainErrors.internal();
        await assertActiveParentChain(transaction, this.firestore, parent ?? null, request.ubicacionId);
      }
      const now = Timestamp.now();
      const version = nextVersion(currentVersion);
      const updated: LocationDocument = {
        ...location, nombreVisible: request.nombreVisible, orden: request.orden, activa: request.activa, version
      };
      const result: CatalogLocationResult = {
        ...locationSummary(request.ubicacionId, updated, activeChildren, activeLines),
        operacion: "UBICACION_ACTUALIZADA",
        actualizadaEn: now.toDate().toISOString()
      };
      transaction.update(locationRef, {
        nombreVisible: request.nombreVisible, orden: request.orden, activa: request.activa, version,
        actualizadaEn: now, ultimoCambioMotivo: request.motivo,
        ultimoCambioPorUsuarioId: context.actorId, ultimoCambioEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(ids.auditId), {
        id: ids.auditId, tipo: "UBICACION_ACTUALIZADA", actorUsuarioId: context.actorId,
        recursoTipo: "UBICACION", recursoId: request.ubicacionId, claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now, metadatos: {version, motivo: request.motivo, payloadHash: ids.payloadHash}
      });
      transaction.create(idempotencyRef, {
        id: ids.idempotencyId, actorUsuarioId: context.actorId, operacion: "ACTUALIZAR_UBICACION",
        claveHash: ids.idempotencyId, payloadHash: ids.payloadHash, resultado: result, creadoEn: now
      });
      return result;
    });
  }
}

export class CreateCatalogLineService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: CreateCatalogLineRequest, context: TrustedOperationContext): Promise<CatalogLineResult> {
    const lineId = randomUUID();
    const normalizedCode = normalizeCatalogCode(request.codigo);
    if (normalizedCode.length === 0) throw domainErrors.invalidArgument();
    const ids = operationIds(context.actorId, "CREAR_LINEA", request.claveIdempotencia, {
      ubicacionId: request.ubicacionId, codigo: normalizedCode,
      nombreVisible: request.nombreVisible, orden: request.orden
    });
    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const locationRef = this.firestore.collection("ubicaciones").doc(request.ubicacionId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(ids.idempotencyId);
      const lockId = sha256(`LINEA:${request.ubicacionId}:${normalizedCode}`);
      const lockRef = this.firestore.collection("bloqueosCodigosCatalogo").doc(lockId);
      const [actor, location, previous, lock] = await transaction.getAll(actorRef, locationRef, idempotencyRef, lockRef);
      if (!actor || !location || !previous || !lock) throw domainErrors.internal();
      assertActiveAdmin(actor);
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument<CatalogLineResult>;
        if (stored.payloadHash !== ids.payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      if (!location.exists) throw domainErrors.catalogLocationNotFound();
      if ((location.data() as LocationDocument).activa !== true) throw domainErrors.catalogLocationInactive();
      if (lock.exists) throw domainErrors.catalogDuplicateCode();
      const now = Timestamp.now();
      const data: LineDocument = {
        ubicacionId: request.ubicacionId, codigo: normalizedCode, codigoNormalizado: normalizedCode,
        nombreVisible: request.nombreVisible, orden: request.orden, activa: true, version: 1
      };
      const result: CatalogLineResult = {
        ...lineSummary(lineId, data, false, 0), operacion: "LINEA_CREADA",
        actualizadaEn: now.toDate().toISOString()
      };
      transaction.create(this.firestore.collection("lineas").doc(lineId), {
        id: lineId, ...data, creadaEn: now, actualizadaEn: now
      });
      transaction.create(lockRef, {
        id: lockId, recursoTipo: "LINEA", recursoId: lineId,
        ambitoId: request.ubicacionId, codigoNormalizado: normalizedCode, creadoEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(ids.auditId), {
        id: ids.auditId, tipo: "LINEA_CREADA", actorUsuarioId: context.actorId,
        recursoTipo: "LINEA", recursoId: lineId, claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now, metadatos: {version: 1, payloadHash: ids.payloadHash}
      });
      transaction.create(idempotencyRef, {
        id: ids.idempotencyId, actorUsuarioId: context.actorId, operacion: "CREAR_LINEA",
        claveHash: ids.idempotencyId, payloadHash: ids.payloadHash, resultado: result, creadoEn: now
      });
      return result;
    });
  }
}

export class UpdateCatalogLineService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: UpdateCatalogLineRequest, context: TrustedOperationContext): Promise<CatalogLineResult> {
    const ids = operationIds(context.actorId, "ACTUALIZAR_LINEA", request.claveIdempotencia, {
      lineaId: request.lineaId, versionEsperada: request.versionEsperada,
      nombreVisible: request.nombreVisible, orden: request.orden, activa: request.activa, motivo: request.motivo
    });
    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const lineRef = this.firestore.collection("lineas").doc(request.lineaId);
      const occupationRef = this.firestore.collection("ocupacionesLineasActivas").doc(request.lineaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(ids.idempotencyId);
      const [actor, lineSnapshot, occupation, previous] = await transaction.getAll(
        actorRef, lineRef, occupationRef, idempotencyRef
      );
      if (!actor || !lineSnapshot || !occupation || !previous) throw domainErrors.internal();
      assertActiveAdmin(actor);
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument<CatalogLineResult>;
        if (stored.payloadHash !== ids.payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      if (!lineSnapshot.exists) throw domainErrors.catalogLineNotFound();
      const line = lineSnapshot.data() as LineDocument;
      const currentVersion = versionOf(line.version);
      if (currentVersion !== request.versionEsperada) throw domainErrors.catalogStaleVersion();
      if (occupation.exists) throw domainErrors.catalogLineOccupied();
      if (
        line.nombreVisible === request.nombreVisible && line.orden === request.orden &&
        (line.activa === true) === request.activa
      ) throw domainErrors.catalogNoChange();
      if (typeof line.ubicacionId !== "string") throw domainErrors.internal();
      const location = await transaction.get(this.firestore.collection("ubicaciones").doc(line.ubicacionId));
      if (!location.exists) throw domainErrors.catalogLocationNotFound();
      if ((location.data() as LocationDocument).activa !== true) throw domainErrors.catalogLocationInactive();
      const selections = await transaction.get(this.firestore.collection("seleccionesLineasJornada"));
      const selectionCount = draftSelectionCount(selections.docs, request.lineaId);
      const now = Timestamp.now();
      const version = nextVersion(currentVersion);
      const updated: LineDocument = {
        ...line, nombreVisible: request.nombreVisible, orden: request.orden, activa: request.activa, version
      };
      const result: CatalogLineResult = {
        ...lineSummary(request.lineaId, updated, false, selectionCount, null, request.activa ? null : "LINEA_INACTIVA"),
        operacion: "LINEA_ACTUALIZADA", actualizadaEn: now.toDate().toISOString()
      };
      transaction.update(lineRef, {
        nombreVisible: request.nombreVisible, orden: request.orden, activa: request.activa, version,
        actualizadaEn: now, ultimoCambioMotivo: request.motivo,
        ultimoCambioPorUsuarioId: context.actorId, ultimoCambioEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(ids.auditId), {
        id: ids.auditId, tipo: "LINEA_ACTUALIZADA", actorUsuarioId: context.actorId,
        recursoTipo: "LINEA", recursoId: request.lineaId, claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now, metadatos: {version, motivo: request.motivo, seleccionesBorrador: selectionCount, payloadHash: ids.payloadHash}
      });
      transaction.create(idempotencyRef, {
        id: ids.idempotencyId, actorUsuarioId: context.actorId, operacion: "ACTUALIZAR_LINEA",
        claveHash: ids.idempotencyId, payloadHash: ids.payloadHash, resultado: result, creadoEn: now
      });
      return result;
    });
  }
}
