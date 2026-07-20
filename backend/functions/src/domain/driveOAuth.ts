import {createHash, randomBytes, randomUUID} from "node:crypto";

import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import {drive} from "@googleapis/drive";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore
} from "firebase-admin/firestore";
import {OAuth2Client} from "google-auth-library";

import {PRODUCTION_PROJECT_ID} from "../runtimeEnvironment.js";
import type {
  CompleteGoogleDriveOAuthRequest,
  CompleteGoogleDriveOAuthResult,
  GoogleDriveConnectionStatusResult,
  GoogleDriveSelectionKind,
  RevokeGoogleDriveOAuthRequest,
  RevokeGoogleDriveOAuthResult,
  StartGoogleDriveOAuthRequest,
  StartGoogleDriveOAuthResult,
  TrustedOperationContext
} from "./contracts.js";
import {DomainError, domainErrors} from "./errors.js";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const OAUTH_CALLBACK_PATH = "/";

const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SESSION_TTL_MS = 10 * 60 * 1000;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const CONFIGURATION_DOCUMENT = "googleDriveInventario";

interface UserDocument {
  readonly activo?: boolean;
  readonly roles?: unknown;
}

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

interface OAuthSessionDocument {
  readonly actorUsuarioId?: string;
  readonly estadoHash?: string;
  readonly nonceHash?: string;
  readonly desafioCodigo?: string;
  readonly uriRedireccion?: string;
  readonly tipoSeleccion?: GoogleDriveSelectionKind;
  readonly expiraEn?: Timestamp;
  readonly estado?: string;
  readonly intentos?: number;
  readonly procesamientoId?: string;
  readonly procesandoEn?: Timestamp;
  readonly completadoPayloadHash?: string;
  readonly resultado?: CompleteGoogleDriveOAuthResult;
}

interface ConnectionDocument {
  readonly estado?: GoogleDriveConnectionStatusResult["estado"];
  readonly plantillaId?: string;
  readonly plantillaNombre?: string;
  readonly carpetaId?: string;
  readonly carpetaNombre?: string;
  readonly tokenDisponible?: boolean;
  readonly version?: number;
  readonly actualizadoEn?: Timestamp;
}

export interface DriveOAuthRuntimeConfiguration {
  readonly projectId: string;
  readonly mode: "fake" | "oauth-user";
  readonly clientId: string;
  readonly primaryEmail: string;
  readonly refreshTokenSecret: string;
}

export interface DriveOAuthServiceAccounts {
  readonly writer?: string;
  readonly report?: string;
}

export interface DriveOAuthExchangeInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly selectedFileId: string;
  readonly selectionKind: GoogleDriveSelectionKind;
  readonly grantedScope: string;
}

export interface DriveOAuthExchangeResult {
  readonly refreshToken: string;
  readonly accountEmail: string;
  readonly selectedFileId: string;
  readonly selectedFileName: string;
}

export interface DriveOAuthProvider {
  authorizationUrl(input: {
    readonly redirectUri: string;
    readonly codeChallenge: string;
    readonly state: string;
    readonly selectionKind: GoogleDriveSelectionKind;
  }): string;
  exchangeAndValidate(input: DriveOAuthExchangeInput): Promise<DriveOAuthExchangeResult>;
  storeRefreshToken(refreshToken: string): Promise<void>;
  readRefreshToken(): Promise<string>;
  revokeRefreshToken(refreshToken: string): Promise<void>;
  expectedAccountEmail(): string;
}

export class DriveOAuthInvalidGrantError extends Error {
  constructor() {
    super("OAuth grant is no longer valid.");
    this.name = "DriveOAuthInvalidGrantError";
  }
}

