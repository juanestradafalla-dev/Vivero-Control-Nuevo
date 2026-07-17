import {describe, expect, it} from "vitest";

import type {MigrationCatalogPackageV1} from "../src/domain/contracts.js";
import {
  type CurrentCatalog,
  validateMigrationPackage
} from "../src/domain/migrationPreflight.js";

const emptyQuery = {docs: []};
const current = {
  locations: emptyQuery,
  lines: emptyQuery,
  inventories: emptyQuery,
  occupations: emptyQuery,
  journeyLines: emptyQuery,
  journeys: emptyQuery
} as unknown as CurrentCatalog;

function packageWithInventory(
  inventory: MigrationCatalogPackageV1["inventariosIniciales"][number]
): MigrationCatalogPackageV1 {
  return {
    formato: "paquete-migracion-catalogo-v1",
    metadatos: {
      nombrePaquete: "PRUEBA UNITARIA FICTICIA",
      creadoEn: "2026-07-17T12:00:00.000Z",
      referenciaFuente: "Fuente ficticia para prueba unitaria"
    },
    ubicaciones: [{
      claveExterna: "UB-PRUEBA",
      ubicacionPadreClaveExterna: null,
      codigo: "UB-PRUEBA",
      tipo: "MODULO",
      nombreVisible: "Ubicación ficticia",
      orden: 1,
      activa: true
    }],
    lineas: [{
      claveExterna: "LINEA-PRUEBA",
      ubicacionClaveExterna: "UB-PRUEBA",
      codigo: "LINEA-PRUEBA",
      nombreVisible: "Línea ficticia",
      orden: 1,
      activa: true
    }],
    inventariosIniciales: [inventory]
  };
}

const source = "Fuente ficticia trazable";

describe("preflight puro de líneas vacías confirmadas", () => {
  it("bloquea el cero no confirmado", () => {
    const result = validateMigrationPackage(packageWithInventory({
      lineaClaveExterna: "LINEA-PRUEBA",
      hembras: 0,
      machos: 0,
      patrones: 0,
      referenciaFuente: source
    }), current);
    expect(result.aptoParaImportar).toBe(false);
    expect(result.erroresBloqueantes.map((issue) => issue.codigo)).toContain("TOTAL_CERO");
  });

  it("admite el cero confirmado con advertencia", () => {
    const result = validateMigrationPackage(packageWithInventory({
      lineaClaveExterna: "LINEA-PRUEBA",
      hembras: 0,
      machos: 0,
      patrones: 0,
      referenciaFuente: source,
      lineaVaciaConfirmada: true
    }), current);
    expect(result.aptoParaImportar).toBe(true);
    expect(result.erroresBloqueantes).toEqual([]);
    expect(result.advertencias.map((issue) => issue.codigo)).toContain("LINEA_VACIA_CONFIRMADA");
  });

  it("bloquea cantidades positivas marcadas como vacías", () => {
    const result = validateMigrationPackage(packageWithInventory({
      lineaClaveExterna: "LINEA-PRUEBA",
      hembras: 1,
      machos: 0,
      patrones: 0,
      referenciaFuente: source,
      lineaVaciaConfirmada: true
    }), current);
    expect(result.aptoParaImportar).toBe(false);
    expect(result.erroresBloqueantes.map((issue) => issue.codigo))
      .toContain("CONFIRMACION_VACIA_INCOMPATIBLE");
  });
});
