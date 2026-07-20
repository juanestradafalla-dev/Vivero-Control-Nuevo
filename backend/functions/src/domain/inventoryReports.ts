import {createHash, randomUUID} from "node:crypto";

import ExcelJS from "exceljs";
import {FieldValue, Timestamp, type DocumentSnapshot, type Firestore} from "firebase-admin/firestore";

import type {
  InventoryDeadPlantsSource,
  InventoryReportStatus,
  InventoryReportSummary,
  ListInventoryReportsResult,
  RetryInventoryReportRequest,
  RetryInventoryReportResult,
  TrustedOperationContext,
  VisibleLocation
} from "./contracts.js";
import {domainErrors} from "./errors.js";
import {
  createInventoryReportDriveGatewayFromEnvironment,
  InventoryReportDriveConfigurationError,
  type InventoryReportDriveGateway
} from "./inventoryReportDrive.js";

const REPORT_STATUSES = new Set<InventoryReportStatus>([
  "PENDIENTE", "PROCESANDO", "COMPLETADO", "ERROR_REINTENTABLE", "ERROR_PERMANENTE"
]);
const EXPECTED_SHEETS = ["MODULO 1", "MODULO 2", "MODULO 3", "MODULO 4", "MODULO 5"] as const;
const REQUIRED_HEADERS = [
  "FECHA", "CAMA", "LINEA", "PLANTAS PATRON", "PLANTAS HEMBRAS",
  "PLANTAS MACHOS", "PLANTAS MUERTAS", "OBSERVACIONES"
] as const;
type RequiredHeader = typeof REQUIRED_HEADERS[number];
const HEADER_ALIASES = new Map<string, RequiredHeader>([
  ["FECHA", "FECHA"],
  ["CAMA", "CAMA"],
  ["LINEA", "LINEA"],
  ["PLANTAS PATRON", "PLANTAS PATRON"],
  ["PLANTAS PATRONES", "PLANTAS PATRON"],
  ["PATRONES", "PLANTAS PATRON"],
  ["PLANTAS HEMBRAS", "PLANTAS HEMBRAS"],
  ["HEMBRAS", "PLANTAS HEMBRAS"],
  ["PLANTAS MACHOS", "PLANTAS MACHOS"],
  ["MACHOS", "PLANTAS MACHOS"],
  ["PLANTAS MUERTAS", "PLANTAS MUERTAS"],
  ["OBSERVACIONES", "OBSERVACIONES"]
]);
const MONTHS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
] as const;
const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const INVENTORY_REPORT_MAX_LINES = 400;

interface MappedTemplateCell {
  readonly cell: ExcelJS.Cell;
  readonly value: ExcelJS.CellValue;
}

interface MappedTemplateRow {
  readonly cells: readonly MappedTemplateCell[];
}

interface WorksheetFormulaLayout {
  readonly headerRow: number;
  readonly columns: ReadonlyMap<string, number>;
  readonly mappedRows: ReadonlySet<number>;
}

interface UserDocument {
  readonly activo?: boolean;
  readonly roles?: unknown;
}

export interface InventoryReportLineSnapshot {
  readonly jornadaLineaId: string;
  readonly lineaId: string;
  readonly conteoId: string;
  readonly ubicacion: VisibleLocation;
  readonly hembras: number;
  readonly machos: number;
  readonly patrones: number;
  readonly total: number;
  readonly plantasMuertas: number;
  readonly conteoRecibidoEn: string;
  readonly observaciones?: string;
}

export interface InventoryReportDocument {
  readonly id: string;
  readonly jornadaId: string;
  readonly jornadaNombreVisible: string;
  readonly creadorJornadaUsuarioId: string;
  readonly solicitadoPorUsuarioId: string;
  readonly responsableUsuarioId: string;
  readonly responsableNombreVisible: string;
  readonly estado: InventoryReportStatus;
  readonly mes: number;
  readonly anio: number;
  readonly fuentePlantasMuertas: InventoryDeadPlantsSource;
  readonly versionJornadaCierre: number;
  readonly activadaEn: Timestamp;
  readonly cerradaEn: Timestamp;
  readonly lineas: readonly InventoryReportLineSnapshot[];
  readonly intentos: number;
  readonly procesamientoId?: string;
  readonly procesandoEn?: Timestamp;
  readonly archivoNombre?: string;
  readonly archivoDriveId?: string;
  readonly archivoEnlace?: string;
  readonly hashContenido?: string;
  readonly errorCodigo?: string;
  readonly errorMensaje?: string;
  readonly creadoEn: Timestamp;
  readonly actualizadoEn: Timestamp;
  readonly finalizadoEn?: Timestamp;
}