export class DriveOAuthConfigurationError extends Error {
  constructor() {
    super("OAuth configuration is incomplete.");
    this.name = "DriveOAuthConfigurationError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isActiveAdmin(snapshot: DocumentSnapshot): boolean {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const user = snapshot.data() as UserDocument;
  if (user.activo !== true) throw domainErrors.userInactive();
  return Array.isArray(user.roles) && user.roles.length === 1 && user.roles[0] === "ADMINISTRADOR";
}

function assertActiveAdmin(snapshot: DocumentSnapshot): void {
  if (!isActiveAdmin(snapshot)) throw domainErrors.permissionDenied();
}

function configuredProjectId(): string | undefined {
  const gcloud = process.env.GCLOUD_PROJECT?.trim();
  const googleCloud = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (gcloud && googleCloud && gcloud !== googleCloud) return undefined;
  return gcloud || googleCloud;
}

function validServiceAccount(value: string | undefined): value is string {
  return typeof value === "string" &&
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/u.test(value);
}

export function driveOAuthServiceAccountsFromEnvironment(): DriveOAuthServiceAccounts {
  const writer = process.env.GOOGLE_DRIVE_OAUTH_WRITER_SERVICE_ACCOUNT?.trim();
  const report = process.env.GOOGLE_DRIVE_REPORT_SERVICE_ACCOUNT?.trim();
  if (process.env.APP_ENV === "production") {
    if (!validServiceAccount(writer) || !validServiceAccount(report) || writer === report) {
      throw new DriveOAuthConfigurationError();
    }
    return {writer, report};
  }
  return {
    ...(validServiceAccount(writer) ? {writer} : {}),
    ...(validServiceAccount(report) ? {report} : {})
  };
}

export function driveOAuthRuntimeConfigurationFromEnvironment(): DriveOAuthRuntimeConfiguration {
  const emulatorOrCi = process.env.FUNCTIONS_EMULATOR === "true" ||
    (process.env.CI !== undefined && !["", "0", "false"].includes(process.env.CI.toLowerCase()));
  if (emulatorOrCi) {
    if (process.env.GOOGLE_DRIVE_OAUTH_MODE !== undefined && process.env.GOOGLE_DRIVE_OAUTH_MODE !== "fake") {
      throw new DriveOAuthConfigurationError();
    }
    return {
      projectId: configuredProjectId() ?? "demo-vivero-control",
      mode: "fake",
      clientId: "oauth-client-ficticio.apps.googleusercontent.com",
      primaryEmail: "cuenta-prueba@example.invalid",
      refreshTokenSecret: "refresh-token-ficticio"
    };
  }

  const projectId = configuredProjectId();
  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim();
  const primaryEmail = process.env.GOOGLE_DRIVE_INVENTORY_PRIMARY_EMAIL?.trim();
  const refreshTokenSecret = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN_SECRET?.trim();
  driveOAuthServiceAccountsFromEnvironment();
  if (
    projectId !== PRODUCTION_PROJECT_ID ||
    process.env.APP_ENV !== "production" ||
    process.env.GOOGLE_DRIVE_OAUTH_MODE !== "oauth-user" ||
    !clientId?.endsWith(".apps.googleusercontent.com") ||
    !primaryEmail || !primaryEmail.includes("@") ||
    !refreshTokenSecret || !/^[A-Za-z0-9_-]{1,255}$/u.test(refreshTokenSecret)
  ) {
    throw new DriveOAuthConfigurationError();
  }
  return {
    projectId,
    mode: "oauth-user",
    clientId,
    primaryEmail: normalizeEmail(primaryEmail),
    refreshTokenSecret
  };
}

function selectedMimeType(kind: GoogleDriveSelectionKind): string {
  return kind === "PLANTILLA" ? `${XLSX_MIME},${GOOGLE_SHEET_MIME}` : FOLDER_MIME;
}

export function buildGoogleDriveAuthorizationUrl(
  configuration: DriveOAuthRuntimeConfiguration,
  input: {
    readonly redirectUri: string;
    readonly codeChallenge: string;
    readonly state: string;
    readonly selectionKind: GoogleDriveSelectionKind;
  }
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("scope", DRIVE_FILE_SCOPE);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("trigger_onepick", "true");
  url.searchParams.set("allow_multiple", "false");
  url.searchParams.set("mimetypes", selectedMimeType(input.selectionKind));
  if (input.selectionKind === "CARPETA_SALIDA") url.searchParams.set("allow_folder_selection", "true");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  return url.toString();
}

function providerErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("response" in error && typeof error.response === "object" && error.response !== null &&
      "data" in error.response && typeof error.response.data === "object" && error.response.data !== null &&
      "error" in error.response.data && typeof error.response.data.error === "string") {
    return error.response.data.error;
  }
  return "code" in error && typeof error.code === "string" ? error.code : undefined;
}

