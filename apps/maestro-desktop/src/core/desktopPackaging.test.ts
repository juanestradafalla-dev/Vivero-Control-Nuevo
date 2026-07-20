import {describe, expect, it} from "vitest";

import builderConfig from "../../electron-builder.yml?raw";
import electronMain from "../../electron/main.ts?raw";
import electronPreload from "../../electron/preload.cts?raw";

describe("identidad de empaquetado de Vivero Maestro", () => {
  it("prepara la identidad final sin firma ni publicación", () => {
    expect(builderConfig).toContain("appId: com.arles.viveromaestro\n");
    expect(builderConfig).toContain("productName: Vivero Maestro\n");
    expect(builderConfig).toContain("artifactName: Vivero-Maestro-Setup-${version}.${ext}\n");
    expect(builderConfig).toContain("executableName: Vivero Maestro\n");
    expect(builderConfig).toContain("signAndEditExecutable: false\n");
    expect(builderConfig.toLocaleLowerCase("es")).not.toContain("staging");
  });

  it("abre informes solo mediante IPC y una lista exacta de hosts externos", () => {
    expect(electronPreload).toContain('ipcRenderer.invoke("vivero:open-external-url", url)');
    expect(electronMain).toContain('new Set(["drive.google.com", "docs.google.com"])');
    expect(electronMain).toContain('target.protocol !== "https:"');
    expect(electronMain).toContain("shell.openExternal(target.toString())");
    expect(electronMain).not.toContain('new Set(["*"])');
  });

  it("autoriza Drive en el navegador del sistema con loopback, PKCE y drive.file", () => {
    expect(electronPreload).toContain('ipcRenderer.invoke("vivero:prepare-google-drive-oauth")');
    expect(electronPreload).toContain('ipcRenderer.invoke("vivero:open-google-drive-oauth"');
    expect(electronMain).toContain('createServer((request, response) =>');
    expect(electronMain).toContain('server.listen(0, "127.0.0.1"');
    expect(electronMain).toContain('target.hostname !== "accounts.google.com"');
    expect(electronMain).toContain('target.searchParams.get("scope") !== driveFileScope');
    expect(electronMain).toContain('target.searchParams.get("code_challenge_method") !== "S256"');
    expect(electronMain).toContain("shell.openExternal(target.toString())");
    expect(electronMain.toLocaleLowerCase("es")).not.toContain("webview");
  });
});
