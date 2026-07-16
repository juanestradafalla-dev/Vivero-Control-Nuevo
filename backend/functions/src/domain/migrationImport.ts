import {createHash, randomUUID} from "node:crypto";

import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
  type Transaction
} from "firebase-admin/firestore";

import {normalizeCatalogCode} from "./catalog.js";
import type {
  ImportMigrationPackageRequest,
  ListMigrationImportsResult,
  MigrationCatalogPackageV1,
  MigrationImportMapEntry,
  MigrationImportResult,
  MigrationImportSummary,
  RevertMigrationImportRequest,
  RevertMigrationImportResult,
  TrustedOperationContext
} from "./contracts.js";
import {domainErrors} from "./errors.js";
import {
  deterministicMigrationPackageHash,
  normalizeMigrationPackage,
  validateMigrationPackage,
  type CurrentCatalog
} from "./migrationPreflight.js";

export const MIGRATION_IMPORT_MAX_WRITES = 450;

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

interface MigrationImportDocument {
  readonly id?: string;
  readonly hashPaquete?: string;
  readonly estado?: "APLICADA" | "REVERTIDA";
  readonly version?: number;
  readonly cantidades?: MigrationImportResult["cantidades"];
  readonly escriturasRealizadas?: number;
  readonly mapa?: MigrationImportResult["mapa"];
  readonly inventarioLineaIds?: unknown;
  readonly aplicadaPorUsuarioId?: string;
  readonly aplicadaPorNombreVisible?: string;
  readonly aplicadaEn?: unknown;
  readonly revertidaPorUsuarioId?: string;
  readonly revertidaEn?: unknown;
  readonly motivoReversion?: string;
}

interface ReversalCollections {
  readonly locations: QuerySnapshot;
  readonly lines: QuerySnapshot;
  readonly draftSelections: QuerySnapshot;
  readonly occupations: QuerySnapshot;
  readonly journeyLines: QuerySnapshot;
  readonly reservations: QuerySnapshot;
  readonly counts: QuerySnapshot;
  readonly decisions: QuerySnapshot;
  readonly reassignments: QuerySnapshot;
  readonly movements: QuerySnapshot;
}

interface ReversalResources {
  readonly references: readonly DocumentReference[];
  readonly locations: readonly DocumentReference[];
  readonly lines: readonly DocumentReference[];
  readonly inventories: readonly DocumentReference[];
  readonly initialLoads: readonly DocumentReference[];
  readonly locks: readonly DocumentReference[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestampIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return "";
}

function assertActiveAdmin(snapshot: DocumentSnapshot): DocumentData {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const actor = snapshot.data() as DocumentData;
  if (actor.activo !== true) throw domainErrors.userInactive();
  if (!Array.isArray(actor.roles) || !actor.roles.includes("ADMINISTRADOR")) {
    throw domainErrors.permissionDenied();
  }
  return actor;
}

function idempotencyIds(actorId: string, operation: string, key: string, payload: unknown) {
  const idempotencyId = sha256(`${actorId}:${operation}:${key}`);
  return {
    idempotencyId,
    auditId: sha256(`${idempotencyId}:AUDITORIA`),
    payloadHash: sha256(JSON.stringify(payload))
  };
}

export function projectedMigrationImportWrites(packageData: MigrationCatalogPackageV1): number {
  return 2 * (
    packageData.ubicaciones.length + packageData.lineas.length + packageData.inventariosIniciales.length
  ) + 4;
}

function allItemsAreNew(result: ReturnType<typeof validateMigrationPackage>): boolean {
  const summaries = [
    result.resumenConflictos.ubicaciones,
    result.resumenConflictos.lineas,
    result.resumenConflictos.inventariosIniciales
  ];
  return summaries.every((summary) => summary.coincidentes === 0 && summary.bloqueados === 0);
}

function currentCatalogFrom(values: readonly QuerySnapshot[]): CurrentCatalog {
  const [locations, lines, inventories, occupations, journeyLines, journeys] = values;
  if (!locations || !lines || !inventories || !occupations || !journeyLines || !journeys) {
    throw domainErrors.internal();
  }
  return {locations, lines, inventories, occupations, journeyLines, journeys};
}

function orderedLocations(packageData: MigrationCatalogPackageV1) {
  const byKey = new Map(packageData.ubicaciones.map((location) => [location.claveExterna, location]));
  const result: Array<(typeof packageData.ubicaciones)[number]> = [];
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    const location = byKey.get(key);
    if (!location) throw domainErrors.migrationPackageNotEligible();
    if (location.ubicacionPadreClaveExterna) visit(location.ubicacionPadreClaveExterna);
    visited.add(key);
    result.push(location);
  };
  packageData.ubicaciones.forEach((location) => visit(location.claveExterna));
  return result;
}