export class GoogleDriveOAuthProvider implements DriveOAuthProvider {
  private readonly secretManager: SecretManagerServiceClient;

  constructor(
    private readonly configuration: DriveOAuthRuntimeConfiguration,
    secretManager?: SecretManagerServiceClient
  ) {
    this.secretManager = secretManager ?? new SecretManagerServiceClient();
  }

  expectedAccountEmail(): string {
    return this.configuration.primaryEmail;
  }

  authorizationUrl(input: {
    readonly redirectUri: string;
    readonly codeChallenge: string;
    readonly state: string;
    readonly selectionKind: GoogleDriveSelectionKind;
  }): string {
    return buildGoogleDriveAuthorizationUrl(this.configuration, input);
  }

  async exchangeAndValidate(input: DriveOAuthExchangeInput): Promise<DriveOAuthExchangeResult> {
    if (input.grantedScope !== DRIVE_FILE_SCOPE) throw domainErrors.driveOAuthScopeInvalid();
    const client = new OAuth2Client(this.configuration.clientId, undefined, input.redirectUri);
    try {
      const response = await client.getToken({code: input.code, codeVerifier: input.codeVerifier});
      const scopes = new Set((response.tokens.scope ?? "").split(/\s+/u).filter(Boolean));
      if (scopes.size !== 1 || !scopes.has(DRIVE_FILE_SCOPE)) {
        if (response.tokens.refresh_token) await this.revokeRefreshToken(response.tokens.refresh_token);
        throw domainErrors.driveOAuthScopeInvalid();
      }
      if (!response.tokens.refresh_token) throw new DriveOAuthInvalidGrantError();
      client.setCredentials(response.tokens);
      const driveClient = drive({version: "v3", auth: client});
      const about = await driveClient.about.get({fields: "user(emailAddress)"});
      const selected = await driveClient.files.get({
        fileId: input.selectedFileId,
        fields: "id,name,mimeType,trashed,capabilities(canAddChildren,canDownload)",
        supportsAllDrives: true
      });
      const accountEmail = about.data.user?.emailAddress;
      const selectedId = selected.data.id;
      const selectedName = selected.data.name;
      const mimeType = selected.data.mimeType;
      const isTemplate = input.selectionKind === "PLANTILLA" &&
        (mimeType === XLSX_MIME || mimeType === GOOGLE_SHEET_MIME) &&
        selected.data.capabilities?.canDownload !== false;
      const isWritableFolder = input.selectionKind === "CARPETA_SALIDA" &&
        mimeType === FOLDER_MIME && selected.data.capabilities?.canAddChildren === true;
      if (
        typeof accountEmail !== "string" ||
        typeof selectedId !== "string" ||
        typeof selectedName !== "string" || selectedName.trim() === "" ||
        selected.data.trashed === true ||
        (!isTemplate && !isWritableFolder)
      ) {
        await this.revokeRefreshToken(response.tokens.refresh_token);
        throw domainErrors.driveOAuthSelectionInvalid();
      }
      return {
        refreshToken: response.tokens.refresh_token,
        accountEmail,
        selectedFileId: selectedId,
        selectedFileName: selectedName
      };
    } catch (error) {
      if (error instanceof DomainError || error instanceof DriveOAuthInvalidGrantError) throw error;
      if (providerErrorCode(error) === "invalid_grant") throw new DriveOAuthInvalidGrantError();
      throw new Error("Google OAuth request failed.", {cause: error});
    }
  }

  async storeRefreshToken(refreshToken: string): Promise<void> {
    const parent = `projects/${this.configuration.projectId}/secrets/${this.configuration.refreshTokenSecret}`;
    await this.secretManager.addSecretVersion({
      parent,
      payload: {data: Buffer.from(refreshToken, "utf8")}
    });
  }

