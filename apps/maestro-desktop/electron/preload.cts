import {contextBridge, ipcRenderer} from "electron";

const foundationApi = Object.freeze({
  getRuntimeStatus: (): string => "Emuladores locales requeridos",
  openExternalUrl: (url: string): Promise<boolean> => ipcRenderer.invoke("vivero:open-external-url", url),
});

contextBridge.exposeInMainWorld("viveroFoundation", foundationApi);
