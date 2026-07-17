import {access, mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {
  assertPrivateDataPath,
  buildPrivateMigrationPackage,
  createOwnerDataTemplate,
  sanitizedOwnerSummary,
  validateOwnerData,
} from "./preparation-core.mjs";

const toolDirectory = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(toolDirectory, "../../../..");

function parseArguments(args) {
  const parsed = {action: "", input: "", output: "", summary: "", markdown: ""};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--action") parsed.action = args[index + 1] ?? "";
    if (key === "--input") parsed.input = args[index + 1] ?? "";
    if (key === "--output") parsed.output = args[index + 1] ?? "";
    if (key === "--summary") parsed.summary = args[index + 1] ?? "";
    if (key === "--markdown") parsed.markdown = args[index + 1] ?? "";
  }
  if (!["init", "validate", "package"].includes(parsed.action)) {
    throw new Error("ACCION_LOCAL_NO_PERMITIDA");
  }
  return parsed;
}

function privatePath(value, extensions) {
  if (!value) throw new Error("RUTA_PRIVADA_REQUERIDA");
  return assertPrivateDataPath(repoRoot, resolve(repoRoot, value), extensions);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeNew(path, contents) {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, contents, {encoding: "utf8", flag: "wx"});
}

function safeReason(error) {
  const message = String(error?.message ?? "ERROR_LOCAL");
  return /^[A-Z0-9_:-]{1,100}$/u.test(message) ? message : "ERROR_LOCAL";
}

async function initializePrivateFiles(args) {
  const outputPath = privatePath(args.output, [".json"]);
  const markdownPath = privatePath(args.markdown, [".md"]);
  let dataStatus = "existing";
  let markdownStatus = "existing";
  if (!(await exists(outputPath))) {
    await writeNew(outputPath, `${JSON.stringify(createOwnerDataTemplate(), null, 2)}\n`);
    dataStatus = "created";
  }
  if (!(await exists(markdownPath))) {
    const source = await readFile(
      resolve(repoRoot, "docs/INFORMACION_REAL_REQUERIDA_ETAPA_21.md"),
      "utf8",
    );
    const header = [
      "<!-- COPIA PRIVADA EDITABLE. NO VERSIONAR. -->",
      "<!-- Complete un bloque por vez y no incluya contraseñas, tokens ni credenciales. -->",
      "",
    ].join("\n");
    await writeNew(markdownPath, `${header}${source.trimEnd()}\n`);
    markdownStatus = "created";
  }
  console.log(`PRIVATE_DATA_TEMPLATE=${dataStatus}`);
  console.log(`PRIVATE_MARKDOWN_TEMPLATE=${markdownStatus}`);
  console.log(`PRIVATE_DIRECTORY=${relative(repoRoot, dirname(outputPath)).replaceAll("\\", "/")}`);
}

async function validatePrivateData(args) {
  const inputPath = privatePath(args.input, [".json"]);
  const outputPath = privatePath(args.output, [".json"]);
  const data = JSON.parse(await readFile(inputPath, "utf8"));
  const validation = validateOwnerData(data);
  const report = {
    generatedAt: new Date().toISOString(),
    input: relative(repoRoot, inputPath).replaceAll("\\", "/"),
    validation,
    sanitizedSummary: sanitizedOwnerSummary(data, validation),
    remoteOperations: 0,
  };
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`PRIVATE_VALIDATION=${validation.valid ? (validation.complete ? "complete" : "incomplete") : "invalid"}`);
  console.log(`PRIVATE_VALIDATION_ERRORS=${validation.errors.length}`);
  console.log(`PRIVATE_VALIDATION_PENDING=${validation.pending.length}`);
  console.log("REMOTE_OPERATIONS=0");
  if (!validation.valid) process.exitCode = 1;
}

async function createPrivatePackage(args) {
  const inputPath = privatePath(args.input, [".json"]);
  const outputPath = privatePath(args.output, [".json"]);
  const summaryPath = privatePath(args.summary, [".json"]);
  if ((await exists(outputPath)) || (await exists(summaryPath))) {
    throw new Error("SALIDA_PRIVADA_YA_EXISTE");
  }
  const data = JSON.parse(await readFile(inputPath, "utf8"));
  const createdAt = new Date().toISOString();
  const prepared = buildPrivateMigrationPackage(data, createdAt);
  const summary = {
    generatedAt: createdAt,
    format: prepared.packageValue.formato,
    hash: prepared.hash,
    packageBytes: prepared.packageBytes,
    packageBlocksComplete: prepared.packageBlocksComplete,
    ownerDataComplete: prepared.validation.complete,
    sanitizedSummary: sanitizedOwnerSummary(data, prepared.validation),
    localValidation: "APROBADA",
    remoteValidationExecuted: false,
    imported: false,
    reverted: false,
  };
  await writeNew(outputPath, `${JSON.stringify(prepared.packageValue, null, 2)}\n`);
  await writeNew(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log("PRIVATE_PACKAGE=created");
  console.log("PRIVATE_PACKAGE_LOCAL_VALIDATION=passed");
  console.log("REMOTE_OPERATIONS=0");
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.action === "init") await initializePrivateFiles(args);
  if (args.action === "validate") await validatePrivateData(args);
  if (args.action === "package") await createPrivatePackage(args);
}

main().catch((error) => {
  console.error(`PRIVATE_DATA_STATUS=failed reason=${safeReason(error)}`);
  process.exitCode = 1;
});