function prepareMap(packageData: MigrationCatalogPackageV1): MigrationImportResult["mapa"] {
  const locationIds = new Map(packageData.ubicaciones.map((location) => [location.claveExterna, randomUUID()]));
  const locations: MigrationImportMapEntry[] = packageData.ubicaciones.map((location) => {
    const internalId = locationIds.get(location.claveExterna);
    if (!internalId) throw domainErrors.internal();
    const parentId = location.ubicacionPadreClaveExterna === null
      ? "ROOT" : locationIds.get(location.ubicacionPadreClaveExterna);
    if (!parentId) throw domainErrors.migrationPackageNotEligible();
    return {
      claveExterna: location.claveExterna,
      idInterno: internalId,
      bloqueoCodigoId: sha256(`UBICACION:${parentId}:${normalizeCatalogCode(location.codigo)}`)
    };
  });
  const lines: MigrationImportMapEntry[] = packageData.lineas.map((line) => {
    const locationId = locationIds.get(line.ubicacionClaveExterna);
    if (!locationId) throw domainErrors.migrationPackageNotEligible();
    return {
      claveExterna: line.claveExterna,
      idInterno: randomUUID(),
      bloqueoCodigoId: sha256(`LINEA:${locationId}:${normalizeCatalogCode(line.codigo)}`)
    };
  });
  return {ubicaciones: locations, lineas: lines};
}

function mapByExternal(entries: readonly MigrationImportMapEntry[]): Map<string, MigrationImportMapEntry> {
  return new Map(entries.map((entry) => [entry.claveExterna, entry]));
}

function isValidMapEntry(value: unknown): value is MigrationImportMapEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.claveExterna === "string" && typeof entry.idInterno === "string" &&
    typeof entry.bloqueoCodigoId === "string";
}

function importMap(data: MigrationImportDocument): MigrationImportResult["mapa"] | undefined {
  const value = data.mapa;
  if (!value || !Array.isArray(value.ubicaciones) || !Array.isArray(value.lineas) ||
      !value.ubicaciones.every(isValidMapEntry) || !value.lineas.every(isValidMapEntry)) return undefined;
  return value;
}

function reversalResources(firestore: Firestore, data: MigrationImportDocument): ReversalResources | undefined {
  const map = importMap(data);
  if (!map || !Array.isArray(data.inventarioLineaIds) ||
      !data.inventarioLineaIds.every((value) => typeof value === "string")) return undefined;
  const mappedLineIds = new Set(map.lineas.map((entry) => entry.idInterno));
  const mappedLocationIds = new Set(map.ubicaciones.map((entry) => entry.idInterno));
  const inventoryLineIds = data.inventarioLineaIds as string[];
  if (mappedLineIds.size !== map.lineas.length || mappedLocationIds.size !== map.ubicaciones.length ||
      new Set(inventoryLineIds).size !== inventoryLineIds.length ||
      inventoryLineIds.length !== data.cantidades?.inventariosIniciales ||
      inventoryLineIds.some((lineId) => !mappedLineIds.has(lineId))) return undefined;
  const locations = map.ubicaciones.map((entry) => firestore.collection("ubicaciones").doc(entry.idInterno));
  const lines = map.lineas.map((entry) => firestore.collection("lineas").doc(entry.idInterno));
  const inventories = inventoryLineIds.map((lineId) => firestore.collection("inventarioOficialLineas").doc(lineId));
  const initialLoads = inventoryLineIds.map((lineId) => firestore.collection("cargasInventarioInicial").doc(lineId));
  const locks = [...map.ubicaciones, ...map.lineas]
    .map((entry) => firestore.collection("bloqueosCodigosCatalogo").doc(entry.bloqueoCodigoId));
  return {references: [...locations, ...lines, ...inventories, ...initialLoads, ...locks], locations, lines,
    inventories, initialLoads, locks};
}

