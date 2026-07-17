import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

interface FieldIndex {
  order: "ASCENDING" | "DESCENDING";
  queryScope: "COLLECTION" | "COLLECTION_GROUP";
}

interface FieldOverride {
  collectionGroup: string;
  fieldPath: string;
  indexes: FieldIndex[];
}

interface FirestoreIndexes {
  indexes: Array<{
    collectionGroup: string;
    queryScope: "COLLECTION" | "COLLECTION_GROUP";
    fields: Array<{fieldPath: string; order: "ASCENDING" | "DESCENDING"}>;
  }>;
  fieldOverrides: FieldOverride[];
}

describe("índices de autorizaciones", () => {
  it("habilita usuarioId para collection group y conserva los índices collection", () => {
    const path = resolve(process.cwd(), "../firestore.indexes.json");
    const config = JSON.parse(readFileSync(path, "utf8")) as FirestoreIndexes;
    const override = config.fieldOverrides.find((candidate) =>
      candidate.collectionGroup === "autorizaciones" && candidate.fieldPath === "usuarioId"
    );

    expect(override).toBeDefined();
    expect(override?.indexes).toEqual(expect.arrayContaining([
      {order: "ASCENDING", queryScope: "COLLECTION"},
      {order: "DESCENDING", queryScope: "COLLECTION"},
      {order: "ASCENDING", queryScope: "COLLECTION_GROUP"}
    ]));
    expect(override?.indexes).toHaveLength(3);
  });
});

describe("índices de descartes", () => {
  it("cubre revisión pendiente e historial del autor", () => {
    const path = resolve(process.cwd(), "../firestore.indexes.json");
    const config = JSON.parse(readFileSync(path, "utf8")) as FirestoreIndexes;
    const discardIndexes = config.indexes.filter((candidate) => candidate.collectionGroup === "descartes");

    expect(discardIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fields: [
          {fieldPath: "estado", order: "ASCENDING"},
          {fieldPath: "recibidoEn", order: "DESCENDING"}
        ]
      }),
      expect.objectContaining({
        fields: [
          {fieldPath: "autorUsuarioId", order: "ASCENDING"},
          {fieldPath: "recibidoEn", order: "DESCENDING"}
        ]
      })
    ]));
  });
});
