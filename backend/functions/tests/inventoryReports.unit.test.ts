import ExcelJS from "exceljs";
import {Timestamp} from "firebase-admin/firestore";
import JSZip from "jszip";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const driveAuthGetClient = vi.hoisted(() => vi.fn(async () => {
  throw new Error("Las pruebas unitarias no pueden autenticar contra Google Drive.");
}));
const driveClientFactory = vi.hoisted(() => vi.fn());

vi.mock("@googleapis/drive", () => ({
  auth: {getClient: driveAuthGetClient},
  drive: driveClientFactory
}));

import {
  InventoryReportPermanentError,
  inventoryReportFileName,
  type InventoryReportLineSnapshot,
  renderInventoryReportXlsx
} from "../src/domain/inventoryReports.js";
import {
  createInventoryReportDriveGatewayFromEnvironment,
  FakeInventoryReportDriveGateway,
  InventoryReportDriveConfigurationError
} from "../src/domain/inventoryReportDrive.js";

const HEADERS = [
  "FECHA", "CAMA", "LINEA", "PLANTAS PATRON", "PLANTAS HEMBRAS",
  "PLANTAS MACHOS", "PLANTAS MUERTAS", "OBSERVACIONES"
] as const;

interface TemplateRow {
  readonly module: number;
  readonly bed: string;
  readonly line: string;
}

interface TemplateOptions {
  readonly rows?: readonly TemplateRow[];
  readonly includeG3?: boolean;
  readonly brokenReference?: boolean;
  readonly removedSheetReference?: boolean;
  readonly dataCellFormula?: boolean;
  readonly locationFormula?: "CAMA" | "LINEA";
  readonly blankRowDataFormula?: boolean;
  readonly unexpectedFormula?: "UNRELATED" | "MERGED_ROW";
  readonly omitBed?: boolean;
  readonly omitLine?: boolean;
  readonly omittedModule?: number;
  readonly realLayoutDecoration?: boolean;
}

const environmentNames = [
  "GOOGLE_DRIVE_INVENTORY_MODE",
  "GOOGLE_DRIVE_INVENTORY_FOLDER_ID",
  "GOOGLE_DRIVE_INVENTORY_TEMPLATE_FILE_ID",
  "FUNCTIONS_EMULATOR",
  "CI",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "APP_ENV"
] as const;
const originalEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]])
);