interface ClaimedReport {
  readonly reportId: string;
  readonly report: InventoryReportDocument;
  readonly processingId: string;
}

function validateReportForProcessing(reportId: string, report: InventoryReportDocument): void {
  if (
    report.id !== reportId || report.jornadaId !== reportId ||
    typeof report.jornadaNombreVisible !== "string" || report.jornadaNombreVisible === "" ||
    typeof report.responsableNombreVisible !== "string" || report.responsableNombreVisible === "" ||
    !(report.activadaEn instanceof Timestamp) || !(report.cerradaEn instanceof Timestamp) ||
    report.activadaEn.toMillis() > report.cerradaEn.toMillis() ||
    !Array.isArray(report.lineas) || report.lineas.length === 0 ||
    report.lineas.length > INVENTORY_REPORT_MAX_LINES ||
    !Number.isSafeInteger(report.mes) || report.mes < 1 || report.mes > 12 ||
    !Number.isSafeInteger(report.anio) || report.anio < 2000 || report.anio > 2100 ||
    (report.fuentePlantasMuertas !== "CONTEO_FISICO" &&
      report.fuentePlantasMuertas !== "DESCARTES_APROBADOS")
  ) {
    throw new InventoryReportPermanentError(
      "INFORME_DOCUMENTO_INVALIDO",
      "El trabajo de informe no contiene una fotografia central valida."
    );
  }
}

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

export class InventoryReportPermanentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "InventoryReportPermanentError";
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, " ").trim().replace(/\s+/gu, " ").toUpperCase();
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.master.text;
}

function canonicalModule(value: unknown): string | undefined {
  const normalized = normalizedText(value);
  const match = normalized.match(/^(?:(?:MODULO|M) ?)?([1-5])$/u);
  return match ? `MODULO ${match[1]}` : undefined;
}

function locationKey(moduleName: unknown, bed: unknown, line: unknown): string | undefined {
  const moduleCanonical = canonicalModule(moduleName);
  const bedCanonical = normalizedText(bed);
  const lineCanonical = normalizedText(line);
  if (!moduleCanonical || !bedCanonical || !lineCanonical) return undefined;
  return `${moduleCanonical}\u0000${bedCanonical}\u0000${lineCanonical}`;
}

function headersFor(worksheet: ExcelJS.Worksheet): {rowNumber: number; columns: Map<string, number>} {
  const upperLimit = Math.min(Math.max(worksheet.rowCount, 1), 50);
  for (let rowNumber = 1; rowNumber <= upperLimit; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = new Map<string, number>();
    row.eachCell({includeEmpty: false}, (cell, columnNumber) => {
      const header = HEADER_ALIASES.get(normalizedText(cellText(cell)));
      if (header !== undefined) {
        if (columns.has(header)) {
          throw new InventoryReportPermanentError(
            "PLANTILLA_ENCABEZADO_DUPLICADO",
            `La hoja ${worksheet.name} repite el encabezado ${header}.`
          );
        }
        columns.set(header, columnNumber);
      }
    });
    if (REQUIRED_HEADERS.every((header) => columns.has(header))) return {rowNumber, columns};
  }
  throw new InventoryReportPermanentError(
    "PLANTILLA_ENCABEZADOS_INCOMPLETOS",
    `La hoja ${worksheet.name} no contiene todos los encabezados requeridos.`
  );
}

function targetColumn(columns: ReadonlyMap<string, number>, header: RequiredHeader): number {
  const column = columns.get(header);
  if (column === undefined) throw new InventoryReportPermanentError("PLANTILLA_INVALIDA", "Falta una columna.");
  return column;
}

function headerValueCell(row: ExcelJS.Row, labelCell: ExcelJS.Cell, columnNumber: number): ExcelJS.Cell {
  const labelMasterAddress = labelCell.master.address;
  for (let offset = 1; offset <= 12; offset += 1) {
    const candidate = row.getCell(columnNumber + offset);
    if (candidate.master.address !== labelMasterAddress) return candidate.master;
  }
  throw new InventoryReportPermanentError(
    "PLANTILLA_ENCABEZADO_GENERAL_INVALIDO",
    "No existe una celda de valor junto a una etiqueta del encabezado."
  );
}

