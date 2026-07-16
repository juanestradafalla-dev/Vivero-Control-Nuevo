import {createHash} from "node:crypto";

import type {DocumentData, DocumentSnapshot, Firestore, QuerySnapshot} from "firebase-admin/firestore";

import {normalizeCatalogCode} from "./catalog.js";
import type {
  MigrationEntityConflictSummary,
  MigrationPackageInitialInventory,
  MigrationPackageLine,
  MigrationPackageLocation,
  MigrationValidationEntity,
  MigrationValidationIssue,
  MigrationValidationResult,
  TrustedOperationContext
} from "./contracts.js";
import {domainErrors} from "./errors.js";

export const MIGRATION_PACKAGE_FORMAT = "paquete-migracion-catalogo-v1";
export const MIGRATION_PACKAGE_MAX_BYTES = 512_000;
export const MIGRATION_PACKAGE_LIMITS = {locations: 500, lines: 2_000, inventories: 2_000} as const;

type ItemStatus = "NUEVO" | "COINCIDENTE" | "BLOQUEADO";
type UnknownRecord = Record<string, unknown>;

interface ValidatedItem<T> {
  readonly index: number;
  readonly value: T;
  status: ItemStatus;
  currentId?: string;
}

interface CurrentCatalog {
  readonly locations: QuerySnapshot;
  readonly lines: QuerySnapshot;
  readonly inventories: QuerySnapshot;
  readonly occupations: QuerySnapshot;
  readonly journeyLines: QuerySnapshot;
  readonly journeys: QuerySnapshot;
}

interface ValidationState {
  readonly errors: MigrationValidationIssue[];
  readonly warnings: MigrationValidationIssue[];
  existingCodes: number;
  incompatibleKeys: number;
  currentInventories: number;
  operationalConflicts: number;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeExternalKey(value: string): string {
  return value.trim().normalize("NFKC").toUpperCase();
}

function normalizeText(value: string): string {
  return value.trim().normalize("NFKC");
}

function normalizeForHash(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry)).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((entryKey) => [
      entryKey,
      normalizeForHash(value[entryKey], entryKey)
    ]));
  }
  if (typeof value !== "string") return value;
  if (key === "codigo") return normalizeCatalogCode(value);
  if (key.includes("ClaveExterna") || key === "claveExterna") return normalizeExternalKey(value);
  return normalizeText(value);
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

export function deterministicMigrationPackageHash(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}

export function migrationPackageExceedsSizeLimit(value: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > MIGRATION_PACKAGE_MAX_BYTES;
}

function containsPrivateData(value: unknown): boolean {
  const strings: string[] = [];
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") strings.push(candidate);
    else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (isRecord(candidate)) Object.values(candidate).forEach(visit);
  };
  visit(value);
  const joined = strings.join("\n");
  return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(joined) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(joined) ||
    /\bAIza[0-9A-Za-z_-]{30,}\b/.test(joined) ||
    /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/.test(joined) ||
    /\b(?:CONTRASE[NÑ]A|PASSWORD|TOKEN|SECRETO|SECRET|CREDENTIAL|PRIVATE[ _-]?KEY|API[ _-]?KEY)\b/i.test(joined);
}

function isFictitiousReference(value: string): boolean {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /(PRUEBA|FICTICI|EMULADOR|SIMULAD)/.test(normalized);
}

function issue(
  state: ValidationState,
  severity: "ERROR" | "ADVERTENCIA",
  code: string,
  entity: MigrationValidationEntity,
  externalKey: string | null,
  message: string
): void {
  const value: MigrationValidationIssue = {
    codigo: code,
    severidad: severity,
    entidad: entity,
    claveExterna: externalKey,
    mensaje: message
  };
  (severity === "ERROR" ? state.errors : state.warnings).push(value);
}

function rejectAdditionalFields(
  state: ValidationState,
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
  entity: MigrationValidationEntity,
  externalKey: string | null
): boolean {
  const extras = Object.keys(record).filter((field) => !allowed.has(field));
  extras.forEach((field) => issue(
    state, "ERROR", "CAMPO_ADICIONAL", entity, externalKey, `El campo ${field} no pertenece al formato v1.`
  ));
  return extras.length > 0;
}

