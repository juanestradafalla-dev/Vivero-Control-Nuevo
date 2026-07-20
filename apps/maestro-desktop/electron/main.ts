import {app, BrowserWindow, ipcMain, session, shell} from "electron";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {createServer, type Server} from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env.VITE_DEV_SERVER_URL;
const allowedExternalHosts = new Set(["drive.google.com", "docs.google.com"]);
const driveFileScope = "https://www.googleapis.com/auth/drive.file";
const oauthCallbackPath = "/";
const oauthSessionTimeoutMs = 10 * 60 * 1000;

interface OAuthCallbackSuccess {
  readonly ok: true;
  readonly state: string;
  readonly authorizationCode: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly selectedFileIds: readonly [string];
  readonly grantedScope: typeof driveFileScope;
}

interface OAuthCallbackFailure {
  readonly ok: false;
  readonly errorCode: "CANCELLED" | "INVALID_CALLBACK" | "EXPIRED";
}

interface PendingOAuth {
  readonly server: Server;
  readonly redirectUri: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly result: Promise<OAuthCallbackSuccess | OAuthCallbackFailure>;
  readonly resolve: (result: OAuthCallbackSuccess | OAuthCallbackFailure) => void;
  expectedState?: string;
  timeout: NodeJS.Timeout;
}

const pendingOAuth = new Map<string, PendingOAuth>();

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function closePendingOAuth(sessionId: string): void {
  const pending = pendingOAuth.get(sessionId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pending.server.close();
  pendingOAuth.delete(sessionId);
}

ipcMain.handle("vivero:prepare-google-drive-oauth", async () => {
  if (pendingOAuth.size >= 3) throw new Error("Hay demasiadas autorizaciones pendientes.");
  const localSessionId = randomUUID();
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = pkceChallenge(codeVerifier);
  let resolveResult!: (result: OAuthCallbackSuccess | OAuthCallbackFailure) => void;
  const result = new Promise<OAuthCallbackSuccess | OAuthCallbackFailure>((resolve) => {
    resolveResult = resolve;
  });
  const server = createServer((request, response) => {
    const pending = pendingOAuth.get(localSessionId);
    const address = server.address();
    if (!pending || typeof address !== "object" || address === null || request.method !== "GET") {
      response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
      response.end("Solicitud OAuth no valida.");
      return;
    }
    const callback = new URL(request.url ?? "/", pending.redirectUri);
    if (callback.pathname !== oauthCallbackPath || callback.origin !== new URL(pending.redirectUri).origin) {
      response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
      response.end("Ruta OAuth no valida.");
      return;
    }
    const error = callback.searchParams.get("error");
    if (error) {
      response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
      response.end("<!doctype html><meta charset=utf-8><title>Vivero Maestro</title>" +
        "<p>La autorizacion fue cancelada. Puedes cerrar esta ventana.</p>");
      pending.resolve({ok: false, errorCode: "CANCELLED"});
      closePendingOAuth(localSessionId);
      return;
    }
    const state = callback.searchParams.get("state") ?? "";
    const authorizationCode = callback.searchParams.get("code") ?? "";
    const grantedScope = callback.searchParams.get("scope") ?? "";
    const picked = (callback.searchParams.get("picked_file_ids") ?? "").split(",").filter(Boolean);
    if (
      !pending.expectedState || state !== pending.expectedState || state.length > 300 ||
      authorizationCode.length < 8 || authorizationCode.length > 2048 ||
      grantedScope !== driveFileScope || picked.length !== 1 || picked[0].length > 240
    ) {
      response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
      response.end("Respuesta OAuth no valida.");
      pending.resolve({ok: false, errorCode: "INVALID_CALLBACK"});
      closePendingOAuth(localSessionId);
      return;
    }
    response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
    response.end("<!doctype html><meta charset=utf-8><title>Vivero Maestro</title>" +
      "<p>Google Drive fue autorizado. Regresa a Vivero Maestro y cierra esta ventana.</p>");
    pending.resolve({
      ok: true,
      state,
      authorizationCode,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
      selectedFileIds: [picked[0]],
      grantedScope: driveFileScope
    });
    closePendingOAuth(localSessionId);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    server.close();
    throw new Error("No fue posible preparar el retorno OAuth local.");
  }
  const redirectUri = `http://127.0.0.1:${address.port}${oauthCallbackPath}`;
  const timeout = setTimeout(() => {
    const pending = pendingOAuth.get(localSessionId);
    pending?.resolve({ok: false, errorCode: "EXPIRED"});
    closePendingOAuth(localSessionId);
  }, oauthSessionTimeoutMs);
  pendingOAuth.set(localSessionId, {
    server,
    redirectUri,
    codeVerifier,
    codeChallenge,
    result,
    resolve: resolveResult,
    timeout
  });
  return {localSessionId, redirectUri, codeChallenge};
});

ipcMain.handle(
  "vivero:open-google-drive-oauth",
  async (_event, localSessionId: unknown, authorizationUrl: unknown) => {
    if (typeof localSessionId !== "string" || typeof authorizationUrl !== "string") {
      return {ok: false, errorCode: "INVALID_CALLBACK"} satisfies OAuthCallbackFailure;
    }
    const pending = pendingOAuth.get(localSessionId);
    if (!pending) return {ok: false, errorCode: "EXPIRED"} satisfies OAuthCallbackFailure;
    try {
      const target = new URL(authorizationUrl);
      if (
        target.protocol !== "https:" || target.hostname !== "accounts.google.com" ||
        target.pathname !== "/o/oauth2/v2/auth" || target.port !== "" ||
        target.username !== "" || target.password !== "" ||
        target.searchParams.get("scope") !== driveFileScope ||
        target.searchParams.get("response_type") !== "code" ||
        target.searchParams.get("redirect_uri") !== pending.redirectUri ||
        target.searchParams.get("code_challenge") !== pending.codeChallenge ||
        target.searchParams.get("code_challenge_method") !== "S256" ||
        target.searchParams.get("trigger_onepick") !== "true" ||
        target.searchParams.get("include_granted_scopes") !== "false"
      ) throw new Error("URL OAuth no permitida.");
      const state = target.searchParams.get("state");
      if (!state || state.length > 300) throw new Error("Estado OAuth no permitido.");
      pending.expectedState = state;
      await shell.openExternal(target.toString());
      return await pending.result;
    } catch {
      closePendingOAuth(localSessionId);
      return {ok: false, errorCode: "INVALID_CALLBACK"} satisfies OAuthCallbackFailure;
    }
  }
);

ipcMain.handle("vivero:open-external-url", async (_event, value: unknown): Promise<boolean> => {
  if (typeof value !== "string") return false;
  try {
    const target = new URL(value);
    if (
      target.protocol !== "https:" ||
      !allowedExternalHosts.has(target.hostname) ||
      target.port !== "" ||
      target.username !== "" ||
      target.password !== ""
    ) return false;
    await shell.openExternal(target.toString());
    return true;
  } catch {
    return false;
  }
});

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: "Vivero Maestro",
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  window.once("ready-to-show", () => window.show());

  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(join(currentDirectory, "../dist/index.html"));
  }

  return window;
}

app.enableSandbox();

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  for (const sessionId of pendingOAuth.keys()) closePendingOAuth(sessionId);
  if (process.platform !== "darwin") {
    app.quit();
  }
});
