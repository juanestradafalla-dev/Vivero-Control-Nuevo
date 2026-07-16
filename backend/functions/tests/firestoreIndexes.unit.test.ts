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