function collectReversalBlockers(
  importId: string,
  data: MigrationImportDocument,
  resources: ReversalResources | undefined,
  snapshots: readonly DocumentSnapshot[],
  collections: ReversalCollections
): string[] {
  if (!resources) return ["REGISTRO_INCOMPLETO"];
  const byPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
  const map = importMap(data);
  if (!map) return ["REGISTRO_INCOMPLETO"];
  const blockers = new Set<string>();
  const importedLocationIds = new Set(map.ubicaciones.map((entry) => entry.idInterno));
  const importedLineIds = new Set(map.lineas.map((entry) => entry.idInterno));
  const lockOwners = new Map([...map.ubicaciones, ...map.lineas]
    .map((entry) => [`bloqueosCodigosCatalogo/${entry.bloqueoCodigoId}`, entry.idInterno]));

  for (const reference of resources.locations) {
    const snapshot = byPath.get(reference.path);
    const value = snapshot?.data();
    if (!snapshot?.exists || value?.version !== 1 || value?.creadaPorImportacionId !== importId) {
      blockers.add("UBICACION_MODIFICADA");
    }
  }
  for (const reference of resources.lines) {
    const snapshot = byPath.get(reference.path);
    const value = snapshot?.data();
    if (!snapshot?.exists || value?.version !== 1 || value?.creadaPorImportacionId !== importId) {
      blockers.add("LINEA_MODIFICADA");
    }
  }
  for (const reference of resources.inventories) {
    const snapshot = byPath.get(reference.path);
    const value = snapshot?.data();
    if (!snapshot?.exists || value?.version !== 1 || value?.origen !== "MIGRACION_CONTROLADA_EMULADOR" ||
        value?.creadaPorImportacionId !== importId) blockers.add("INVENTARIO_MODIFICADO");
  }
  for (const reference of resources.initialLoads) {
    const snapshot = byPath.get(reference.path);
    const value = snapshot?.data();
    if (!snapshot?.exists || value?.origen !== "MIGRACION_CONTROLADA_EMULADOR" ||
        value?.creadaPorImportacionId !== importId || value?.inmutable !== true) {
      blockers.add("CARGA_INICIAL_MODIFICADA");
    }
  }
  for (const reference of resources.locks) {
    const snapshot = byPath.get(reference.path);
    if (!snapshot?.exists || snapshot.data()?.recursoId !== lockOwners.get(reference.path) ||
        snapshot.data()?.creadaPorImportacionId !== importId) blockers.add("BLOQUEO_CODIGO_MODIFICADO");
  }
  collections.locations.docs.forEach((snapshot) => {
    const parentId = snapshot.data().ubicacionPadreId;
    if (importedLocationIds.has(parentId) && !importedLocationIds.has(snapshot.id)) blockers.add("HIJO_EXTERNO");
  });
  collections.lines.docs.forEach((snapshot) => {
    const locationId = snapshot.data().ubicacionId;
    if (importedLocationIds.has(locationId) && !importedLineIds.has(snapshot.id)) blockers.add("LINEA_EXTERNA");
  });
  collections.draftSelections.docs.forEach((snapshot) => {
    const ids = snapshot.data().lineaIds;
    if (Array.isArray(ids) && ids.some((id) => importedLineIds.has(String(id)))) blockers.add("SELECCION_BORRADOR");
  });
  if (collections.occupations.docs.some((snapshot) => importedLineIds.has(snapshot.id))) blockers.add("OCUPACION_ACTIVA");
  if (collections.journeyLines.docs.some((snapshot) => importedLineIds.has(String(snapshot.data().lineaId)))) {
    blockers.add("JORNADA_LINEA");
  }
  const activityCollections: Array<[QuerySnapshot, string]> = [
    [collections.reservations, "RESERVA"], [collections.counts, "CONTEO"],
    [collections.decisions, "DECISION"], [collections.reassignments, "CORRECCION"],
    [collections.movements, "MOVIMIENTO"]
  ];
  activityCollections.forEach(([collection, code]) => {
    if (collection.docs.some((snapshot) => importedLineIds.has(String(snapshot.data().lineaId)))) blockers.add(code);
  });
  return [...blockers].sort();
}

