import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

const envPath = resolve(process.cwd(), ".env.local");

function fail(message) {
  console.error(`Configuración production inválida: ${message}`);
  process.exit(1);
}

if (!existsSync(envPath)) fail("falta el archivo local .env.local.");

const variables = new Map();
for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/u)) {
  const line = rawLine.trim();
  if (line === "" || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator <= 0) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim();
  if (variables.has(key)) fail(`la variable ${key} está duplicada.`);
  variables.set(key, value);
}

const expected = new Map([
  ["VITE_APP_ENV", "production"],
  ["VITE_USE_FIREBASE_EMULATORS", "false"],
  ["VITE_FIREBASE_PROJECT_ID", "viverocontrol-3f83f"],
]);

for (const [key, value] of expected) {
  if (variables.get(key) !== value) fail(`${key} no tiene el valor production requerido.`);
}

const requiredWebValues = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
];
const missing = requiredWebValues.filter((key) => !variables.get(key));
if (missing.length > 0) fail(`faltan valores Web requeridos: ${missing.join(", ")}.`);

console.log("Configuración local de Vivero Maestro Production validada.");