  async readRefreshToken(): Promise<string> {
    const name = `projects/${this.configuration.projectId}/secrets/` +
      `${this.configuration.refreshTokenSecret}/versions/latest`;
    const [version] = await this.secretManager.accessSecretVersion({name});
    const token = version.payload?.data?.toString("utf8").trim();
    if (!token) throw new DriveOAuthConfigurationError();
    return token;
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const client = new OAuth2Client(this.configuration.clientId);
    try {
      await client.revokeToken(refreshToken);
    } catch (error) {
      const status = typeof error === "object" && error !== null && "response" in error &&
        typeof error.response === "object" && error.response !== null && "status" in error.response
        ? error.response.status : undefined;
      if (status !== 400) throw new Error("OAuth revocation failed.", {cause: error});
    }
  }
}

export class FakeDriveOAuthProvider implements DriveOAuthProvider {
  private static refreshToken = "";

  static reset(): void {
    FakeDriveOAuthProvider.refreshToken = "";
  }

  expectedAccountEmail(): string {
    return "cuenta-prueba@example.invalid";
  }

  authorizationUrl(input: {
    readonly redirectUri: string;
    readonly codeChallenge: string;
    readonly state: string;
    readonly selectionKind: GoogleDriveSelectionKind;
  }): string {
    return buildGoogleDriveAuthorizationUrl(driveOAuthRuntimeConfigurationFromEnvironment(), input);
  }

  async exchangeAndValidate(input: DriveOAuthExchangeInput): Promise<DriveOAuthExchangeResult> {
    if (input.code === "invalid-grant") throw new DriveOAuthInvalidGrantError();
    if (input.grantedScope !== DRIVE_FILE_SCOPE) throw domainErrors.driveOAuthScopeInvalid();
    return {
      refreshToken: "refresh-token-ficticio-no-real",
      accountEmail: this.expectedAccountEmail(),
      selectedFileId: input.selectedFileId,
      selectedFileName: input.selectionKind === "PLANTILLA"
        ? "INVENTARIO PRUEBA.xlsx" : "INVENTARIOS PRUEBA"
    };
  }

  async storeRefreshToken(refreshToken: string): Promise<void> {
    FakeDriveOAuthProvider.refreshToken = refreshToken;
  }

  async readRefreshToken(): Promise<string> {
    // El emulador puede aislar Callables en procesos distintos. Este valor es
    // manifiestamente ficticio y evita persistir incluso el token fake en disco o Firestore.
    return FakeDriveOAuthProvider.refreshToken || "refresh-token-ficticio-no-real";
  }

  async revokeRefreshToken(_refreshToken: string): Promise<void> {
    FakeDriveOAuthProvider.refreshToken = "";
  }
}

export function createDriveOAuthProviderFromEnvironment(): DriveOAuthProvider {
  const configuration = driveOAuthRuntimeConfigurationFromEnvironment();
  return configuration.mode === "fake"
    ? new FakeDriveOAuthProvider()
    : new GoogleDriveOAuthProvider(configuration);
}

function connectionStatus(document: ConnectionDocument | undefined): GoogleDriveConnectionStatusResult {
  if (!document) return {estado: "NO_CONFIGURADO"};
  const result: GoogleDriveConnectionStatusResult = {
    estado: document.estado ?? "NO_CONFIGURADO",
    ...(document.plantillaNombre ? {plantillaNombre: document.plantillaNombre} : {}),
    ...(document.carpetaNombre ? {carpetaNombre: document.carpetaNombre} : {}),
    ...(document.actualizadoEn instanceof Timestamp
      ? {actualizadoEn: document.actualizadoEn.toDate().toISOString()} : {})
  };
  return result;
}

function sessionIdFromState(state: string): string {
  const [sessionId, randomState, nonce, ...extra] = state.split(".");
  if (
    extra.length > 0 ||
    !sessionId || !/^[0-9a-f-]{36}$/u.test(sessionId) ||
    !randomState || randomState.length < 32 ||
    !nonce || nonce.length < 32
  ) throw domainErrors.driveOAuthStateInvalid();
  return sessionId;
}

