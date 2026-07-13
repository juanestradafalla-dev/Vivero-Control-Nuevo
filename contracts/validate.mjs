import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";

const root = new URL(".", import.meta.url);
const expectedSchemas = [
  "usuario.schema.json",
  "ubicacion.schema.json",
  "linea.schema.json",
  "jornada.schema.json",
  "linea-jornada.schema.json",
  "reserva.schema.json",
  "conteo.schema.json",
  "decision-revision.schema.json",
  "inventario-oficial-linea.schema.json",
  "movimiento-historico.schema.json",
  "evento-auditoria.schema.json"
];

const expectedEnums = new Map([
  ["estados-linea.json", ["DISPONIBLE", "EN_CONTEO", "PENDIENTE_REVISION", "DEVUELTA", "APROBADA"]],
  ["estados-sincronizacion.json", ["PENDIENTE", "SINCRONIZANDO", "ENVIADA", "ERROR"]],
  ["roles.json", ["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]]
]);

async function parseJson(directory, filename) {
  const path = join(directory, filename);
  const content = await readFile(new URL(path, root), "utf8");
  const parsed = JSON.parse(content);
  if (parsed.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${path} no declara JSON Schema Draft 2020-12`);
  }
  if (typeof parsed.$id !== "string" || parsed.$id.length === 0) {
    throw new Error(`${path} no contiene un $id válido`);
  }
  return parsed;
}

const schemaFiles = await readdir(new URL("schemas/", root));
for (const filename of expectedSchemas) {
  if (!schemaFiles.includes(filename)) {
    throw new Error(`Falta el contrato obligatorio schemas/${filename}`);
  }
}
for (const filename of schemaFiles.filter((name) => name.endsWith(".json"))) {
  await parseJson("schemas", filename);
}

for (const [filename, values] of expectedEnums) {
  const parsed = await parseJson("enums", filename);
  if (JSON.stringify(parsed.enum) !== JSON.stringify(values)) {
    throw new Error(`Los valores de enums/${filename} no coinciden con la ETAPA 2`);
  }
}

console.log(`Contratos válidos: ${expectedSchemas.length} entidades y ${expectedEnums.size} enumeraciones.`);