function requiredText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

function validExternalKey(value: unknown): value is string {
  return requiredText(value, 128) && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validOrder(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function statusSummary(items: readonly {status: ItemStatus}[]): MigrationEntityConflictSummary {
  return {
    nuevos: items.filter((item) => item.status === "NUEVO").length,
    coincidentes: items.filter((item) => item.status === "COINCIDENTE").length,
    bloqueados: items.filter((item) => item.status === "BLOQUEADO").length
  };
}

function block<T>(item: ValidatedItem<T> | undefined): void {
  if (item) item.status = "BLOQUEADO";
}

function assertActiveAdmin(snapshot: DocumentSnapshot): void {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const actor = snapshot.data() as DocumentData;
  if (actor.activo !== true) throw domainErrors.userInactive();
  if (!Array.isArray(actor.roles) || !actor.roles.includes("ADMINISTRADOR")) {
    throw domainErrors.permissionDenied();
  }
}

function validateLocations(
  raw: readonly unknown[],
  state: ValidationState
): ValidatedItem<MigrationPackageLocation>[] {
  const items: ValidatedItem<MigrationPackageLocation>[] = [];
  const keys = new Map<string, ValidatedItem<MigrationPackageLocation>>();
  const codes = new Map<string, ValidatedItem<MigrationPackageLocation>>();
  raw.forEach((candidate, index) => {
    const externalKey = isRecord(candidate) && typeof candidate.claveExterna === "string"
      ? candidate.claveExterna : null;
    if (!isRecord(candidate)) {
      issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "UBICACION", null, "La ubicación debe ser un objeto.");
      return;
    }
    const extra = rejectAdditionalFields(state, candidate, new Set([
      "claveExterna", "ubicacionPadreClaveExterna", "codigo", "tipo", "nombreVisible", "orden", "activa"
    ]), "UBICACION", externalKey);
    if (
      !validExternalKey(candidate.claveExterna) ||
      !(candidate.ubicacionPadreClaveExterna === null || validExternalKey(candidate.ubicacionPadreClaveExterna)) ||
      !requiredText(candidate.codigo, 120) || !requiredText(candidate.tipo, 80) ||
      !requiredText(candidate.nombreVisible, 240) || !validOrder(candidate.orden) ||
      typeof candidate.activa !== "boolean"
    ) {
      issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "UBICACION", externalKey, "La ubicación tiene campos inválidos.");
      return;
    }
    const value: MigrationPackageLocation = {
      claveExterna: normalizeExternalKey(candidate.claveExterna),
      ubicacionPadreClaveExterna: candidate.ubicacionPadreClaveExterna === null
        ? null : normalizeExternalKey(candidate.ubicacionPadreClaveExterna),
      codigo: normalizeCatalogCode(candidate.codigo),
      tipo: normalizeText(candidate.tipo),
      nombreVisible: normalizeText(candidate.nombreVisible),
      orden: candidate.orden,
      activa: candidate.activa
    };
    const item: ValidatedItem<MigrationPackageLocation> = {index, value, status: extra ? "BLOQUEADO" : "NUEVO"};
    items.push(item);
    const duplicateKey = keys.get(value.claveExterna);
    if (duplicateKey) {
      block(item); block(duplicateKey);
      issue(state, "ERROR", "CLAVE_EXTERNA_DUPLICADA", "UBICACION", value.claveExterna, "La clave externa está repetida.");
    } else keys.set(value.claveExterna, item);
    const codeScope = `${value.ubicacionPadreClaveExterna ?? "ROOT"}:${value.codigo}`;
    const duplicateCode = codes.get(codeScope);
    if (duplicateCode) {
      block(item); block(duplicateCode);
      issue(state, "ERROR", "CODIGO_DUPLICADO", "UBICACION", value.claveExterna, "El código se repite entre ubicaciones hermanas.");
    } else codes.set(codeScope, item);
  });

  const byKey = new Map(items.map((item) => [item.value.claveExterna, item]));
  for (const item of items) {
    const parent = item.value.ubicacionPadreClaveExterna;
    if (parent !== null && !byKey.has(parent)) {
      block(item);
      issue(state, "ERROR", "REFERENCIA_PADRE_INEXISTENTE", "UBICACION", item.value.claveExterna,
        "La ubicación padre no existe dentro del paquete.");
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (item: ValidatedItem<MigrationPackageLocation>): void => {
    const key = item.value.claveExterna;
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      block(item);
      issue(state, "ERROR", "CICLO_UBICACIONES", "UBICACION", key, "El árbol de ubicaciones contiene un ciclo.");
      return;
    }
    visiting.add(key);
    const parent = item.value.ubicacionPadreClaveExterna;
    const parentItem = parent === null ? undefined : byKey.get(parent);
    if (parentItem) visit(parentItem);
    visiting.delete(key);
    visited.add(key);
  };
  items.forEach(visit);
  return items;
}

function validateLines(
  raw: readonly unknown[],
  locations: readonly ValidatedItem<MigrationPackageLocation>[],
  state: ValidationState
): ValidatedItem<MigrationPackageLine>[] {
  const items: ValidatedItem<MigrationPackageLine>[] = [];
  const locationKeys = new Set(locations.map((item) => item.value.claveExterna));
  const keys = new Map<string, ValidatedItem<MigrationPackageLine>>();
  const codes = new Map<string, ValidatedItem<MigrationPackageLine>>();
  raw.forEach((candidate, index) => {
    const externalKey = isRecord(candidate) && typeof candidate.claveExterna === "string"
      ? candidate.claveExterna : null;
    if (!isRecord(candidate)) {
      issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "LINEA", null, "La línea debe ser un objeto.");
      return;
    }
    const extra = rejectAdditionalFields(state, candidate, new Set([
      "claveExterna", "ubicacionClaveExterna", "codigo", "nombreVisible", "orden", "activa"
    ]), "LINEA", externalKey);
    if (
      !validExternalKey(candidate.claveExterna) || !validExternalKey(candidate.ubicacionClaveExterna) ||
      !requiredText(candidate.codigo, 120) || !requiredText(candidate.nombreVisible, 240) ||
      !validOrder(candidate.orden) || typeof candidate.activa !== "boolean"
    ) {
      issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "LINEA", externalKey, "La línea tiene campos inválidos.");
      return;
    }
    const value: MigrationPackageLine = {
      claveExterna: normalizeExternalKey(candidate.claveExterna),
      ubicacionClaveExterna: normalizeExternalKey(candidate.ubicacionClaveExterna),
      codigo: normalizeCatalogCode(candidate.codigo),
      nombreVisible: normalizeText(candidate.nombreVisible),
      orden: candidate.orden,
      activa: candidate.activa
    };
    const item: ValidatedItem<MigrationPackageLine> = {index, value, status: extra ? "BLOQUEADO" : "NUEVO"};
    items.push(item);
    const duplicateKey = keys.get(value.claveExterna);
    if (duplicateKey) {
      block(item); block(duplicateKey);
      issue(state, "ERROR", "CLAVE_EXTERNA_DUPLICADA", "LINEA", value.claveExterna, "La clave externa está repetida.");
    } else keys.set(value.claveExterna, item);
    const scope = `${value.ubicacionClaveExterna}:${value.codigo}`;
    const duplicateCode = codes.get(scope);
    if (duplicateCode) {
      block(item); block(duplicateCode);
      issue(state, "ERROR", "CODIGO_DUPLICADO", "LINEA", value.claveExterna, "El código se repite dentro de la ubicación.");
    } else codes.set(scope, item);
    if (!locationKeys.has(value.ubicacionClaveExterna)) {
      block(item);
      issue(state, "ERROR", "UBICACION_LINEA_INEXISTENTE", "LINEA", value.claveExterna,
        "La línea referencia una ubicación que no existe en el paquete.");
    }
  });
  return items;
}