function restoreEnvironment(): void {
  for (const name of environmentNames) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function configureIsolatedEnvironment(): void {
  for (const name of environmentNames) delete process.env[name];
}

async function createTemplate(options: TemplateOptions = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (let module = 1; module <= 5; module += 1) {
    if (module === options.omittedModule) continue;
    const worksheet = workbook.addWorksheet(`MODULO ${module}`);
    const labels = [
      "Módulo",
      options.realLayoutDecoration ? "Fecha inicio" : "Fecha inicial",
      "Fecha final",
      "Responsable"
    ];
    for (let rowNumber = 1; rowNumber <= labels.length; rowNumber += 1) {
      worksheet.mergeCells(`A${rowNumber}:B${rowNumber}`);
      worksheet.mergeCells(`C${rowNumber}:D${rowNumber}`);
      worksheet.getCell(`A${rowNumber}`).value = labels[rowNumber - 1] ?? "";
    }
    worksheet.getRow(6).values = [...HEADERS, "TOTAL VIVAS"];
    const moduleRows = (options.rows ?? []).filter((row) => row.module === module);
    for (const row of moduleRows) {
      const dataRow = worksheet.addRow([
        null,
        options.omitBed ? null : row.bed,
        options.omitLine ? null : row.line,
        null,
        null,
        null,
        null,
        null,
        null
      ]);
      dataRow.getCell(9).value = {
        formula: `SUM(D${dataRow.number}:F${dataRow.number})`,
        result: 0
      };
      if (options.dataCellFormula) {
        dataRow.getCell(4).value = {formula: "1+1", result: 2};
      }
      if (options.locationFormula === "CAMA") {
        dataRow.getCell(2).value = {formula: "\"Cama A\"", result: row.bed};
      }
      if (options.locationFormula === "LINEA") {
        dataRow.getCell(3).value = {formula: "\"Linea 01\"", result: row.line};
      }
    }
    if (options.realLayoutDecoration) {
      worksheet.mergeCells("E5:F5");
      worksheet.getCell("E5").border = {bottom: {style: "thin"}};
      const totalRow = worksheet.addRow([]);
      worksheet.mergeCells(`A${totalRow.number}:C${totalRow.number}`);
      totalRow.getCell(1).value = "Total";
      if (moduleRows.length > 0) {
        const firstDataRow = 7;
        const lastDataRow = firstDataRow + moduleRows.length - 1;
        totalRow.getCell(4).value = {formula: `SUM(D${firstDataRow}:D${lastDataRow})`, result: 0};
      }
      const signatureRow = worksheet.addRow([]);
      worksheet.mergeCells(`A${signatureRow.number}:C${signatureRow.number}`);
      signatureRow.getCell(1).value = "FIRMA DE DIRECTO DE VIVERO";
      const observationsRow = worksheet.addRow([]);
      worksheet.mergeCells(`A${observationsRow.number}:C${observationsRow.number}`);
      observationsRow.getCell(1).value = "OBSERVACIONES";
    }
    if (options.blankRowDataFormula && module === 1) {
      worksheet.getCell("D20").value = {formula: "1+1", result: 2};
    }
    if (options.unexpectedFormula === "UNRELATED" && module === 1) {
      worksheet.getCell("J7").value = {formula: "1+1", result: 2};
    }
    if (options.unexpectedFormula === "MERGED_ROW" && module === 1) {
      worksheet.mergeCells("B20:C20");
      worksheet.getCell("B20").value = "FIRMA";
      worksheet.getCell("D20").value = {formula: "1+1", result: 2};
    }
  }
  if (options.brokenReference) {
    const worksheet = workbook.getWorksheet("MODULO 1");
    if (!worksheet) throw new Error("La prueba requiere MODULO 1.");
    worksheet.getCell("J7").value = {formula: "SUM(#REF!)", result: "#REF!"};
  }
  if (options.removedSheetReference) {
    const worksheet = workbook.getWorksheet("MODULO 1");
    if (!worksheet) throw new Error("La prueba requiere MODULO 1.");
    worksheet.getCell("J7").value = {formula: "G3!A1", result: 1};
  }
  if (options.includeG3) workbook.addWorksheet("G3").getCell("A1").value = "HOJA AUXILIAR";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function createHistoricalFormulaTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (let module = 1; module <= 5; module += 1) {
    const worksheet = workbook.addWorksheet(`MODULO ${module}`);
    const labels = ["Modulo", "Fecha inicio", "Fecha final", "Responsable"];
    for (let rowNumber = 1; rowNumber <= labels.length; rowNumber += 1) {
      worksheet.mergeCells(`A${rowNumber}:B${rowNumber}`);
      worksheet.mergeCells(`C${rowNumber}:D${rowNumber}`);
      worksheet.getCell(`A${rowNumber}`).value = labels[rowNumber - 1] ?? "";
    }
    worksheet.getRow(7).values = [undefined, ...HEADERS, "TOTAL VIVAS"];
    if (module === 4) {
      for (const [rowNumber, suffix] of [[8, "08"], [28, "28"]] as const) {
        worksheet.getCell(`B${rowNumber}`).value = "fecha historica";
        worksheet.getCell(`C${rowNumber}`).value = `Cama ${suffix}`;
        worksheet.getCell(`D${rowNumber}`).value = `Linea ${suffix}`;
        worksheet.getCell(`E${rowNumber}`).value = 999;
        worksheet.getCell(`F${rowNumber}`).value = {formula: "1+1", result: 2};
        worksheet.getCell(`G${rowNumber}`).value = 999;
        worksheet.getCell(`H${rowNumber}`).value = 999;
        worksheet.getCell(`I${rowNumber}`).value = "dato historico";
      }
    }
    worksheet.mergeCells("C40:D40");
    worksheet.getCell("C40").value = "TOTAL";
    const summaryColumns = module === 1 ? ["E"] as const : ["E", "F", "G", "H"] as const;
    for (const column of summaryColumns) {
      worksheet.getCell(`${column}40`).value = {
        formula: `SUM(${column}8:${column}39)`,
        result: 0
      };
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

function reportLine(overrides: Partial<InventoryReportLineSnapshot> = {}): InventoryReportLineSnapshot {
  return {
    jornadaLineaId: "JORNADA-LINEA-01",
    lineaId: "LINEA-01",
    conteoId: "CONTEO-01",
    ubicacion: {
      vivero: "Vivero de prueba",
      modulo: "Módulo 1",
      cama: "Cama A",
      linea: "Línea 01",
      nombreVisible: "Módulo 1 / Cama A / Línea 01",
      orden: 1
    },
    hembras: 7,
    machos: 5,
    patrones: 3,
    total: 15,
    plantasMuertas: 2,
    conteoRecibidoEn: "2026-07-17T12:00:00.000Z",
    observaciones: "Conteo ficticio verificado",
    ...overrides
  };
}

function reportSnapshot(lineas: readonly InventoryReportLineSnapshot[] = [reportLine()]) {
  return {
    lineas,
    activadaEn: Timestamp.fromDate(new Date("2026-07-01T12:00:00.000Z")),
    cerradaEn: Timestamp.fromDate(new Date("2026-07-31T22:00:00.000Z")),
    responsableNombreVisible: "Supervisora de prueba"
  };
}

function historicalReportLine(rowNumber: 8 | 28, hembras: number): InventoryReportLineSnapshot {
  const suffix = String(rowNumber).padStart(2, "0");
  return reportLine({
    jornadaLineaId: `JORNADA-LINEA-${suffix}`,
    lineaId: `LINEA-${suffix}`,
    conteoId: `CONTEO-${suffix}`,
    ubicacion: {
      vivero: "Vivero de prueba",
      modulo: "MODULO 4",
      cama: `Cama ${suffix}`,
      linea: `Linea ${suffix}`,
      nombreVisible: `MODULO 4 / Cama ${suffix} / Linea ${suffix}`,
      orden: rowNumber
    },
    hembras,
    machos: 5,
    patrones: 3,
    total: hembras + 8,
    plantasMuertas: 2,
    observaciones: `Conteo aprobado ${suffix}`
  });
}

function workbookFormulas(workbook: ExcelJS.Workbook): string[] {
  const formulas: string[] = [];
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({includeEmpty: false}, (row) => {
      row.eachCell({includeEmpty: false}, (cell) => {
        if (cell.formula) formulas.push(cell.formula);
      });
    });
  }
  return formulas;
}

async function workbookCalculationXml(buffer: Buffer): Promise<string> {
  const archive = await JSZip.loadAsync(buffer);
  const workbookXml = archive.file("xl/workbook.xml");
  if (!workbookXml) throw new Error("El XLSX de prueba no contiene xl/workbook.xml.");
  return workbookXml.async("string");
}

beforeEach(() => {
  FakeInventoryReportDriveGateway.reset();
  driveAuthGetClient.mockClear();
  driveClientFactory.mockClear();
  configureIsolatedEnvironment();
});

afterEach(() => {
  restoreEnvironment();
});

describe("generación XLSX del informe de inventario", () => {
  it("sanitiza los detalles internos cuando el XLSX no se puede abrir", async () => {
    await expect(renderInventoryReportXlsx(
      Buffer.from("detalle-parser-no-exponer"),
      reportSnapshot()
    )).rejects.toMatchObject({
      code: "PLANTILLA_XLSX_INVALIDA",
      message: "La plantilla XLSX no se puede abrir."
    });
  });

  it("rechaza un informe que supera el maximo real de 400 lineas", async () => {
    const template = await createTemplate();

    await expect(renderInventoryReportXlsx(
      template,
      reportSnapshot(Array.from({length: 401}, () => reportLine()))
    )).rejects.toMatchObject({code: "INFORME_DOCUMENTO_INVALIDO"});
  });

  it("genera exactamente el maximo real de 400 lineas", async () => {
    const rows = Array.from({length: 400}, (_, index) => {
      const module = Math.floor(index / 80) + 1;
      const sequence = String((index % 80) + 1).padStart(3, "0");
      return {module, bed: `Cama ${sequence}`, line: `Linea ${sequence}`};
    });
    const lines = rows.map((row, index) => reportLine({
      jornadaLineaId: `JORNADA-LINEA-${index + 1}`,
      lineaId: `LINEA-${index + 1}`,
      conteoId: `CONTEO-${index + 1}`,
      ubicacion: {
        vivero: "Vivero de prueba",
        modulo: `MODULO ${row.module}`,
        cama: row.bed,
        linea: row.line,
        nombreVisible: `MODULO ${row.module} / ${row.bed} / ${row.line}`,
        orden: index + 1
      }
    }));
    const template = await createTemplate({rows});

    const output = await renderInventoryReportXlsx(template, reportSnapshot(lines));
    const workbook = await loadWorkbook(output);

    expect(workbook.getWorksheet("MODULO 1")?.getCell("B7").value).toBe("Cama 001");
    expect(workbook.getWorksheet("MODULO 5")?.getCell("C86").value).toBe("Linea 080");
    expect(workbook.worksheets.reduce((total, worksheet) => total + (worksheet.rowCount - 6), 0)).toBe(400);
  });

  it("conserva M1-M5, elimina G3 y completa encabezados y conteo sin romper merges", async () => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "Cama A", line: "Línea 01"}],
      includeG3: true,
      realLayoutDecoration: true
    });

    const output = await renderInventoryReportXlsx(template, reportSnapshot());
    const workbook = await loadWorkbook(output);

    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([
      "MODULO 1", "MODULO 2", "MODULO 3", "MODULO 4", "MODULO 5"
    ]);
    expect(workbook.getWorksheet("G3")).toBeUndefined();
    const moduleOne = workbook.getWorksheet("MODULO 1");
    const moduleFive = workbook.getWorksheet("MODULO 5");
    expect(moduleOne).toBeDefined();
    expect(moduleFive).toBeDefined();
    expect(moduleOne?.getCell("A1").value).toBe("Módulo");
    expect(moduleOne?.getCell("B1").master.address).toBe("A1");
    expect(moduleOne?.getCell("D1").master.address).toBe("C1");
    expect(moduleOne?.getCell("C1").value).toBe("MODULO 1");
    expect(moduleOne?.getCell("C2").value).toBe("01/07/2026");
    expect(moduleOne?.getCell("C3").value).toBe("31/07/2026");
    expect(moduleOne?.getCell("C4").value).toBe("Supervisora de prueba");
    expect(moduleFive?.getCell("C1").value).toBe("MODULO 5");
    const row = moduleOne?.getRow(7);
    expect(row?.getCell(1).value).toBe("17/07/2026");
    expect(row?.getCell(2).value).toBe("Cama A");
    expect(row?.getCell(3).value).toBe("Línea 01");
    expect(row?.getCell(4).value).toBe(3);
    expect(row?.getCell(5).value).toBe(7);
    expect(row?.getCell(6).value).toBe(5);
    expect(row?.getCell(7).value).toBe(2);
    expect(row?.getCell(8).value).toBe("Conteo ficticio verificado");
    expect(row?.getCell(9).value).toBe(15);
    expect(row?.getCell(9).formula).toBeUndefined();
    expect([4, 5, 6].reduce((total, column) => total + Number(row?.getCell(column).value), 0)).toBe(15);
    expect(moduleOne?.getCell("D8").formula).toBe("SUM(D7:D7)");
    const workbookXml = await workbookCalculationXml(output);
    expect(workbookXml).toMatch(/fullCalcOnLoad="1"/u);
  });

  it("genera el nombre mensual dinámico y rechaza periodos fuera de contrato", () => {
    expect(inventoryReportFileName(1, 2026)).toBe("INVENTARIO ENERO 2026.xlsx");
    expect(inventoryReportFileName(6, 2026)).toBe("INVENTARIO JUNIO 2026.xlsx");
    expect(inventoryReportFileName(12, 2100)).toBe("INVENTARIO DICIEMBRE 2100.xlsx");
    expect(() => inventoryReportFileName(0, 2026)).toThrow(InventoryReportPermanentError);
    expect(() => inventoryReportFileName(13, 2026)).toThrow(InventoryReportPermanentError);
    expect(() => inventoryReportFileName(1, 2101)).toThrow(InventoryReportPermanentError);
  });

  it("rechaza una referencia #REF! antes de emitir el archivo", async () => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "Cama A", line: "LINEA 01"}],
      brokenReference: true
    });

    await expect(renderInventoryReportXlsx(template, reportSnapshot()))
      .rejects.toMatchObject({code: "PLANTILLA_REF_INVALIDA"});
  });

  it("rechaza una fórmula que quedaría apuntando a la hoja G3 eliminada", async () => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "Cama A", line: "LINEA 01"}],
      includeG3: true,
      removedSheetReference: true
    });

    await expect(renderInventoryReportXlsx(template, reportSnapshot()))
      .rejects.toMatchObject({code: "PLANTILLA_REF_INVALIDA"});
  });

  it("reemplaza una formula previa cuando la celda objetivo esta obligatoriamente mapeada", async () => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "Cama A", line: "LINEA 01"}],
      dataCellFormula: true
    });

    const output = await renderInventoryReportXlsx(template, reportSnapshot());
    const workbook = await loadWorkbook(output);

    expect(workbook.getWorksheet("MODULO 1")?.getCell("D7").value).toBe(3);
    expect(workbook.getWorksheet("MODULO 1")?.getCell("D7").formula).toBeUndefined();
    expect(workbook.getWorksheet("MODULO 1")?.getCell("I7").value).toBe(15);
    expect(workbook.getWorksheet("MODULO 1")?.getCell("I7").formula).toBeUndefined();
  });

  it("reemplaza F8 y F28 y conserva exactamente 17 formulas estructurales sin REF", async () => {
    const template = await createHistoricalFormulaTemplate();
    const sourceWorkbook = await loadWorkbook(template);
    expect(sourceWorkbook.getWorksheet("MODULO 4")?.getCell("F8").formula).toBe("1+1");
    expect(sourceWorkbook.getWorksheet("MODULO 4")?.getCell("F28").formula).toBe("1+1");
    expect(workbookFormulas(sourceWorkbook)).toHaveLength(19);

    const output = await renderInventoryReportXlsx(template, reportSnapshot([
      historicalReportLine(8, 71),
      historicalReportLine(28, 37)
    ]));
    const workbook = await loadWorkbook(output);
    const moduleFour = workbook.getWorksheet("MODULO 4");

    expect(moduleFour?.getCell("F8").value).toBe(71);
    expect(moduleFour?.getCell("F8").formula).toBeUndefined();
    expect(moduleFour?.getCell("F28").value).toBe(37);
    expect(moduleFour?.getCell("F28").formula).toBeUndefined();
    expect(moduleFour?.getCell("B8").value).toBe("17/07/2026");
    expect(moduleFour?.getCell("E8").value).toBe(3);
    expect(moduleFour?.getCell("G8").value).toBe(5);
    expect(moduleFour?.getCell("H8").value).toBe(2);
    expect(moduleFour?.getCell("I8").value).toBe("Conteo aprobado 08");
    expect(moduleFour?.getCell("J8").value).toBe(79);
    expect(moduleFour?.getCell("J8").formula).toBeUndefined();
    expect(moduleFour?.getCell("J28").value).toBe(45);
    expect(moduleFour?.getCell("J28").formula).toBeUndefined();
    const formulas = workbookFormulas(workbook);
    expect(formulas).toHaveLength(17);
    expect(formulas.every((formula) => !formula.toUpperCase().includes("#REF!"))).toBe(true);
  });

  it("rechaza una formula de datos cuya fila no esta mapeada", async () => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "Cama no aprobada", line: "Linea no aprobada"}],
      dataCellFormula: true
    });

    await expect(renderInventoryReportXlsx(template, reportSnapshot()))
      .rejects.toMatchObject({code: "PLANTILLA_FILA_SIN_CONTEO"});
  });

  it("rechaza una formula objetivo en una fila ordinaria sin CAMA ni LINEA", async () => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "Cama A", line: "Linea 01"}],
      blankRowDataFormula: true
    });

    await expect(renderInventoryReportXlsx(template, reportSnapshot()))
      .rejects.toMatchObject({code: "PLANTILLA_CELDA_DATOS_CON_FORMULA"});
  });

  it.each(["CAMA", "LINEA"] as const)(
    "rechaza una formula de ubicacion en %s porque no seria reemplazada",
    async (locationFormula) => {
      const template = await createTemplate({
        rows: [{module: 1, bed: "Cama A", line: "Linea 01"}],
        locationFormula
      });

      await expect(renderInventoryReportXlsx(template, reportSnapshot()))
        .rejects.toMatchObject({code: "PLANTILLA_CELDA_DATOS_CON_FORMULA"});
    }
  );

  it.each(["UNRELATED", "MERGED_ROW"] as const)(
    "rechaza una formula inesperada que sobreviviria fuera del mapeo: %s",
    async (unexpectedFormula) => {
      const template = await createTemplate({
        rows: [{module: 1, bed: "Cama A", line: "Linea 01"}],
        unexpectedFormula
      });

      await expect(renderInventoryReportXlsx(template, reportSnapshot()))
        .rejects.toMatchObject({code: "PLANTILLA_CELDA_DATOS_CON_FORMULA"});
    }
  );

  it("rechaza cuando falta la fila de una línea aprobada", async () => {
    const template = await createTemplate();

    await expect(renderInventoryReportXlsx(template, reportSnapshot()))
      .rejects.toMatchObject({code: "PLANTILLA_LINEA_FALTANTE"});
  });

  it("rechaza un modulo inesperado aunque termine en un numero permitido", async () => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "Cama A", line: "LINEA 01"}]
    });

    await expect(renderInventoryReportXlsx(template, reportSnapshot([
      reportLine({ubicacion: {
        vivero: "Vivero de prueba",
        modulo: "MODULO NORTE 1",
        cama: "Cama A",
        linea: "Linea 01",
        nombreVisible: "MODULO NORTE 1 / Cama A / Linea 01",
        orden: 1
      }})
    ]))).rejects.toMatchObject({code: "INFORME_LINEA_INVALIDA"});
  });

  it("rechaza una fila de ubicación duplicada en la plantilla", async () => {
    const duplicate = {module: 1, bed: "CAMA A", line: "LINEA 01"};
    const template = await createTemplate({rows: [duplicate, duplicate]});

    await expect(renderInventoryReportXlsx(template, reportSnapshot()))
      .rejects.toMatchObject({code: "PLANTILLA_FILA_DUPLICADA"});
  });

  it.each([
    {omitBed: true, omitLine: false},
    {omitBed: false, omitLine: true}
  ])("rechaza una fila parcial con solo CAMA o solo LINEA", async ({omitBed, omitLine}) => {
    const template = await createTemplate({
      rows: [{module: 1, bed: "CAMA A", line: "LINEA 01"}],
      omitBed,
      omitLine,
      dataCellFormula: true
    });

    await expect(renderInventoryReportXlsx(template, reportSnapshot()))
      .rejects.toMatchObject({code: "PLANTILLA_FILA_INESPERADA"});
  });

  it("rechaza una plantilla sin las cinco hojas obligatorias", async () => {
    const template = await createTemplate({omittedModule: 5});

    await expect(renderInventoryReportXlsx(template, reportSnapshot([])))
      .rejects.toMatchObject({code: "PLANTILLA_HOJAS_INCOMPLETAS"});
  });
});