function fillWorksheetHeader(
  worksheet: ExcelJS.Worksheet,
  sheetName: string,
  report: Pick<InventoryReportDocument, "activadaEn" | "cerradaEn" | "responsableNombreVisible">
): void {
  const values = new Map<string, ExcelJS.CellValue>([
    ["MODULO", sheetName],
    ["FECHA INICIAL", bogotaDate(report.activadaEn.toDate().toISOString())],
    ["FECHA INICIO", bogotaDate(report.activadaEn.toDate().toISOString())],
    ["FECHA FINAL", bogotaDate(report.cerradaEn.toDate().toISOString())],
    ["RESPONSABLE", report.responsableNombreVisible]
  ]);
  const found = new Set<string>();
  worksheet.eachRow({includeEmpty: false}, (row) => {
    row.eachCell({includeEmpty: false}, (cell, columnNumber) => {
      const label = normalizedText(cellText(cell));
      const value = values.get(label);
      if (value === undefined || found.has(label)) return;
      headerValueCell(row, cell, columnNumber).value = value;
      found.add(label);
    });
  });
  const missing = [
    ...(found.has("MODULO") ? [] : ["MODULO"]),
    ...(found.has("FECHA INICIAL") || found.has("FECHA INICIO") ? [] : ["FECHA INICIAL/FECHA INICIO"]),
    ...(found.has("FECHA FINAL") ? [] : ["FECHA FINAL"])
  ];
  if (missing.length > 0) {
    throw new InventoryReportPermanentError(
      "PLANTILLA_ENCABEZADO_GENERAL_INCOMPLETO",
      `La hoja ${worksheet.name} no contiene ${missing.join(", ")}.`
    );
  }
}

function replaceMappedDataCells(mappedRows: readonly MappedTemplateRow[]): void {
  for (const {cells} of mappedRows) {
    for (const {cell} of cells) cell.value = null;
  }
  for (const {cells} of mappedRows) {
    for (const {cell, value} of cells) cell.value = value;
  }
  for (const {cells} of mappedRows) {
    for (const {cell} of cells) {
      if (cell.formula) {
        throw new InventoryReportPermanentError(
          "PLANTILLA_CELDA_DATOS_CON_FORMULA",
          `La celda ${cell.worksheet.name}!${cell.address} conserva una formula despues del mapeo.`
        );
      }
    }
  }
}

