import {contextBridge, ipcRenderer} from "electron";

const foundationApi = Object.freeze({
  getRuntimeStatus: (): string => "Emuladores locales requeridos",
  openExternalUrl: (url: string): Promise<boolean> => ipcRenderer.invoke("vivero:open-external-url", url),
  prepareGoogleDriveOAuth: () => ipcRenderer.invoke("vivero:prepare-google-drive-oauth"),
  openGoogleDriveOAuth: (localSessionId: string, authorizationUrl: string) =>
    ipcRenderer.invoke("vivero:open-google-drive-oauth", localSessionId, authorizationUrl),
});

contextBridge.exposeInMainWorld("viveroFoundation", foundationApi);