async function getReversalCollections(firestore: Firestore): Promise<ReversalCollections> {
  const values = await Promise.all([
    firestore.collection("ubicaciones").get(), firestore.collection("lineas").get(),
    firestore.collection("seleccionesLineasJornada").get(), firestore.collection("ocupacionesLineasActivas").get(),
    firestore.collection("jornadaLineas").get(), firestore.collection("reservas").get(),
    firestore.collection("conteos").get(), firestore.collection("decisionesRevision").get(),
    firestore.collection("reasignacionesCorreccion").get(), firestore.collection("movimientosInventario").get()
  ]);
  const [locations, lines, draftSelections, occupations, journeyLines, reservations, counts, decisions,
    reassignments, movements] = values;
  if (!locations || !lines || !draftSelections || !occupations || !journeyLines || !reservations || !counts ||
      !decisions || !reassignments || !movements) throw domainErrors.internal();
  return {locations, lines, draftSelections, occupations, journeyLines, reservations, counts, decisions,
    reassignments, movements};
}

async function transactionReversalCollections(
  transaction: Transaction,
  firestore: Firestore
): Promise<ReversalCollections> {
  const values = await Promise.all([
    transaction.get(firestore.collection("ubicaciones")), transaction.get(firestore.collection("lineas")),
    transaction.get(firestore.collection("seleccionesLineasJornada")),
    transaction.get(firestore.collection("ocupacionesLineasActivas")),
    transaction.get(firestore.collection("jornadaLineas")), transaction.get(firestore.collection("reservas")),
    transaction.get(firestore.collection("conteos")), transaction.get(firestore.collection("decisionesRevision")),
    transaction.get(firestore.collection("reasignacionesCorreccion")),
    transaction.get(firestore.collection("movimientosInventario"))
  ]);
  const [locations, lines, draftSelections, occupations, journeyLines, reservations, counts, decisions,
    reassignments, movements] = values;
  return {locations, lines, draftSelections, occupations, journeyLines, reservations, counts, decisions,
    reassignments, movements};
}

export class ImportMigrationPackageService {
  constructor(private readonly firestore: Firestore) {}