export class StartGoogleDriveOAuthService {
  constructor(
    private readonly firestore: Firestore,
    private readonly provider: DriveOAuthProvider = createDriveOAuthProviderFromEnvironment()
  ) {}

  async execute(
    request: StartGoogleDriveOAuthRequest,
    context: TrustedOperationContext
  ): Promise<StartGoogleDriveOAuthResult> {
    const sessionId = randomUUID();
    const nonce = randomBase64Url(32);
    const state = `${sessionId}.${randomBase64Url(32)}.${nonce}`;
    const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_TTL_MS);
    const result: StartGoogleDriveOAuthResult = {
      urlAutorizacion: this.provider.authorizationUrl({
        redirectUri: request.uriRedireccion,
        codeChallenge: request.desafioCodigo,
        state,
        selectionKind: request.tipoSeleccion
      }),
      expiraEn: expiresAt.toDate().toISOString()
    };
    const payloadHash = sha256(JSON.stringify({
      tipoSeleccion: request.tipoSeleccion,
      uriRedireccion: request.uriRedireccion,
      desafioCodigo: request.desafioCodigo
    }));
    const idempotencyId = sha256(`${context.actorId}:INICIAR_OAUTH_DRIVE:${request.claveIdempotencia}`);

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actor, previous] = await transaction.getAll(actorRef, idempotencyRef);
      if (!actor || !previous) throw domainErrors.internal();
      assertActiveAdmin(actor);
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument<StartGoogleDriveOAuthResult>;
        if (stored.payloadHash !== payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      const now = Timestamp.now();
      transaction.create(this.firestore.collection("sesionesOAuthDrive").doc(sessionId), {
        id: sessionId,
        actorUsuarioId: context.actorId,
        tipoSeleccion: request.tipoSeleccion,
        uriRedireccion: request.uriRedireccion,
        desafioCodigo: request.desafioCodigo,
        estadoHash: sha256(state),
        nonceHash: sha256(nonce),
        estado: "PENDIENTE",
        intentos: 0,
        creadoEn: now,
        expiraEn: expiresAt
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "INICIAR_OAUTH_DRIVE",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}

export class CompleteGoogleDriveOAuthService {
  constructor(
    private readonly firestore: Firestore,
    private readonly provider: DriveOAuthProvider = createDriveOAuthProviderFromEnvironment()
  ) {}

  async execute(
    request: CompleteGoogleDriveOAuthRequest,
    context: TrustedOperationContext
  ): Promise<CompleteGoogleDriveOAuthResult> {
    const sessionId = sessionIdFromState(request.estado);
    const payloadHash = sha256(JSON.stringify({
      estadoHash: sha256(request.estado),
      codigoHash: sha256(request.codigoAutorizacion),
      verificadorHash: sha256(request.verificadorCodigo),
      uriRedireccion: request.uriRedireccion,
      idsSeleccionados: request.idsSeleccionados,
      alcanceConcedido: request.alcanceConcedido
    }));
    const processingId = randomUUID();

    const selectionKind = await this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const sessionRef = this.firestore.collection("sesionesOAuthDrive").doc(sessionId);
      const [actor, sessionSnapshot] = await transaction.getAll(actorRef, sessionRef);
      if (!actor || !sessionSnapshot) throw domainErrors.internal();
      assertActiveAdmin(actor);
      if (!sessionSnapshot.exists) throw domainErrors.driveOAuthStateInvalid();
      const session = sessionSnapshot.data() as OAuthSessionDocument;
      if (
        session.actorUsuarioId !== context.actorId ||
        session.estadoHash !== sha256(request.estado) ||
        session.uriRedireccion !== request.uriRedireccion ||
        session.desafioCodigo !== pkceChallenge(request.verificadorCodigo)
      ) throw domainErrors.driveOAuthStateInvalid();
      const nonce = request.estado.split(".")[2] ?? "";
      if (session.nonceHash !== sha256(nonce)) throw domainErrors.driveOAuthStateInvalid();
      if (!(session.expiraEn instanceof Timestamp) || session.expiraEn.toMillis() <= Date.now()) {
        throw domainErrors.driveOAuthSessionExpired();
      }
      if (session.estado === "COMPLETADA") {
        if (session.completadoPayloadHash !== payloadHash || !session.resultado) {
          throw domainErrors.idempotencyConflict();
        }
        return {kind: session.tipoSeleccion as GoogleDriveSelectionKind, result: session.resultado};
      }
      const activeLease = session.estado === "PROCESANDO" && session.procesandoEn instanceof Timestamp &&
        Date.now() - session.procesandoEn.toMillis() < PROCESSING_LEASE_MS;
      if (activeLease) throw domainErrors.driveOAuthSessionInProgress();
      if (session.estado === "ERROR_REQUIERE_RECONEXION") throw domainErrors.driveOAuthInvalidGrant();
      if (session.tipoSeleccion !== "PLANTILLA" && session.tipoSeleccion !== "CARPETA_SALIDA") {
        throw domainErrors.internal();
      }
      transaction.update(sessionRef, {
        estado: "PROCESANDO",
        procesamientoId: processingId,
        procesandoEn: Timestamp.now(),
        intentos: (session.intentos ?? 0) + 1,
        completadoPayloadHash: payloadHash
      });
      return {kind: session.tipoSeleccion};
    });
    if ("result" in selectionKind && selectionKind.result) return selectionKind.result;

    let exchanged: DriveOAuthExchangeResult;
    try {
      exchanged = await this.provider.exchangeAndValidate({
        code: request.codigoAutorizacion,
        codeVerifier: request.verificadorCodigo,
        redirectUri: request.uriRedireccion,
        selectedFileId: request.idsSeleccionados[0],
        selectionKind: selectionKind.kind,
        grantedScope: request.alcanceConcedido
      });
      if (normalizeEmail(exchanged.accountEmail) !== normalizeEmail(this.provider.expectedAccountEmail())) {
        await this.provider.revokeRefreshToken(exchanged.refreshToken).catch(() => undefined);
        throw domainErrors.driveOAuthAccountMismatch();
      }
      await this.provider.storeRefreshToken(exchanged.refreshToken);
    } catch (error) {
      await this.markFailedSession(sessionId, processingId);
      if (error instanceof DomainError) throw error;
      if (error instanceof DriveOAuthInvalidGrantError) throw domainErrors.driveOAuthInvalidGrant();
      if (error instanceof DriveOAuthConfigurationError) throw domainErrors.driveOAuthConfigurationRequired();
      throw domainErrors.internal();
    }

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const sessionRef = this.firestore.collection("sesionesOAuthDrive").doc(sessionId);
      const configurationRef = this.firestore.collection("configuracionesIntegraciones").doc(CONFIGURATION_DOCUMENT);
      const [actor, sessionSnapshot, configurationSnapshot] = await transaction.getAll(
        actorRef, sessionRef, configurationRef
      );
      if (!actor || !sessionSnapshot || !configurationSnapshot) throw domainErrors.internal();
      assertActiveAdmin(actor);
      const session = sessionSnapshot.data() as OAuthSessionDocument;
      if (session.estado !== "PROCESANDO" || session.procesamientoId !== processingId) {
        if (session.estado === "COMPLETADA" && session.resultado) return session.resultado;
        throw domainErrors.driveOAuthStateInvalid();
      }
      const current = (configurationSnapshot.data() ?? {}) as ConnectionDocument;
      const resetPreviousSelection = current.estado === "REVOCADO" || current.estado === "REQUIERE_RECONEXION";
      const nextTemplateId = selectionKind.kind === "PLANTILLA"
        ? exchanged.selectedFileId : resetPreviousSelection ? undefined : current.plantillaId;
      const nextTemplateName = selectionKind.kind === "PLANTILLA"
        ? exchanged.selectedFileName : resetPreviousSelection ? undefined : current.plantillaNombre;
      const nextFolderId = selectionKind.kind === "CARPETA_SALIDA"
        ? exchanged.selectedFileId : resetPreviousSelection ? undefined : current.carpetaId;
      const nextFolderName = selectionKind.kind === "CARPETA_SALIDA"
        ? exchanged.selectedFileName : resetPreviousSelection ? undefined : current.carpetaNombre;
      const connectionState = nextTemplateId && nextFolderId ? "LISTO" : "CONECTADO_INCOMPLETO";
      const now = Timestamp.now();
      const result: CompleteGoogleDriveOAuthResult = {
        estado: connectionState,
        tipoSeleccion: selectionKind.kind,
        nombreSeleccion: exchanged.selectedFileName,
        actualizadoEn: now.toDate().toISOString()
      };
      const version = Number.isSafeInteger(current.version) ? (current.version as number) + 1 : 1;
      transaction.set(configurationRef, {
        id: CONFIGURATION_DOCUMENT,
        estado: connectionState,
        tokenDisponible: true,
        cuentaCoincide: true,
        version,
        actualizadoEn: now,
        actualizadoPorUsuarioId: context.actorId,
        plantillaId: nextTemplateId ?? FieldValue.delete(),
        plantillaNombre: nextTemplateName ?? FieldValue.delete(),
        carpetaId: nextFolderId ?? FieldValue.delete(),
        carpetaNombre: nextFolderName ?? FieldValue.delete()
      }, {merge: true});
      transaction.update(sessionRef, {
        estado: "COMPLETADA",
        resultado: result,
        completadoEn: now,
        procesamientoId: FieldValue.delete(),
        procesandoEn: FieldValue.delete()
      });
      const auditId = randomUUID();
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: selectionKind.kind === "PLANTILLA"
          ? "GOOGLE_DRIVE_PLANTILLA_SELECCIONADA" : "GOOGLE_DRIVE_CARPETA_SELECCIONADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "INTEGRACION_GOOGLE_DRIVE",
        recursoId: CONFIGURATION_DOCUMENT,
        ocurridoEn: now,
        metadatos: {tipoSeleccion: selectionKind.kind, estado: connectionState, version}
      });
      return result;
    });
  }

  private async markFailedSession(sessionId: string, processingId: string): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const ref = this.firestore.collection("sesionesOAuthDrive").doc(sessionId);
      const snapshot = await transaction.get(ref);
      const current = snapshot.data() as OAuthSessionDocument | undefined;
      if (!snapshot.exists || current?.estado !== "PROCESANDO" || current.procesamientoId !== processingId) return;
      transaction.update(ref, {
        estado: "ERROR_REQUIERE_RECONEXION",
        errorCodigo: "REQUIERE_RECONEXION",
        actualizadoEn: Timestamp.now(),
        procesamientoId: FieldValue.delete(),
        procesandoEn: FieldValue.delete()
      });
    });
  }
}

