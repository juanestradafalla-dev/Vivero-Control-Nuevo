import {describe, expect, it} from "vitest";

import builderConfig from "../../electron-builder.yml?raw";

describe("identidad de empaquetado de Vivero Maestro", () => {
  it("prepara la identidad final sin firma ni publicación", () => {
    expect(builderConfig).toContain("appId: com.arles.viveromaestro\n");
    expect(builderConfig).toContain("productName: Vivero Maestro\n");
    expect(builderConfig).toContain("artifactName: Vivero-Maestro-Setup-${version}.${ext}\n");
    expect(builderConfig).toContain("executableName: Vivero Maestro\n");
    expect(builderConfig).toContain("signAndEditExecutable: false\n");
    expect(builderConfig.toLocaleLowerCase("es")).not.toContain("staging");
  });
});