function validateInventories(
  raw: readonly unknown[],
  lines: readonly ValidatedItem<MigrationPackageLine>[],
  state: ValidationState
): ValidatedItem<MigrationPackageInitialInventory>[] {
  const items: ValidatedItem<MigrationPackageInitialInventory>[] = [];
  const lineKeys = new Set(lines.map((item) => item.value.claveExterna));
  const inventoriesByLine = new Map<string, ValidatedItem<MigrationPackageInitialInventory>>();
  raw.forEach((candidate, index) => {
    const externalKey = isRecord(candidate) && typeof candidate.lineaClaveExterna === "string"
      ? candidate.lineaClaveExterna : null;
    if (!isRecord(candidate)) {
      issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "INVENTARIO_INICIAL", null,
        "El inventario inicial debe ser un objeto.");
      return;
    }
    const extra = rejectAdditionalFields(state, candidate, new Set([
      "lineaClaveExterna", "hembras", "machos", "patrones", "referenciaFuente"
    ]), "INVENTARIO_INICIAL", externalKey);
    if (!validExternalKey(candidate.lineaClaveExterna) || !requiredText(candidate.referenciaFuente, 500)) {
      issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "INVENTARIO_INICIAL", externalKey,
        "El inventario inicial tiene campos inválidos.");
      return;
    }
    const quantities = [candidate.hembras, candidate.machos, candidate.patrones];
    if (quantities.some((quantity) => !Number.isSafeInteger(quantity) || (quantity as number) < 0)) {
      issue(state, "ERROR", "CANTIDAD_INVALIDA", "INVENTARIO_INICIAL", externalKey,
        "Las cantidades deben ser enteros no negativos dentro del rango seguro.");
      return;
    }
    const total = (candidate.hembras as number) + (candidate.machos as number) + (candidate.patrones as number);
    const value: MigrationPackageInitialInventory = {
      lineaClaveExterna: normalizeExternalKey(candidate.lineaClaveExterna),
      hembras: candidate.hembras as number,
      machos: candidate.machos as number,
      patrones: candidate.patrones as number,
      referenciaFuente: normalizeText(candidate.referenciaFuente)
    };
    const item: ValidatedItem<MigrationPackageInitialInventory> = {index, value, status: extra ? "BLOQUEADO" : "NUEVO"};
    items.push(item);
    if (!Number.isSafeInteger(total)) {
      block(item);
      issue(state, "ERROR", "DESBORDAMIENTO_TOTAL", "INVENTARIO_INICIAL", value.lineaClaveExterna,
        "La suma del inventario excede el rango seguro.");
    } else if (total === 0) {
      block(item);
      issue(state, "ERROR", "TOTAL_CERO", "INVENTARIO_INICIAL", value.lineaClaveExterna,
        "El inventario inicial total cero permanece bloqueado.");
    }
    if (!isFictitiousReference(value.referenciaFuente)) {
      block(item);
      issue(state, "ERROR", "REFERENCIA_NO_FICTICIA", "INVENTARIO_INICIAL", value.lineaClaveExterna,
        "La fuente debe indicar claramente que es ficticia o de prueba.");
    }
    const duplicate = inventoriesByLine.get(value.lineaClaveExterna);
    if (duplicate) {
      block(item); block(duplicate);
      issue(state, "ERROR", "INVENTARIO_DUPLICADO", "INVENTARIO_INICIAL", value.lineaClaveExterna,
        "Solo puede existir un inventario inicial por línea.");
    } else inventoriesByLine.set(value.lineaClaveExterna, item);
    if (!lineKeys.has(value.lineaClaveExterna)) {
      block(item);
      issue(state, "ERROR", "LINEA_INVENTARIO_INEXISTENTE", "INVENTARIO_INICIAL", value.lineaClaveExterna,
        "El inventario referencia una línea que no existe en el paquete.");
    }
  });
  const inventoryKeys = new Set(items.map((item) => item.value.lineaClaveExterna));
  lines.filter((item) => item.value.activa && !inventoryKeys.has(item.value.claveExterna)).forEach((item) => {
    block(item);
    issue(state, "ERROR", "LINEA_ACTIVA_SIN_INVENTARIO", "LINEA", item.value.claveExterna,
      "Toda línea activa debe incluir inventario inicial en el paquete.");
  });
  return items;
}