describe("adaptador falso e aislamiento de red", () => {
  it("crea una plantilla fake con etiquetas y encabezados compatibles con el render", async () => {
    const gateway = new FakeInventoryReportDriveGateway();
    const template = await gateway.getTemplateXlsx({lineas: [reportLine()]});
    const templateWorkbook = await loadWorkbook(template);
    const templateSheet = templateWorkbook.getWorksheet("MODULO 1");

    expect(templateSheet?.getCell("A1").value).toBe("Modulo");
    expect(templateSheet?.getCell("A2").value).toBe("Fecha inicial");
    expect(templateSheet?.getCell("A3").value).toBe("Fecha final");
    expect(templateSheet?.getCell("A4").value).toBe("Responsable");
    expect(templateSheet?.getRow(5).values).toEqual([undefined, ...HEADERS]);

    const output = await renderInventoryReportXlsx(template, reportSnapshot());
    const renderedWorkbook = await loadWorkbook(output);
    expect(renderedWorkbook.getWorksheet("G3")).toBeUndefined();
    expect(renderedWorkbook.getWorksheet("MODULO 1")?.getCell("B1").value).toBe("MODULO 1");
    expect(renderedWorkbook.getWorksheet("MODULO 1")?.getCell("B4").value)
      .toBe("Supervisora de prueba");
  });

  it("actualiza el mismo archivo lógico sin cambiar su ID", async () => {
    const gateway = new FakeInventoryReportDriveGateway();
    const identity = {jornadaId: "JORNADA-01", mes: 7, anio: 2026};

    const first = await gateway.upsertReport({
      ...identity,
      archivoNombre: "INVENTARIO JULIO 2026.xlsx",
      contenido: Buffer.from("primera versión")
    });
    const second = await gateway.upsertReport({
      ...identity,
      archivoNombre: "INVENTARIO JULIO 2026.xlsx",
      contenido: Buffer.from("segunda versión")
    });

    expect(second).toEqual(first);
    expect(second.archivoDriveId).toMatch(/^fake-/u);
    expect(new URL(second.archivoEnlace).hostname.endsWith(".invalid")).toBe(true);
    expect(FakeInventoryReportDriveGateway.inspect(identity)).toMatchObject({
      archivoDriveId: first.archivoDriveId,
      archivoEnlace: first.archivoEnlace,
      name: "INVENTARIO JULIO 2026.xlsx",
      content: Buffer.from("segunda versión")
    });
  });

  it("fuerza el adaptador fake en emulador sin autenticar ni crear cliente Drive", async () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.GOOGLE_DRIVE_INVENTORY_MODE = "fake";

    const gateway = await createInventoryReportDriveGatewayFromEnvironment();

    expect(gateway).toBeInstanceOf(FakeInventoryReportDriveGateway);
    expect(driveAuthGetClient).not.toHaveBeenCalled();
    expect(driveClientFactory).not.toHaveBeenCalled();
  });

  it("fuerza fake en CI aun si faltan IDs y rechaza solicitar modo google sin red", async () => {
    process.env.CI = "true";

    await expect(createInventoryReportDriveGatewayFromEnvironment())
      .resolves.toBeInstanceOf(FakeInventoryReportDriveGateway);
    expect(driveAuthGetClient).not.toHaveBeenCalled();

    process.env.GOOGLE_DRIVE_INVENTORY_MODE = "google";
    await expect(createInventoryReportDriveGatewayFromEnvironment())
      .rejects.toBeInstanceOf(InventoryReportDriveConfigurationError);
    expect(driveAuthGetClient).not.toHaveBeenCalled();
    expect(driveClientFactory).not.toHaveBeenCalled();
  });

  it("rechaza ambientes o proyectos no autorizados antes de solicitar ADC", async () => {
    process.env.GOOGLE_DRIVE_INVENTORY_MODE = "google";
    process.env.GOOGLE_DRIVE_INVENTORY_FOLDER_ID = "CARPETA-FICTICIA";
    process.env.GOOGLE_DRIVE_INVENTORY_TEMPLATE_FILE_ID = "PLANTILLA-FICTICIA";
    process.env.APP_ENV = "production";
    process.env.GCLOUD_PROJECT = "proyecto-no-autorizado";

    await expect(createInventoryReportDriveGatewayFromEnvironment())
      .rejects.toBeInstanceOf(InventoryReportDriveConfigurationError);
    expect(driveAuthGetClient).not.toHaveBeenCalled();

    process.env.GCLOUD_PROJECT = "viverocontrol-3f83f";
    process.env.APP_ENV = "staging";
    await expect(createInventoryReportDriveGatewayFromEnvironment())
      .rejects.toBeInstanceOf(InventoryReportDriveConfigurationError);
    expect(driveAuthGetClient).not.toHaveBeenCalled();
    expect(driveClientFactory).not.toHaveBeenCalled();
  });

  it("rechaza configuracion incompleta en produccion exacta antes de solicitar ADC", async () => {
    process.env.GOOGLE_DRIVE_INVENTORY_MODE = "google";
    process.env.APP_ENV = "production";
    process.env.GCLOUD_PROJECT = "viverocontrol-3f83f";

    await expect(createInventoryReportDriveGatewayFromEnvironment())
      .rejects.toBeInstanceOf(InventoryReportDriveConfigurationError);
    expect(driveAuthGetClient).not.toHaveBeenCalled();
    expect(driveClientFactory).not.toHaveBeenCalled();
  });
});