function containsBrokenReference(workbook: ExcelJS.Workbook, removedSheetNames: readonly string[]): boolean {
  let broken = false;
  const removedPatterns = removedSheetNames.map((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(?:'${escaped}'|${escaped})!`, "iu");
  });
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({includeEmpty: false}, (row) => {
      row.eachCell({includeEmpty: false}, (cell) => {
        const formula = cell.formula;
        const value = cell.value as unknown;
        const result = typeof value === "object" && value !== null && "result" in value
          ? (value as {result?: unknown}).result
          : undefined;
        if (
          (typeof formula === "string" && formula.toUpperCase().includes("#REF!")) ||
          (typeof formula === "string" && removedPatterns.some((pattern) => pattern.test(formula))) ||
          (typeof result === "string" && result.toUpperCase().includes("#REF!")) ||
          (typeof value === "object" && value !== null && "error" in value &&
            String((value as {error?: unknown}).error).toUpperCase().includes("#REF!"))
        ) broken = true;
      });
    });
  }
  return broken;
}

function totalColumnFor(worksheet: ExcelJS.Worksheet, headerRow: number): number | undefined {
  const matches: number[] = [];
  worksheet.getRow(headerRow).eachCell({includeEmpty: false}, (cell, columnNumber) => {
    if (normalizedText(cellText(cell)) === "TOTAL VIVAS") matches.push(columnNumber);
  });
  if (matches.length > 1) {
    throw new InventoryReportPermanentError(
      "PLANTILLA_ENCABEZADO_DUPLICADO",
      `La hoja ${worksheet.name} repite el encabezado TOTAL VIVAS.`
    );
  }
  return matches[0];
}

interface SumFormulaRange {
  readonly startColumn: string;
  readonly startRow: number;
  readonly endColumn: string;
  readonly endRow: number;
}

function sumFormulaRange(formula: string): SumFormulaRange | undefined {
  const normalized = formula.replace(/\s+/gu, "").replace(/\$/gu, "").toUpperCase();
  const match = normalized.match(/^SUM\(([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)\)$/u);
  if (!match) return undefined;
  return {
    startColumn: match[1] as string,
    startRow: Number(match[2]),
    endColumn: match[3] as string,
    endRow: Number(match[4])
  };
}

function rowHasTotalLabel(row: ExcelJS.Row): boolean {
  let hasTotal = false;
  row.eachCell({includeEmpty: false}, (cell) => {
    if (normalizedText(cellText(cell)) === "TOTAL") hasTotal = true;
  });
  return hasTotal;
}

function assertAllowedSurvivingFormulas(
  sheets: ReadonlyMap<string, ExcelJS.Worksheet>,
  layouts: ReadonlyMap<string, WorksheetFormulaLayout>
): void {
  for (const [sheetName, worksheet] of sheets) {
    const layout = layouts.get(sheetName);
    if (!layout) {
      throw new InventoryReportPermanentError("PLANTILLA_INVALIDA", "Falta el mapa estructural de una hoja.");
    }
    const patternColumn = targetColumn(layout.columns, "PLANTAS PATRON");
    const maleColumn = targetColumn(layout.columns, "PLANTAS MACHOS");
    const numericSummaryColumns = new Set([
      patternColumn,
      targetColumn(layout.columns, "PLANTAS HEMBRAS"),
      maleColumn,
      targetColumn(layout.columns, "PLANTAS MUERTAS")
    ]);
    const mappedRows = [...layout.mappedRows].sort((left, right) => left - right);
    const firstMappedRow = mappedRows[0];
    const lastMappedRow = mappedRows.at(-1);
    const summaryColumns = new Set<number>();
    worksheet.eachRow({includeEmpty: false}, (row) => {
      row.eachCell({includeEmpty: false}, (cell, columnNumber) => {
        const formula = cell.formula;
        if (typeof formula !== "string") return;
        const range = sumFormulaRange(formula);
        const columnLetter = worksheet.getColumn(columnNumber).letter.toUpperCase();

        const coversMappedRows = firstMappedRow === undefined || lastMappedRow === undefined ||
          (range !== undefined && range.startRow <= firstMappedRow && range.endRow >= lastMappedRow);
        const isStructuralSummary = numericSummaryColumns.has(columnNumber) &&
          !summaryColumns.has(columnNumber) && row.number > layout.headerRow && rowHasTotalLabel(row) &&
          range?.startColumn === columnLetter && range.endColumn === columnLetter &&
          range.startRow > layout.headerRow && range.endRow < row.number && coversMappedRows;
        if (isStructuralSummary) {
          summaryColumns.add(columnNumber);
          return;
        }
        throw new InventoryReportPermanentError(
          "PLANTILLA_CELDA_DATOS_CON_FORMULA",
          `La celda ${worksheet.name}!${cell.address} contiene una formula no permitida.`
        );
      });
    });
  }
}

function bogotaDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new InventoryReportPermanentError("CONTEO_FECHA_INVALIDA", "Un conteo no tiene fecha valida.");
  }
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric"
  }).format(date);
}

export function inventoryReportFileName(month: number, year: number): string {
  const monthName = MONTHS[month - 1];
  if (!monthName || !Number.isSafeInteger(year) || year < 2000 || year > 2100) {
    throw new InventoryReportPermanentError("PERIODO_INVALIDO", "El periodo del informe no es valido.");
  }
  return `INVENTARIO ${monthName} ${year}.xlsx`;
}

export async function renderInventoryReportXlsx(
  template: Buffer,
  report: Pick<
    InventoryReportDocument,
    "lineas" | "activadaEn" | "cerradaEn" | "responsableNombreVisible"
  >
): Promise<Buffer> {
  if (!Array.isArray(report.lineas) || report.lineas.length > INVENTORY_REPORT_MAX_LINES) {
    throw new InventoryReportPermanentError(
      "INFORME_DOCUMENTO_INVALIDO",
      "El informe supera el maximo de 400 lineas."
    );
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new InventoryReportPermanentError(
      "PLANTILLA_XLSX_INVALIDA",
      "La plantilla XLSX no se puede abrir."
    );
  }
  const sheets = new Map<string, ExcelJS.Worksheet>();
  const removedSheetNames: string[] = [];
  for (const worksheet of [...workbook.worksheets]) {
    const normalizedName = normalizedText(worksheet.name);
    if ((EXPECTED_SHEETS as readonly string[]).includes(normalizedName)) {
      if (sheets.has(normalizedName)) {
        throw new InventoryReportPermanentError("PLANTILLA_HOJA_DUPLICADA", `Hoja duplicada: ${normalizedName}.`);
      }
      sheets.set(normalizedName, worksheet);
    } else {
      removedSheetNames.push(worksheet.name);
      workbook.removeWorksheet(worksheet.id);
    }
  }
  if (EXPECTED_SHEETS.some((name) => !sheets.has(name))) {
    throw new InventoryReportPermanentError(
      "PLANTILLA_HOJAS_INCOMPLETAS",
      "La plantilla debe contener MODULO 1 a MODULO 5."
    );
  }

  const reportsByLocation = new Map<string, InventoryReportLineSnapshot>();
  for (const line of report.lineas) {
    const key = locationKey(line.ubicacion.modulo, line.ubicacion.cama, line.ubicacion.linea);
    if (!key || !Number.isSafeInteger(line.hembras) || line.hembras < 0 ||
        !Number.isSafeInteger(line.machos) || line.machos < 0 ||
        !Number.isSafeInteger(line.patrones) || line.patrones < 0 ||
        !Number.isSafeInteger(line.total) || line.total !== line.hembras + line.machos + line.patrones ||
        !Number.isSafeInteger(line.plantasMuertas) || line.plantasMuertas < 0) {
      throw new InventoryReportPermanentError("INFORME_LINEA_INVALIDA", "Una linea congelada no es valida.");
    }
    if (reportsByLocation.has(key)) {
      throw new InventoryReportPermanentError("INFORME_LINEA_DUPLICADA", "El informe repite modulo, cama y linea.");
    }
    reportsByLocation.set(key, line);
  }

  const matched = new Set<string>();
  const seenTemplateRows = new Set<string>();
  const mappedRows: MappedTemplateRow[] = [];
  const formulaLayouts = new Map<string, WorksheetFormulaLayout>();
  for (const sheetName of EXPECTED_SHEETS) {
    const worksheet = sheets.get(sheetName);
    if (!worksheet) throw new InventoryReportPermanentError("PLANTILLA_INVALIDA", "Falta una hoja.");
    fillWorksheetHeader(worksheet, sheetName, report);
    const {rowNumber: headerRow, columns} = headersFor(worksheet);
    const totalColumn = totalColumnFor(worksheet, headerRow);
    const mappedSheetRows = new Set<number>();
    for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const bedCell = row.getCell(targetColumn(columns, "CAMA"));
      const lineCell = row.getCell(targetColumn(columns, "LINEA"));
      if (
        (bedCell.isMerged || lineCell.isMerged) &&
        bedCell.master.address === lineCell.master.address
      ) continue;
      const locationFormulaCell = [bedCell, lineCell].find((cell) => cell.formula !== undefined);
      if (locationFormulaCell) {
        throw new InventoryReportPermanentError(
          "PLANTILLA_CELDA_DATOS_CON_FORMULA",
          `La celda ${worksheet.name}!${locationFormulaCell.address} contiene una formula de ubicacion no reemplazable.`
        );
      }
      const bedText = cellText(bedCell);
      const lineText = cellText(lineCell);
      const hasBed = normalizedText(bedText) !== "";
      const hasLine = normalizedText(lineText) !== "";
      const dataCells = {
        date: row.getCell(targetColumn(columns, "FECHA")),
        patterns: row.getCell(targetColumn(columns, "PLANTAS PATRON")),
        females: row.getCell(targetColumn(columns, "PLANTAS HEMBRAS")),
        males: row.getCell(targetColumn(columns, "PLANTAS MACHOS")),
        deadPlants: row.getCell(targetColumn(columns, "PLANTAS MUERTAS")),
        observations: row.getCell(targetColumn(columns, "OBSERVACIONES"))
      };
      if (!hasBed && !hasLine) {
        const totalCell = totalColumn === undefined ? undefined : row.getCell(totalColumn);
        const formulaCell = [
          ...Object.values(dataCells),
          ...(totalCell === undefined ? [] : [totalCell])
        ].find((cell) => cell.formula !== undefined);
        if (formulaCell) {
          throw new InventoryReportPermanentError(
            "PLANTILLA_CELDA_DATOS_CON_FORMULA",
            `La celda ${worksheet.name}!${formulaCell.address} contiene una formula en una fila no mapeada.`
          );
        }
        continue;
      }
      if (!hasBed || !hasLine) {
        throw new InventoryReportPermanentError(
          "PLANTILLA_FILA_INESPERADA",
          `La fila ${rowNumber} de ${worksheet.name} debe contener CAMA y LINEA.`
        );
      }
      const key = locationKey(sheetName, bedText, lineText);
      if (!key) throw new InventoryReportPermanentError("PLANTILLA_FILA_INESPERADA", "Fila invalida.");
      if (seenTemplateRows.has(key)) {
        throw new InventoryReportPermanentError(
          "PLANTILLA_FILA_DUPLICADA",
          `La plantilla repite una fila de ${worksheet.name}.`
        );
      }
      seenTemplateRows.add(key);
      const reportLine = reportsByLocation.get(key);
      if (!reportLine) {
        throw new InventoryReportPermanentError(
          "PLANTILLA_FILA_SIN_CONTEO",
          `La fila ${rowNumber} de ${worksheet.name} no tiene conteo aprobado.`
        );
      }
      mappedRows.push({cells: [
        {
          cell: dataCells.patterns,
          value: reportLine.patrones
        },
        {
          cell: dataCells.females,
          value: reportLine.hembras
        },
        {
          cell: dataCells.males,
          value: reportLine.machos
        },
        {
          cell: dataCells.deadPlants,
          value: reportLine.plantasMuertas
        },
        {
          cell: dataCells.date,
          value: bogotaDate(reportLine.conteoRecibidoEn)
        },
         {
           cell: dataCells.observations,
           value: reportLine.observaciones ?? ""
         },
         ...(totalColumn === undefined ? [] : [{
           cell: row.getCell(totalColumn),
           value: reportLine.total
         }])
       ]});
      mappedSheetRows.add(rowNumber);
      matched.add(key);
    }
    formulaLayouts.set(sheetName, {
      headerRow,
      columns,
      mappedRows: mappedSheetRows
    });
  }
  const missing = [...reportsByLocation.keys()].filter((key) => !matched.has(key));
  if (missing.length > 0) {
    throw new InventoryReportPermanentError(
      "PLANTILLA_LINEA_FALTANTE",
      "La plantilla no contiene todas las lineas aprobadas."
    );
  }
  replaceMappedDataCells(mappedRows);
  if (containsBrokenReference(workbook, removedSheetNames)) {
    throw new InventoryReportPermanentError("PLANTILLA_REF_INVALIDA", "El libro contiene una formula #REF!.");
  }
  assertAllowedSurvivingFormulas(sheets, formulaLayouts);
  workbook.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function reportSummary(snapshot: DocumentSnapshot): InventoryReportSummary {
  if (!snapshot.exists) throw domainErrors.inventoryReportNotFound();
  const report = snapshot.data() as Partial<InventoryReportDocument>;
  if (
    report.id !== snapshot.id || report.jornadaId !== snapshot.id ||
    typeof report.jornadaNombreVisible !== "string" || report.jornadaNombreVisible.trim() === "" ||
    !REPORT_STATUSES.has(report.estado as InventoryReportStatus) ||
    !Number.isSafeInteger(report.mes) || (report.mes as number) < 1 || (report.mes as number) > 12 ||
    !Number.isSafeInteger(report.anio) || (report.anio as number) < 2000 || (report.anio as number) > 2100 ||
    (report.fuentePlantasMuertas !== "CONTEO_FISICO" &&
      report.fuentePlantasMuertas !== "DESCARTES_APROBADOS") ||
    !Number.isSafeInteger(report.intentos) || (report.intentos as number) < 0 ||
    !(report.creadoEn instanceof Timestamp) ||
    !(report.actualizadoEn instanceof Timestamp)
  ) throw domainErrors.internal();
  const hasErrorCode = typeof report.errorCodigo === "string" && report.errorCodigo.trim() !== "";
  const hasErrorMessage = typeof report.errorMensaje === "string" && report.errorMensaje.trim() !== "";
  const hasFileName = typeof report.archivoNombre === "string" && report.archivoNombre.trim() !== "";
  const hasFileLink = typeof report.archivoEnlace === "string" && report.archivoEnlace.trim() !== "";
  const hasFinishedAt = report.finalizadoEn instanceof Timestamp;
  const hasAnyErrorField = report.errorCodigo !== undefined || report.errorMensaje !== undefined;
  const hasAnyFileField = report.archivoNombre !== undefined || report.archivoEnlace !== undefined;
  const hasAnyFinishedField = report.finalizadoEn !== undefined;
  const attempts = report.intentos as number;
  const stateIsCoherent = (
    (report.estado === "PENDIENTE" && !hasAnyErrorField && !hasAnyFileField && !hasAnyFinishedField) ||
    (report.estado === "PROCESANDO" && attempts >= 1 &&
      !hasAnyErrorField && !hasAnyFileField && !hasAnyFinishedField) ||
    (report.estado === "COMPLETADO" && attempts >= 1 && hasFileName && hasFileLink && hasFinishedAt &&
      !hasAnyErrorField) ||
    ((report.estado === "ERROR_REINTENTABLE" || report.estado === "ERROR_PERMANENTE") &&
      attempts >= 1 && hasErrorCode && hasErrorMessage && hasFinishedAt && !hasAnyFileField)
  );
  if (!stateIsCoherent) throw domainErrors.internal();
  return {
    informeId: snapshot.id,
    jornadaId: snapshot.id,
    jornadaNombreVisible: report.jornadaNombreVisible,
    estado: report.estado as InventoryReportStatus,
    mes: report.mes as number,
    anio: report.anio as number,
    fuentePlantasMuertas: report.fuentePlantasMuertas,
    intentos: report.intentos as number,
    ...(typeof report.errorCodigo === "string" ? {errorCodigo: report.errorCodigo} : {}),
    ...(typeof report.errorMensaje === "string" ? {errorMensaje: report.errorMensaje} : {}),
    ...(typeof report.archivoNombre === "string" ? {archivoNombre: report.archivoNombre} : {}),
    ...(typeof report.archivoEnlace === "string" ? {archivoEnlace: report.archivoEnlace} : {}),
    creadoEn: report.creadoEn.toDate().toISOString(),
    actualizadoEn: report.actualizadoEn.toDate().toISOString(),
    ...(report.finalizadoEn instanceof Timestamp
      ? {finalizadoEn: report.finalizadoEn.toDate().toISOString()}
      : {})
  };
}

function activeRoles(snapshot: DocumentSnapshot): readonly string[] {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const user = snapshot.data() as UserDocument;
  if (user.activo !== true) throw domainErrors.userInactive();
  return Array.isArray(user.roles) ? user.roles.filter((role): role is string => typeof role === "string") : [];
}

function canManageReport(roles: readonly string[], actorId: string, report: InventoryReportDocument): boolean {
  return roles.includes("ADMINISTRADOR") ||
    (roles.includes("SUPERVISOR") && report.creadorJornadaUsuarioId === actorId);
}

export class ListInventoryReportsService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<ListInventoryReportsResult> {
    const userSnapshot = await this.firestore.collection("usuarios").doc(context.actorId).get();
    const roles = activeRoles(userSnapshot);
    if (!roles.includes("ADMINISTRADOR") && !roles.includes("SUPERVISOR")) {
      throw domainErrors.inventoryReportAccessDenied();
    }
    const reportsSnapshot = await this.firestore.collection("informesInventario").get();
    return {
      informes: reportsSnapshot.docs
        .filter((snapshot) => canManageReport(roles, context.actorId, snapshot.data() as InventoryReportDocument))
        .map(reportSummary)
        .sort((left, right) =>
          Date.parse(right.actualizadoEn) - Date.parse(left.actualizadoEn) ||
          left.jornadaNombreVisible.localeCompare(right.jornadaNombreVisible, "es")
        )
    };
  }
}

export class RetryInventoryReportService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: RetryInventoryReportRequest,
    context: TrustedOperationContext
  ): Promise<RetryInventoryReportResult> {
    const idempotencyId = sha256(`${context.actorId}:REINTENTAR_INFORME_INVENTARIO:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({jornadaId: request.jornadaId}));
    const auditId = randomUUID();
    return this.firestore.runTransaction(async (transaction) => {
      const userRef = this.firestore.collection("usuarios").doc(context.actorId);
      const reportRef = this.firestore.collection("informesInventario").doc(request.jornadaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [userSnapshot, reportSnapshot, idempotencySnapshot] = await transaction.getAll(
        userRef, reportRef, idempotencyRef
      );
      if (!userSnapshot || !reportSnapshot || !idempotencySnapshot) throw domainErrors.internal();
      const roles = activeRoles(userSnapshot);
      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<RetryInventoryReportResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      if (!reportSnapshot.exists) throw domainErrors.inventoryReportNotFound();
      const report = reportSnapshot.data() as InventoryReportDocument;
      if (!canManageReport(roles, context.actorId, report)) throw domainErrors.inventoryReportAccessDenied();
      if (report.estado !== "ERROR_REINTENTABLE") throw domainErrors.inventoryReportNotRetryable();
      const now = Timestamp.now();
      const result: RetryInventoryReportResult = {
        informeId: reportSnapshot.id,
        jornadaId: reportSnapshot.id,
        estado: "PENDIENTE",
        reintentadoEn: now.toDate().toISOString()
      };
      transaction.update(reportRef, {
        estado: "PENDIENTE",
        procesamientoId: FieldValue.delete(),
        procesandoEn: FieldValue.delete(),
        errorCodigo: FieldValue.delete(),
        errorMensaje: FieldValue.delete(),
        finalizadoEn: FieldValue.delete(),
        actualizadoEn: now
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "REINTENTAR_INFORME_INVENTARIO",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "INFORME_INVENTARIO_REINTENTADO",
        actorUsuarioId: context.actorId,
        recursoTipo: "INFORME_INVENTARIO",
        recursoId: reportSnapshot.id,
        jornadaId: reportSnapshot.id,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {estadoAnterior: "ERROR_REINTENTABLE", estadoNuevo: "PENDIENTE"}
      });
      return result;
    });
  }
}

function sanitizedMessage(error: unknown): string {
  if (error instanceof InventoryReportPermanentError) {
    return error.message.replace(/[\r\n\t]+/gu, " ").slice(0, 500) || "La plantilla no es valida.";
  }
  if (error instanceof InventoryReportDriveConfigurationError) {
    return "La configuracion central de Drive no permite procesar el informe.";
  }
  return "No fue posible completar la operacion con Drive. Reintenta el informe.";
}

export class ProcessInventoryReportService {
  constructor(
    private readonly firestore: Firestore,
    private readonly gatewayFactory: () => Promise<InventoryReportDriveGateway> =
      createInventoryReportDriveGatewayFromEnvironment
  ) {}

  private async claim(reportId: string): Promise<ClaimedReport | undefined> {
    const processingId = randomUUID();
    return this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.collection("informesInventario").doc(reportId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return undefined;
      const report = snapshot.data() as InventoryReportDocument;
      const now = Timestamp.now();
      const staleProcessing = report.estado === "PROCESANDO" && (
        !(report.procesandoEn instanceof Timestamp) ||
        now.toMillis() - report.procesandoEn.toMillis() >= PROCESSING_LEASE_MS
      );
      if (report.estado === "PROCESANDO" && !staleProcessing) {
        throw new Error("El lease de procesamiento sigue activo.");
      }
      if (report.estado !== "PENDIENTE" && !staleProcessing) return undefined;
      if (!Number.isSafeInteger(report.intentos) || report.intentos < 0 ||
          report.intentos >= Number.MAX_SAFE_INTEGER) {
        throw domainErrors.internal();
      }
      transaction.update(ref, {
        estado: "PROCESANDO",
        procesamientoId: processingId,
        procesandoEn: now,
        intentos: report.intentos + 1,
        actualizadoEn: now,
        errorCodigo: FieldValue.delete(),
        errorMensaje: FieldValue.delete(),
        finalizadoEn: FieldValue.delete()
      });
      return {
        reportId,
        report: {...report, estado: "PROCESANDO", intentos: report.intentos + 1, procesamientoId: processingId},
        processingId
      };
    });
  }

  private async complete(
    claimed: ClaimedReport,
    file: {archivoDriveId: string; archivoEnlace: string},
    fileName: string,
    contentHash: string
  ): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.collection("informesInventario").doc(claimed.reportId);
      const snapshot = await transaction.get(ref);
      const current = snapshot.data() as InventoryReportDocument | undefined;
      if (!snapshot.exists || current?.estado !== "PROCESANDO" ||
          current.procesamientoId !== claimed.processingId) return;
      const now = Timestamp.now();
      transaction.update(ref, {
        estado: "COMPLETADO",
        archivoNombre: fileName,
        archivoDriveId: file.archivoDriveId,
        archivoEnlace: file.archivoEnlace,
        hashContenido: contentHash,
        actualizadoEn: now,
        finalizadoEn: now
      });
    });
  }

  private async fail(claimed: ClaimedReport, error: unknown): Promise<void> {
    const permanent = error instanceof InventoryReportPermanentError;
    const code = error instanceof InventoryReportPermanentError
      ? error.code
      : error instanceof InventoryReportDriveConfigurationError
        ? "DRIVE_CONFIGURACION_REQUERIDA"
        : "DRIVE_ERROR_TEMPORAL";
    await this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.collection("informesInventario").doc(claimed.reportId);
      const snapshot = await transaction.get(ref);
      const current = snapshot.data() as InventoryReportDocument | undefined;
      if (!snapshot.exists || current?.estado !== "PROCESANDO" ||
          current.procesamientoId !== claimed.processingId) return;
      const now = Timestamp.now();
      transaction.update(ref, {
        estado: permanent ? "ERROR_PERMANENTE" : "ERROR_REINTENTABLE",
        errorCodigo: code,
        errorMensaje: sanitizedMessage(error),
        actualizadoEn: now,
        finalizadoEn: now
      });
    });
  }

  async execute(reportId: string): Promise<void> {
    const claimed = await this.claim(reportId);
    if (!claimed) return;
    try {
      validateReportForProcessing(reportId, claimed.report);
      const gateway = await this.gatewayFactory();
      const template = await gateway.getTemplateXlsx({lineas: claimed.report.lineas});
      const xlsx = await renderInventoryReportXlsx(template, claimed.report);
      const fileName = inventoryReportFileName(claimed.report.mes, claimed.report.anio);
      const file = await gateway.upsertReport({
        jornadaId: claimed.report.jornadaId,
        mes: claimed.report.mes,
        anio: claimed.report.anio,
        archivoNombre: fileName,
        contenido: xlsx
      });
      await this.complete(claimed, file, fileName, sha256(xlsx));
    } catch (error) {
      await this.fail(claimed, error);
    }
  }
}