function compareWithCurrentCatalog(
  locations: ValidatedItem<MigrationPackageLocation>[],
  lines: ValidatedItem<MigrationPackageLine>[],
  inventories: ValidatedItem<MigrationPackageInitialInventory>[],
  current: CurrentCatalog,
  state: ValidationState
): void {
  const currentLocations: Array<DocumentData & {id: string}> = current.locations.docs.map((snapshot) => ({
    id: snapshot.id, ...(snapshot.data() as DocumentData)
  }));
  const currentLines: Array<DocumentData & {id: string}> = current.lines.docs.map((snapshot) => ({
    id: snapshot.id, ...(snapshot.data() as DocumentData)
  }));
  const locationByExternalKey = new Map(currentLocations
    .filter((value) => typeof value.claveExterna === "string")
    .map((value) => [normalizeExternalKey(value.claveExterna as string), value]));
  const lineByExternalKey = new Map(currentLines
    .filter((value) => typeof value.claveExterna === "string")
    .map((value) => [normalizeExternalKey(value.claveExterna as string), value]));

  const pending = new Set(locations);
  let progressed = true;
  while (progressed && pending.size > 0) {
    progressed = false;
    for (const item of [...pending]) {
      const parentKey = item.value.ubicacionPadreClaveExterna;
      const parentItem = parentKey === null ? undefined : locations.find((candidate) => candidate.value.claveExterna === parentKey);
      if (parentItem && parentItem.currentId === undefined) {
        if (parentItem.status === "NUEVO") {
          pending.delete(item);
          progressed = true;
        }
        continue;
      }
      const expectedParentId = parentKey === null ? null : parentItem?.currentId;
      const keyed = locationByExternalKey.get(item.value.claveExterna);
      const byCode = currentLocations.find((candidate) =>
        (candidate.ubicacionPadreId ?? null) === expectedParentId &&
        normalizeCatalogCode(String(candidate.codigoNormalizado ?? candidate.codigo ?? "")) === item.value.codigo
      );
      const match = keyed ?? byCode;
      if (match) {
        state.existingCodes += byCode ? 1 : 0;
        const compatible = normalizeCatalogCode(String(match.codigoNormalizado ?? match.codigo ?? "")) === item.value.codigo &&
          (match.ubicacionPadreId ?? null) === expectedParentId && String(match.tipo ?? "") === item.value.tipo;
        if (!compatible) {
          block(item);
          state.incompatibleKeys += 1;
          issue(state, "ERROR", "CLAVE_INCOMPATIBLE", "UBICACION", item.value.claveExterna,
            "La clave externa coincide con una ubicación de estructura incompatible.");
        } else {
          item.currentId = match.id;
          if (item.status !== "BLOQUEADO") item.status = "COINCIDENTE";
          issue(state, "ADVERTENCIA", "CODIGO_EXISTENTE", "UBICACION", item.value.claveExterna,
            "El código ya existe y coincide con una ubicación del emulador.");
        }
      }
      pending.delete(item);
      progressed = true;
    }
  }

  for (const item of lines) {
    const location = locations.find((candidate) => candidate.value.claveExterna === item.value.ubicacionClaveExterna);
    const currentLocationId = location?.currentId;
    const keyed = lineByExternalKey.get(item.value.claveExterna);
    const byCode = currentLocationId === undefined ? undefined : currentLines.find((candidate) =>
      candidate.ubicacionId === currentLocationId &&
      normalizeCatalogCode(String(candidate.codigoNormalizado ?? candidate.codigo ?? "")) === item.value.codigo
    );
    const match = keyed ?? byCode;
    if (!match) continue;
    state.existingCodes += byCode ? 1 : 0;
    const compatible = currentLocationId !== undefined && match.ubicacionId === currentLocationId &&
      normalizeCatalogCode(String(match.codigoNormalizado ?? match.codigo ?? "")) === item.value.codigo;
    if (!compatible) {
      block(item);
      state.incompatibleKeys += 1;
      issue(state, "ERROR", "CLAVE_INCOMPATIBLE", "LINEA", item.value.claveExterna,
        "La clave externa coincide con una línea de ubicación o código incompatible.");
    } else {
      item.currentId = match.id;
      if (item.status !== "BLOQUEADO") item.status = "COINCIDENTE";
      issue(state, "ADVERTENCIA", "CODIGO_EXISTENTE", "LINEA", item.value.claveExterna,
        "El código ya existe y coincide con una línea del emulador.");
    }
  }

  const inventoryLineIds = new Set(current.inventories.docs.map((snapshot) =>
    typeof snapshot.data().lineaId === "string" ? snapshot.data().lineaId as string : snapshot.id
  ));
  const activeJourneyIds = new Set(current.journeys.docs
    .filter((snapshot) => snapshot.data().estadoAdministrativo === "ACTIVA").map((snapshot) => snapshot.id));
  const activeLineIds = new Set(current.occupations.docs.map((snapshot) => snapshot.id));
  current.journeyLines.docs.forEach((snapshot) => {
    const data = snapshot.data();
    if (data.activa === true && activeJourneyIds.has(data.jornadaId) && typeof data.lineaId === "string") {
      activeLineIds.add(data.lineaId);
    }
  });
  for (const line of lines) {
    if (!line.currentId) continue;
    const inventory = inventories.find((candidate) => candidate.value.lineaClaveExterna === line.value.claveExterna);
    if (inventoryLineIds.has(line.currentId)) {
      block(line); block(inventory);
      state.currentInventories += 1;
      issue(state, "ERROR", "INVENTARIO_EXISTENTE", "LINEA", line.value.claveExterna,
        "La línea ya tiene inventario oficial en el emulador.");
    }
    if (activeLineIds.has(line.currentId)) {
      block(line); block(inventory);
      state.operationalConflicts += 1;
      issue(state, "ERROR", "CONFLICTO_OPERATIVO", "LINEA", line.value.claveExterna,
        "La línea está ocupada o pertenece a una jornada activa.");
    }
  }
}