export class GetGoogleDriveConnectionStatusService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<GoogleDriveConnectionStatusResult> {
    const [actor, configuration] = await Promise.all([
      this.firestore.collection("usuarios").doc(context.actorId).get(),
      this.firestore.collection("configuracionesIntegraciones").doc(CONFIGURATION_DOCUMENT).get()
    ]);
    assertActiveAdmin(actor);
    return connectionStatus(configuration.exists ? configuration.data() as ConnectionDocument : undefined);
  }
}

export class RevokeGoogleDriveOAuthService {
  constructor(
    private readonly firestore: Firestore,
    private readonly provider: DriveOAuthProvider = createDriveOAuthProviderFromEnvironment()
  ) {}

  async execute(
    request: RevokeGoogleDriveOAuthRequest,
    context: TrustedOperationContext
  ): Promise<RevokeGoogleDriveOAuthResult> {
    const idempotencyId = sha256(`${context.actorId}:REVOCAR_OAUTH_DRIVE:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({operacion: "REVOCAR_OAUTH_DRIVE"}));
    const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
    const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
    const configurationRef = this.firestore.collection("configuracionesIntegraciones").doc(CONFIGURATION_DOCUMENT);
    const [actor, previous, configuration] = await Promise.all([
      actorRef.get(), idempotencyRef.get(), configurationRef.get()
    ]);
    assertActiveAdmin(actor);
    if (previous.exists) {
      const stored = previous.data() as IdempotencyDocument<RevokeGoogleDriveOAuthResult>;
      if (stored.payloadHash !== payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
      return stored.resultado;
    }
    const current = configuration.data() as ConnectionDocument | undefined;
    if (!configuration.exists || current?.tokenDisponible !== true || current.estado === "REVOCADO") {
      throw domainErrors.driveOAuthNotConnected();
    }
    let refreshToken: string;
    try {
      refreshToken = await this.provider.readRefreshToken();
      await this.provider.revokeRefreshToken(refreshToken);
    } catch (error) {
      if (error instanceof DriveOAuthInvalidGrantError) {
        // Un grant ya invÃ¡lido equivale a una revocaciÃ³n efectiva.
      } else if (error instanceof DriveOAuthConfigurationError) {
        throw domainErrors.driveOAuthConfigurationRequired();
      } else {
        throw domainErrors.internal();
      }
    }

    return this.firestore.runTransaction(async (transaction) => {
      const [freshActor, freshPrevious, freshConfiguration] = await transaction.getAll(
        actorRef, idempotencyRef, configurationRef
      );
      if (!freshActor || !freshPrevious || !freshConfiguration) throw domainErrors.internal();
      assertActiveAdmin(freshActor);
      if (freshPrevious.exists) {
        const stored = freshPrevious.data() as IdempotencyDocument<RevokeGoogleDriveOAuthResult>;
        if (stored.payloadHash !== payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      const freshCurrent = freshConfiguration.data() as ConnectionDocument | undefined;
      if (
        !freshConfiguration.exists || freshCurrent?.tokenDisponible !== true ||
        freshCurrent.estado === "REVOCADO"
      ) throw domainErrors.driveOAuthNotConnected();
      const now = Timestamp.now();
      const result: RevokeGoogleDriveOAuthResult = {
        estado: "REVOCADO",
        revocadaEn: now.toDate().toISOString()
      };
      transaction.set(configurationRef, {
        estado: "REVOCADO",
        tokenDisponible: false,
        actualizadoEn: now,
        actualizadoPorUsuarioId: context.actorId,
        revocadaEn: now,
        revocadaPorUsuarioId: context.actorId
      }, {merge: true});
      const auditId = randomUUID();
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "GOOGLE_DRIVE_AUTORIZACION_REVOCADA",
        actorUsuarioId: context.actorId,
        recursoTipo: "INTEGRACION_GOOGLE_DRIVE",
        recursoId: CONFIGURATION_DOCUMENT,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {estado: "REVOCADO"}
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "REVOCAR_OAUTH_DRIVE",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}

export async function readGoogleDriveConnectionConfiguration(
  firestore: Firestore
): Promise<{readonly templateFileId: string; readonly folderId: string}> {
  const snapshot = await firestore.collection("configuracionesIntegraciones").doc(CONFIGURATION_DOCUMENT).get();
  const configuration = snapshot.data() as ConnectionDocument | undefined;
  if (
    !snapshot.exists || configuration?.estado !== "LISTO" || configuration.tokenDisponible !== true ||
    typeof configuration.plantillaId !== "string" || typeof configuration.carpetaId !== "string"
  ) throw new DriveOAuthConfigurationError();
  return {templateFileId: configuration.plantillaId, folderId: configuration.carpetaId};
}

export async function createAuthorizedDriveClient(provider: DriveOAuthProvider) {
  const configuration = driveOAuthRuntimeConfigurationFromEnvironment();
  const refreshToken = await provider.readRefreshToken();
  const client = new OAuth2Client(configuration.clientId);
  client.setCredentials({refresh_token: refreshToken});
  return drive({version: "v3", auth: client});
}

export function markConnectionRequiresReconnectData(): DocumentData {
  return {
    estado: "REQUIERE_RECONEXION",
    tokenDisponible: false,
    actualizadoEn: Timestamp.now(),
    errorCodigo: "OAUTH_REQUIERE_RECONEXION"
  };
}