  async execute(request: ImportMigrationPackageRequest, context: TrustedOperationContext): Promise<MigrationImportResult> {
    const recalculatedHash = deterministicMigrationPackageHash(request.paquete);
    const ids = idempotencyIds(context.actorId, "IMPORTAR_PAQUETE_MIGRACION", request.claveIdempotencia, {
      hashPaquete: recalculatedHash, hashEsperado: request.hashEsperado, confirmacionHash: request.confirmacionHash
    });
    const importId = randomUUID();
    const hashLockId = sha256(`MIGRACION:${recalculatedHash}`);
    let preparedMap: MigrationImportResult["mapa"] | undefined;

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(ids.idempotencyId);
      const hashLockRef = this.firestore.collection("bloqueosHashesMigracion").doc(hashLockId);
      const [actorSnapshot, previous, hashLock] = await transaction.getAll(actorRef, idempotencyRef, hashLockRef);
      if (!actorSnapshot || !previous || !hashLock) throw domainErrors.internal();
      const actor = assertActiveAdmin(actorSnapshot);
      if (recalculatedHash !== request.hashEsperado || recalculatedHash !== request.confirmacionHash) {
        throw domainErrors.migrationHashMismatch();
      }
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument<MigrationImportResult>;
        if (stored.payloadHash !== ids.payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      if (hashLock.exists) throw domainErrors.migrationHashAlreadyImported();

      const currentValues = await Promise.all([
        transaction.get(this.firestore.collection("ubicaciones")),
        transaction.get(this.firestore.collection("lineas")),
        transaction.get(this.firestore.collection("inventarioOficialLineas")),
        transaction.get(this.firestore.collection("ocupacionesLineasActivas")),
        transaction.get(this.firestore.collection("jornadaLineas")),
        transaction.get(this.firestore.collection("jornadas"))
      ]);
      const validation = validateMigrationPackage(request.paquete, currentCatalogFrom(currentValues));
      if (!validation.aptoParaImportar || !allItemsAreNew(validation)) {
        throw domainErrors.migrationPackageNotEligible();
      }
      const normalized = normalizeMigrationPackage(request.paquete);
      if (normalized.ubicaciones.length + normalized.lineas.length + normalized.inventariosIniciales.length === 0) {
        throw domainErrors.migrationPackageNotEligible();
      }
      const writes = projectedMigrationImportWrites(normalized);
      if (writes > MIGRATION_IMPORT_MAX_WRITES) throw domainErrors.migrationImportLimitExceeded();
      preparedMap ??= prepareMap(normalized);
      const locationMap = mapByExternal(preparedMap.ubicaciones);
      const lineMap = mapByExternal(preparedMap.lineas);
      const now = Timestamp.now();
      const actorName = typeof actor.nombreVisible === "string" ? actor.nombreVisible : context.actorId;

      for (const location of orderedLocations(normalized)) {
        const mapped = locationMap.get(location.claveExterna);
        const parentId = location.ubicacionPadreClaveExterna === null
          ? null : locationMap.get(location.ubicacionPadreClaveExterna)?.idInterno;
        if (!mapped || (location.ubicacionPadreClaveExterna !== null && !parentId)) throw domainErrors.internal();
        transaction.create(this.firestore.collection("ubicaciones").doc(mapped.idInterno), {
          id: mapped.idInterno, claveExterna: location.claveExterna,
          codigo: location.codigo, codigoNormalizado: location.codigo, tipo: location.tipo,
          ubicacionPadreId: parentId, nombreVisible: location.nombreVisible, orden: location.orden,
          activa: location.activa, version: 1, creadaPorImportacionId: importId, creadaEn: now, actualizadaEn: now
        });
        transaction.create(this.firestore.collection("bloqueosCodigosCatalogo").doc(mapped.bloqueoCodigoId), {
          id: mapped.bloqueoCodigoId, recursoTipo: "UBICACION", recursoId: mapped.idInterno,
          ambitoId: parentId ?? "ROOT", codigoNormalizado: location.codigo,
          creadaPorImportacionId: importId, creadoEn: now
        });
      }
      for (const line of normalized.lineas) {
        const mapped = lineMap.get(line.claveExterna);
        const locationId = locationMap.get(line.ubicacionClaveExterna)?.idInterno;
        if (!mapped || !locationId) throw domainErrors.internal();
        transaction.create(this.firestore.collection("lineas").doc(mapped.idInterno), {
          id: mapped.idInterno, claveExterna: line.claveExterna, ubicacionId: locationId,
          codigo: line.codigo, codigoNormalizado: line.codigo, nombreVisible: line.nombreVisible,
          orden: line.orden, activa: line.activa, version: 1, creadaPorImportacionId: importId,
          creadaEn: now, actualizadaEn: now
        });
        transaction.create(this.firestore.collection("bloqueosCodigosCatalogo").doc(mapped.bloqueoCodigoId), {
          id: mapped.bloqueoCodigoId, recursoTipo: "LINEA", recursoId: mapped.idInterno,
          ambitoId: locationId, codigoNormalizado: line.codigo, creadaPorImportacionId: importId, creadoEn: now
        });
      }
      for (const inventory of normalized.inventariosIniciales) {
        const lineId = lineMap.get(inventory.lineaClaveExterna)?.idInterno;
        if (!lineId) throw domainErrors.internal();
        const total = inventory.hembras + inventory.machos + inventory.patrones;
        transaction.create(this.firestore.collection("inventarioOficialLineas").doc(lineId), {
          id: lineId, jornadaId: null, jornadaLineaId: null, lineaId: lineId,
          hembras: inventory.hembras, machos: inventory.machos, patrones: inventory.patrones, total,
          conteoAprobadoId: null, version: 1, origen: "MIGRACION_CONTROLADA_EMULADOR",
          creadaPorImportacionId: importId, actualizadoPorUsuarioId: context.actorId, actualizadoEn: now
        });
        transaction.create(this.firestore.collection("cargasInventarioInicial").doc(lineId), {
          id: lineId, lineaId: lineId, jornadaId: null, jornadaLineaId: null,
          hembras: inventory.hembras, machos: inventory.machos, patrones: inventory.patrones, total,
          versionInventario: 1, origen: "MIGRACION_CONTROLADA_EMULADOR", conteoAprobadoId: null,
          referenciaFuente: inventory.referenciaFuente, actorUsuarioId: context.actorId,
          actorNombreVisible: actorName, creadaPorImportacionId: importId, registradaEn: now, inmutable: true
        });
      }
      const result: MigrationImportResult = {
        importacionId: importId, hashPaquete: recalculatedHash, estado: "APLICADA", version: 1,
        cantidades: validation.cantidades, escriturasRealizadas: writes, mapa: preparedMap,
        aplicadaPorUsuarioId: context.actorId, aplicadaEn: now.toDate().toISOString()
      };
      const inventoryLineIds = normalized.inventariosIniciales.map((inventory) => {
        const lineId = lineMap.get(inventory.lineaClaveExterna)?.idInterno;
        if (!lineId) throw domainErrors.internal();
        return lineId;
      });
      transaction.create(this.firestore.collection("importacionesMigracion").doc(importId), {
        id: importId, hashPaquete: recalculatedHash, estado: "APLICADA", version: 1,
        cantidades: validation.cantidades, escriturasRealizadas: writes, mapa: preparedMap, inventarioLineaIds: inventoryLineIds,
        aplicadaPorUsuarioId: context.actorId, aplicadaPorNombreVisible: actorName, aplicadaEn: now
      });
      transaction.create(hashLockRef, {
        id: hashLockId, hashPaquete: recalculatedHash, importacionId: importId, creadoEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(ids.auditId), {
        id: ids.auditId, tipo: "MIGRACION_IMPORTADA", actorUsuarioId: context.actorId,
        recursoTipo: "IMPORTACION_MIGRACION", recursoId: importId,
        claveIdempotencia: request.claveIdempotencia, ocurridoEn: now,
        metadatos: {hashPaquete: recalculatedHash, cantidades: validation.cantidades, escriturasRealizadas: writes}
      });
      transaction.create(idempotencyRef, {
        id: ids.idempotencyId, actorUsuarioId: context.actorId, operacion: "IMPORTAR_PAQUETE_MIGRACION",
        claveHash: ids.idempotencyId, payloadHash: ids.payloadHash, resultado: result, creadoEn: now
      });
      return result;
    });
  }
}