function emptyState(): ValidationState {
  return {
    errors: [], warnings: [], existingCodes: 0, incompatibleKeys: 0,
    currentInventories: 0, operationalConflicts: 0
  };
}

export function validateMigrationPackage(
  payload: unknown,
  current: CurrentCatalog
): MigrationValidationResult {
  const state = emptyState();
  const privateDataDetected = containsPrivateData(payload);
  if (migrationPackageExceedsSizeLimit(payload)) {
    issue(state, "ERROR", "TAMANO_EXCEDIDO", "PAQUETE", null,
      `El paquete supera el máximo técnico de ${MIGRATION_PACKAGE_MAX_BYTES} bytes.`);
  }
  if (privateDataDetected) {
    issue(state, "ERROR", "SECRETO_O_DATO_PRIVADO", "PAQUETE", null,
      "El paquete contiene un correo, secreto, credencial o dato privado prohibido.");
  }
  if (!isRecord(payload)) {
    issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "PAQUETE", null, "El paquete debe ser un objeto JSON.");
  }
  const root = isRecord(payload) ? payload : {};
  rejectAdditionalFields(state, root, new Set([
    "formato", "metadatos", "ubicaciones", "lineas", "inventariosIniciales"
  ]), "PAQUETE", null);
  if (root.formato !== MIGRATION_PACKAGE_FORMAT) {
    issue(state, "ERROR", "FORMATO_DESCONOCIDO", "PAQUETE", null,
      "El formato debe ser paquete-migracion-catalogo-v1.");
  }
  if (!isRecord(root.metadatos)) {
    issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "PAQUETE", null, "Los metadatos son obligatorios.");
  } else {
    rejectAdditionalFields(state, root.metadatos, new Set([
      "nombrePaquete", "creadoEn", "referenciaFuente"
    ]), "PAQUETE", null);
    if (
      !requiredText(root.metadatos.nombrePaquete, 240) || !requiredText(root.metadatos.referenciaFuente, 500) ||
      typeof root.metadatos.creadoEn !== "string" || Number.isNaN(Date.parse(root.metadatos.creadoEn))
    ) {
      issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "PAQUETE", null, "Los metadatos no son válidos.");
    }
    if (typeof root.metadatos.referenciaFuente === "string" &&
        !isFictitiousReference(root.metadatos.referenciaFuente)) {
      issue(state, "ERROR", "REFERENCIA_NO_FICTICIA", "PAQUETE", null,
        "La referencia general debe identificar datos ficticios o de prueba.");
    }
  }
  const rawLocations = Array.isArray(root.ubicaciones) ? root.ubicaciones : [];
  const rawLines = Array.isArray(root.lineas) ? root.lineas : [];
  const rawInventories = Array.isArray(root.inventariosIniciales) ? root.inventariosIniciales : [];
  if (!Array.isArray(root.ubicaciones) || !Array.isArray(root.lineas) || !Array.isArray(root.inventariosIniciales)) {
    issue(state, "ERROR", "ESTRUCTURA_INVALIDA", "PAQUETE", null,
      "Ubicaciones, líneas e inventariosIniciales deben ser arreglos.");
  }
  if (
    rawLocations.length > MIGRATION_PACKAGE_LIMITS.locations ||
    rawLines.length > MIGRATION_PACKAGE_LIMITS.lines ||
    rawInventories.length > MIGRATION_PACKAGE_LIMITS.inventories
  ) {
    issue(state, "ERROR", "LIMITE_ENTIDADES", "PAQUETE", null,
      "El paquete supera los máximos de 500 ubicaciones, 2.000 líneas o 2.000 inventarios.");
  }

  const locations = validateLocations(rawLocations, state);
  const lines = validateLines(rawLines, locations, state);
  const locationsByKey = new Map(locations.map((item) => [item.value.claveExterna, item]));
  for (const line of lines) {
    const location = locationsByKey.get(line.value.claveExterna);
    if (!location) continue;
    block(location); block(line);
    issue(state, "ERROR", "CLAVE_EXTERNA_DUPLICADA", "LINEA", line.value.claveExterna,
      "La clave externa debe ser única también entre ubicaciones y líneas.");
  }
  const inventories = validateInventories(rawInventories, lines, state);
  compareWithCurrentCatalog(locations, lines, inventories, current, state);

  const redactKeys = (issues: readonly MigrationValidationIssue[]): MigrationValidationIssue[] =>
    issues.map((entry) => privateDataDetected ? {...entry, claveExterna: null} : entry);

  return {
    formato: typeof root.formato === "string" ? root.formato : "DESCONOCIDO",
    hashPaquete: deterministicMigrationPackageHash(payload),
    cantidades: {
      ubicaciones: rawLocations.length,
      lineas: rawLines.length,
      inventariosIniciales: rawInventories.length
    },
    erroresBloqueantes: redactKeys(state.errors),
    advertencias: redactKeys(state.warnings),
    resumenConflictos: {
      ubicaciones: statusSummary(locations),
      lineas: statusSummary(lines),
      inventariosIniciales: statusSummary(inventories),
      codigosExistentes: state.existingCodes,
      clavesIncompatibles: state.incompatibleKeys,
      lineasConInventarioActual: state.currentInventories,
      conflictosOperativos: state.operationalConflicts
    },
    aptoParaImportar: state.errors.length === 0,
    soloValidacion: true
  };
}

export class ValidateMigrationPackageService {
  constructor(private readonly firestore: Firestore) {}

  async execute(payload: unknown, context: TrustedOperationContext): Promise<MigrationValidationResult> {
    const [actor, locations, lines, inventories, occupations, journeyLines, journeys] = await Promise.all([
      this.firestore.collection("usuarios").doc(context.actorId).get(),
      this.firestore.collection("ubicaciones").get(),
      this.firestore.collection("lineas").get(),
      this.firestore.collection("inventarioOficialLineas").get(),
      this.firestore.collection("ocupacionesLineasActivas").get(),
      this.firestore.collection("jornadaLineas").get(),
      this.firestore.collection("jornadas").get()
    ]);
    assertActiveAdmin(actor);
    return validateMigrationPackage(payload, {locations, lines, inventories, occupations, journeyLines, journeys});
  }
}
