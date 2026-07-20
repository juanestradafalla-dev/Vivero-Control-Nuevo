import {Readable} from "node:stream";

import {type drive_v3} from "@googleapis/drive";
import ExcelJS from "exceljs";
import type {Firestore} from "firebase-admin/firestore";

import type {VisibleLocation} from "./contracts.js";
import {
  createAuthorizedDriveClient,
  createDriveOAuthProviderFromEnvironment,
  DriveOAuthConfigurationError,
  DriveOAuthInvalidGrantError,
  markConnectionRequiresReconnectData,
  readGoogleDriveConnectionConfiguration
} from "./driveOAuth.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";

export interface InventoryReportTemplateInput {
  readonly lineas: readonly {readonly ubicacion: VisibleLocation}[];
}

export interface InventoryReportUploadInput {
  readonly jornadaId: string;
  readonly mes: number;
  readonly anio: number;
  readonly archivoNombre: string;
  readonly contenido: Buffer;
}

export interface InventoryReportDriveFile {
  readonly archivoDriveId: string;
  readonly archivoEnlace: string;
}

export interface InventoryReportDriveGateway {
  getTemplateXlsx(input: InventoryReportTemplateInput): Promise<Buffer>;
  upsertReport(input: InventoryReportUploadInput): Promise<InventoryReportDriveFile>;
}

export class InventoryReportDriveConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryReportDriveConfigurationError";
  }
}

interface FakeFile extends InventoryReportDriveFile {
  readonly content: Buffer;
  readonly name: string;
}

const fakeFiles = new Map<string, FakeFile>();

function fakeKey(input: Pick<InventoryReportUploadInput, "jornadaId" | "mes" | "anio">): string {
  return `${input.jornadaId}:${input.anio}-${String(input.mes).padStart(2, "0")}`;
}

function canonicalDriveLink(fileId: string): string {
  return `https://drive.fake.invalid/file/d/${encodeURIComponent(fileId)}/view`;
}

function confirmedDriveLink(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Drive no devolvio un enlace confirmado.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname)) {
    throw new InventoryReportDriveConfigurationError("Drive devolvio un enlace no permitido.");
  }
  return url.toString();
}

function moduleNumber(moduleName: string): number | undefined {
  const normalized = moduleName.normalize("NFD").replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, " ").trim().replace(/\s+/gu, " ").toUpperCase();
  const match = normalized.match(/^(?:(?:MODULO|M) ?)?([1-5])$/u);
  return match ? Number(match[1]) : undefined;
}

