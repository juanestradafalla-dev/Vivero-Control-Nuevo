import { contextBridge } from "electron";

const foundationApi = Object.freeze({
  getRuntimeStatus: (): string => "Emuladores locales requeridos",
});

contextBridge.exposeInMainWorld("viveroFoundation", foundationApi);