export class ListMigrationImportsService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<ListMigrationImportsResult> {
    const [actor, imports] = await Promise.all([
      this.firestore.collection("usuarios").doc(context.actorId).get(),
      this.firestore.collection("importacionesMigracion").get()
    ]);
    assertActiveAdmin(actor);
    const summaries = await Promise.all(imports.docs.map(async (snapshot): Promise<MigrationImportSummary> => {
      const data = snapshot.data() as MigrationImportDocument;
      const resources = reversalResources(this.firestore, data);
      const [resourceSnapshots, collections] = await Promise.all([
        resources && resources.references.length > 0 ? this.firestore.getAll(...resources.references) : Promise.resolve([]),
        getReversalCollections(this.firestore)
      ]);
      const blockers = data.estado === "APLICADA"
        ? collectReversalBlockers(snapshot.id, data, resources, resourceSnapshots, collections)
        : ["IMPORTACION_NO_APLICADA"];
      return {
        importacionId: snapshot.id,
        hashPaquete: String(data.hashPaquete ?? ""),
        estado: data.estado === "REVERTIDA" ? "REVERTIDA" : "APLICADA",
        version: Number(data.version ?? 0),
        cantidades: data.cantidades ?? {ubicaciones: 0, lineas: 0, inventariosIniciales: 0},
        escriturasRealizadas: Number(data.escriturasRealizadas ?? 0),
        aplicadaPorUsuarioId: String(data.aplicadaPorUsuarioId ?? ""),
        aplicadaPorNombreVisible: String(data.aplicadaPorNombreVisible ?? ""),
        aplicadaEn: timestampIso(data.aplicadaEn),
        reversionElegible: data.estado === "APLICADA" && blockers.length === 0,
        bloqueosReversion: blockers,
        ...(typeof data.revertidaPorUsuarioId === "string"
          ? {revertidaPorUsuarioId: data.revertidaPorUsuarioId} : {}),
        ...(data.revertidaEn ? {revertidaEn: timestampIso(data.revertidaEn)} : {}),
        ...(typeof data.motivoReversion === "string" ? {motivoReversion: data.motivoReversion} : {})
      };
    }));
    return {importaciones: summaries.sort((left, right) => right.aplicadaEn.localeCompare(left.aplicadaEn))};
  }
}