async function createFakeTemplate(input: InventoryReportTemplateInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const headers = [
    "FECHA", "CAMA", "LINEA", "PLANTAS PATRON", "PLANTAS HEMBRAS",
    "PLANTAS MACHOS", "PLANTAS MUERTAS", "OBSERVACIONES"
  ];
  for (let number = 1; number <= 5; number += 1) {
    const worksheet = workbook.addWorksheet(`MODULO ${number}`);
    worksheet.getCell("A1").value = "Modulo";
    worksheet.getCell("A2").value = "Fecha inicial";
    worksheet.getCell("A3").value = "Fecha final";
    worksheet.getCell("A4").value = "Responsable";
    const header = worksheet.addRow(headers);
    header.font = {bold: true};
    const lines = input.lineas.filter((line) => moduleNumber(line.ubicacion.modulo) === number);
    for (const line of lines) {
      const row = worksheet.addRow([
        null,
        line.ubicacion.cama,
        line.ubicacion.linea,
        null,
        null,
        null,
        null,
        null
      ]);
      row.getCell(1).numFmt = "dd/mm/yyyy";
    }
  }
  workbook.addWorksheet("G3");
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export class FakeInventoryReportDriveGateway implements InventoryReportDriveGateway {
  async getTemplateXlsx(input: InventoryReportTemplateInput): Promise<Buffer> {
    return createFakeTemplate(input);
  }

  async upsertReport(input: InventoryReportUploadInput): Promise<InventoryReportDriveFile> {
    const key = fakeKey(input);
    const existing = fakeFiles.get(key);
    const fileId = existing?.archivoDriveId ?? `fake-${Buffer.from(key).toString("base64url")}`;
    const file: FakeFile = {
      archivoDriveId: fileId,
      archivoEnlace: canonicalDriveLink(fileId),
      content: Buffer.from(input.contenido),
      name: input.archivoNombre
    };
    fakeFiles.set(key, file);
    return {archivoDriveId: file.archivoDriveId, archivoEnlace: file.archivoEnlace};
  }

  static reset(): void {
    fakeFiles.clear();
  }

  static inspect(input: Pick<InventoryReportUploadInput, "jornadaId" | "mes" | "anio">): FakeFile | undefined {
    return fakeFiles.get(fakeKey(input));
  }
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'");
}

function bufferFromResponse(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return Buffer.from(value, "binary");
  throw new InventoryReportDriveConfigurationError("Drive no devolvio un archivo XLSX legible.");
}

export class GoogleInventoryReportDriveGateway implements InventoryReportDriveGateway {
  constructor(
    private readonly client: drive_v3.Drive,
    private readonly folderId: string,
    private readonly templateFileId: string,
    private readonly onInvalidGrant: () => Promise<void> = async () => undefined
  ) {}

  private async withAuthorizationGuard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const responseError = typeof error === "object" && error !== null && "response" in error &&
        typeof error.response === "object" && error.response !== null && "data" in error.response &&
        typeof error.response.data === "object" && error.response.data !== null &&
        "error" in error.response.data && typeof error.response.data.error === "string"
        ? error.response.data.error : undefined;
      if (responseError === "invalid_grant") {
        try {
          await this.onInvalidGrant();
        } catch {
          // La marca de reconexion es best-effort; no debe ocultar la causa OAuth original.
        }
        throw new DriveOAuthInvalidGrantError();
      }
      throw error;
    }
  }

  async getTemplateXlsx(_input: InventoryReportTemplateInput): Promise<Buffer> {
    return this.withAuthorizationGuard(async () => {
      const metadata = await this.client.files.get({
        fileId: this.templateFileId,
        fields: "id,mimeType",
        supportsAllDrives: true
      });
      if (metadata.data.mimeType === GOOGLE_SHEET_MIME) {
        const response = await this.client.files.export(
          {fileId: this.templateFileId, mimeType: XLSX_MIME},
          {responseType: "arraybuffer"}
        );
        return bufferFromResponse(response.data);
      }
      if (metadata.data.mimeType !== XLSX_MIME) {
        throw new InventoryReportDriveConfigurationError(
          "La plantilla de Drive no es XLSX ni una hoja nativa de Google."
        );
      }
      const response = await this.client.files.get(
        {fileId: this.templateFileId, alt: "media", supportsAllDrives: true},
        {responseType: "arraybuffer"}
      );
      return bufferFromResponse(response.data);
    });
  }

  async upsertReport(input: InventoryReportUploadInput): Promise<InventoryReportDriveFile> {
    return this.withAuthorizationGuard(async () => this.upsertAuthorized(input));
  }

  private async upsertAuthorized(input: InventoryReportUploadInput): Promise<InventoryReportDriveFile> {
    const period = `${input.anio}-${String(input.mes).padStart(2, "0")}`;
    const query = [
      `'${escapeDriveQuery(this.folderId)}' in parents`,
      "trashed = false",
      `appProperties has { key='jornadaId' and value='${escapeDriveQuery(input.jornadaId)}' }`,
      `appProperties has { key='periodo' and value='${escapeDriveQuery(period)}' }`
    ].join(" and ");
    const existing = await this.client.files.list({
      q: query,
      spaces: "drive",
      fields: "files(id,name)",
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    const files = existing.data.files ?? [];
    if (files.length > 1) {
      throw new InventoryReportDriveConfigurationError(
        "Drive contiene mas de un informe para la misma jornada y periodo."
      );
    }
    const media = {mimeType: XLSX_MIME, body: Readable.from(input.contenido)};
    let fileId = files[0]?.id ?? undefined;
    let webViewLink: string | undefined;
    if (fileId) {
      const updated = await this.client.files.update({
        fileId,
        requestBody: {name: input.archivoNombre},
        media,
        fields: "id,webViewLink",
        supportsAllDrives: true
      });
      fileId = updated.data.id ?? fileId;
      webViewLink = updated.data.webViewLink ?? undefined;
    } else {
      const created = await this.client.files.create({
        requestBody: {
          name: input.archivoNombre,
          parents: [this.folderId],
          mimeType: XLSX_MIME,
          appProperties: {jornadaId: input.jornadaId, periodo: period}
        },
        media,
        fields: "id,webViewLink",
        supportsAllDrives: true
      });
      fileId = created.data.id ?? undefined;
      webViewLink = created.data.webViewLink ?? undefined;
    }
    if (!fileId) throw new Error("Drive no devolvio el ID del informe.");
    return {archivoDriveId: fileId, archivoEnlace: confirmedDriveLink(webViewLink)};
  }
}

export async function createInventoryReportDriveGatewayFromEnvironment(
  firestore?: Firestore
): Promise<InventoryReportDriveGateway> {
  const mode = process.env.GOOGLE_DRIVE_INVENTORY_MODE;
  const ci = process.env.CI !== undefined && !["", "0", "false"].includes(process.env.CI.toLowerCase());
  const emulatorOrCi = process.env.FUNCTIONS_EMULATOR === "true" || ci;
  if (emulatorOrCi) {
    if (mode !== undefined && mode !== "fake") {
      throw new InventoryReportDriveConfigurationError(
        "Emulator y CI solo permiten GOOGLE_DRIVE_INVENTORY_MODE=fake."
      );
    }
    return new FakeInventoryReportDriveGateway();
  }
  if (mode !== "oauth-user" || !firestore) {
    throw new InventoryReportDriveConfigurationError(
      "Produccion exige OAuth de usuario y configuracion central seleccionada."
    );
  }
  try {
    const selection = await readGoogleDriveConnectionConfiguration(firestore);
    const provider = createDriveOAuthProviderFromEnvironment();
    const client = await createAuthorizedDriveClient(provider);
    const onInvalidGrant = async (): Promise<void> => {
      await firestore.collection("configuracionesIntegraciones").doc("googleDriveInventario")
        .set(markConnectionRequiresReconnectData(), {merge: true});
    };
    return new GoogleInventoryReportDriveGateway(
      client,
      selection.folderId,
      selection.templateFileId,
      onInvalidGrant
    );
  } catch (error) {
    if (error instanceof DriveOAuthInvalidGrantError) throw error;
    if (!(error instanceof DriveOAuthConfigurationError)) throw error;
    throw new InventoryReportDriveConfigurationError(
      "La conexion OAuth o la seleccion central de Drive no esta lista."
    );
  }
}
