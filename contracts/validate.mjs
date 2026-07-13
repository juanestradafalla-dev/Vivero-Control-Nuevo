import {createSchemaRegistry} from "./src/schema-registry.mjs";

const registry = await createSchemaRegistry();

console.log(
  `Esquemas Draft 2020-12 compilados con Ajv: ${registry.entityCount} entidades, ${registry.schemaCount - registry.entityCount} esquema común y ${registry.enumCount} enumeraciones. Referencias resueltas correctamente.`
);
