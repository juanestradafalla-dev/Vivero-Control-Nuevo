import { contextBridge } from "electron";

const foundationApi = Object.freeze({
  getRuntimeStatus: (): string => "Sin Firebase configurado",
});

contextBridge.exposeInMainWorld("viveroFoundation", foundationApi);