export class RevertMigrationImportService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: RevertMigrationImportRequest,
    context: TrustedOperationContext
  ): Promise<RevertMigrationImportResult> {
    const ids = idempotencyIds(context.actorId, "REVERTIR_IMPORTACION_MIGRACION", request.claveIdempotencia, {
      importacionId: request.importacionId, versionEsperada: request.versionEsperada, motivo: request.motivo
    });
    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const importRef = this.firestore.collection("importacionesMigracion").doc(request.importacionId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(ids.idempotencyId);
      const [actor, importSnapshot, previous] = await transaction.getAll(actorRef, importRef, idempotencyRef);
      if (!actor || !importSnapshot || !previous) throw domainErrors.internal();
      assertActiveAdmin(actor);
      if (request.motivo.length === 0) throw domainErrors.migrationReversalReasonRequired();
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument<RevertMigrationImportResult>;
        if (stored.payloadHash !== ids.payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      if (!importSnapshot.exists) throw domainErrors.migrationImportNotFound();
      const data = importSnapshot.data() as MigrationImportDocument;
      if (data.estado !== "APLICADA") throw domainErrors.migrationImportNotApplied();
      if (data.version !== request.versionEsperada) throw domainErrors.migrationImportStaleVersion();
      const resources = reversalResources(this.firestore, data);
      if (!resources || resources.references.length === 0) throw domainErrors.migrationReversalBlocked();
      const [resourceSnapshots, collections] = await Promise.all([
        transaction.getAll(...resources.references), transactionReversalCollections(transaction, this.firestore)
      ]);
      const blockers = collectReversalBlockers(request.importacionId, data, resources, resourceSnapshots, collections);
      if (blockers.length > 0) throw domainErrors.migrationReversalBlocked();

      resources.references.forEach((reference) => transaction.delete(reference));
      const now = Timestamp.now();
      const nextVersion = request.versionEsperada + 1;
      const result: RevertMigrationImportResult = {
        importacionId: request.importacionId, hashPaquete: String(data.hashPaquete ?? ""),
        estado: "REVERTIDA", version: nextVersion, documentosEliminados: resources.references.length,
        revertidaPorUsuarioId: context.actorId, revertidaEn: now.toDate().toISOString(), motivo: request.motivo
      };
      transaction.update(importRef, {
        estado: "REVERTIDA", version: nextVersion, revertidaPorUsuarioId: context.actorId,
        revertidaEn: now, motivoReversion: request.motivo
      });
      transaction.create(this.firestore.collection("auditoria").doc(ids.auditId), {
        id: ids.auditId, tipo: "MIGRACION_REVERTIDA", actorUsuarioId: context.actorId,
        recursoTipo: "IMPORTACION_MIGRACION", recursoId: request.importacionId,
        motivo: request.motivo, claveIdempotencia: request.claveIdempotencia, ocurridoEn: now,
        metadatos: {hashPaquete: data.hashPaquete, documentosEliminados: resources.references.length}
      });
      transaction.create(idempotencyRef, {
        id: ids.idempotencyId, actorUsuarioId: context.actorId, operacion: "REVERTIR_IMPORTACION_MIGRACION",
        claveHash: ids.idempotencyId, payloadHash: ids.payloadHash, resultado: result, creadoEn: now
      });
      return result;
    });
  }
}
