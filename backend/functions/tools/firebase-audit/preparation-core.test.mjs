import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

import {
  BACKUP_BLOCK,
  MIGRATION_PACKAGE_FORMAT,
  MIGRATION_PACKAGE_MAX_BYTES,
  assertCleanupBlocked,
  assertPreparationRemoteRead,
  assertPrivateDataPath,
  buildPrivateMigrationPackage,
  collectExactIdentifierReferences,
  createOwnerDataTemplate,
  initialApplicationClassification,
  redactKnownIdentifiers,
  sanitizedOwnerSummary,
  summarizePrivateDocument,
  validateOwnerData,
  validateResourceClassification,
} from "./preparation-core.mjs";

const toolDirectory = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(toolDirectory, "../../../..");

function validOwnerData() {
  return {
    formato: "preparacion-datos-reales-etapa-21-v1",
    estado: "APROBADO_LOCALMENTE",
    vivero: {
      nombre: "VIVERO PRUEBA FICTICIO",
      responsableEstructura: "PERSONA FICTICIA",
    },
    estructura: {
      ubicaciones: [
        {
          claveExterna: "UB-PRUEBA-RAIZ",
          ubicacionPadreClaveExterna: null,
          codigo: "PRUEBA-RAIZ",
          tipo: "VIVERO",
          nombreVisible: "Vivero ficticio",
          orden: 0,
          activa: true,
        },
        {
          claveExterna: "UB-PRUEBA-MODULO",
          ubicacionPadreClaveExterna: "UB-PRUEBA-RAIZ",
          codigo: "PRUEBA-MODULO",
          tipo: "MODULO",
          nombreVisible: "Módulo ficticio",
          orden: 1,
          activa: true,
        },
      ],
      lineas: [{
        claveExterna: "LINEA-PRUEBA-001",
        ubicacionClaveExterna: "UB-PRUEBA-MODULO",
        codigo: "PRUEBA-LINEA-001",
        nombreVisible: "Línea ficticia",
        orden: 1,
        activa: true,
      }],
    },
    inventarioInicial: [{
      lineaClaveExterna: "LINEA-PRUEBA-001",
      hembras: 3,
      machos: 2,
      patrones: 1,
      totalCalculado: 6,
      fechaCorte: "2026-07-17T12:00:00.000Z",
      fuente: "PLANILLA PRUEBA FICTICIA",
      responsable: "PERSONA FICTICIA",
      observacion: "Solo fixture local",
    }],
    usuarios: [{
      nombreVisible: "USUARIO PRUEBA",
      correo: "usuario@prueba.local",
      rol: "AUXILIAR",
      estado: "ACTIVO",
      puedeContar: true,
      puedeRevisar: false,
      jornadasIniciales: [],
      zonasIniciales: [],
      responsableCreacion: "ADMIN PRUEBA",
      responsableEntregaAcceso: "ADMIN PRUEBA",
    }],
    historicos: {
      decision: "SIN_HISTORICOS_A_MIGRAR",
      fuentes: [],
    },
    dispositivos: {
      celulares: [{
        modelo: "MODELO FICTICIO",
        versionAndroid: "ANDROID 15 FICTICIO",
        cantidad: 1,
        modalidad: "COMPARTIDO",
      }],
      conectividad: [{
        zona: "ZONA PRUEBA",
        senal: "INTERMITENTE",
        interrupcionHabitualMinutos: 5,
        interrupcionMaximaMinutos: 15,
      }],
      computadorMaestro: {
        sistemaOperativo: "WINDOWS PRUEBA",
        version: "VERSION FICTICIA",
        responsable: "PERSONA FICTICIA",
      },
    },
  };
}

function classificationFixture() {
  return {
    cleanupBlock: BACKUP_BLOCK,
    applications: {items: [{classification: "CANDIDATO_ELIMINACION_FUTURA"}]},
    authentication: {accounts: [{classification: "REQUIERE_REVISION"}]},
    firestore: {groups: [{classification: "REQUIERE_REVISION"}]},
    iam: {principals: [{classification: "REQUIERE_REVISION"}]},
    functions: {items: [{classification: "CONSERVAR_HASTA_REEMPLAZO_CONTROLADO"}]},
    storage: {
      buckets: [{classification: "CONSERVAR"}],
      objects: {classification: "CONSERVAR"},
    },
  };
}

test("mantiene toda limpieza bloqueada por BACKUP_PENDIENTE", () => {
  assert.deepEqual(
    assertCleanupBlocked({cleanupBlock: BACKUP_BLOCK}),
    {cleanupAllowed: false, reason: BACKUP_BLOCK},
  );
  assert.throws(() => assertCleanupBlocked({cleanupBlock: "APROBADO"}), /BACKUP_PENDIENTE/u);
  assert.equal(validateResourceClassification(classificationFixture()).valid, true);
  const invalid = classificationFixture();
  invalid.cleanupBlock = "";
  invalid.authentication.accounts[0].classification = "ELIMINAR_AHORA";
  assert.equal(validateResourceClassification(invalid).valid, false);
});

test("la plantilla vacía queda pendiente y nunca produce un paquete parcial", () => {
  const template = createOwnerDataTemplate();
  const validation = validateOwnerData(template);
  assert.equal(validation.valid, true);
  assert.equal(validation.complete, false);
  assert.equal(validation.blocks.estructura, "INCOMPLETO");
  assert.throws(() => buildPrivateMigrationPackage(template), /DATOS_REALES_INCOMPLETOS/u);
});

test("valida datos ficticios completos y construye el formato de migración v1", () => {
  const data = validOwnerData();
  const validation = validateOwnerData(data);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.pending, []);
  assert.equal(validation.complete, true);
  const first = buildPrivateMigrationPackage(data, "2026-07-17T15:00:00.000Z");
  const second = buildPrivateMigrationPackage(
    structuredClone(data),
    "2026-07-17T15:00:00.000Z",
  );
  assert.equal(first.packageValue.formato, MIGRATION_PACKAGE_FORMAT);
  assert.equal(first.hash, second.hash);
  assert.equal(first.packageValue.inventariosIniciales[0].hembras, 3);
  assert.equal(first.packageValue.inventariosIniciales[0].lineaClaveExterna, "LINEA-PRUEBA-001");
  assert.ok(first.packageBytes <= MIGRATION_PACKAGE_MAX_BYTES);
  const summary = sanitizedOwnerSummary(data, validation);
  assert.equal(summary.counts.lines, 1);
  assert.equal(summary.inventoryTotals.total, 6);
  assert.deepEqual(summary.roleCounts, {AUXILIAR: 1});

  const catalogOnly = validOwnerData();
  catalogOnly.usuarios = [];
  catalogOnly.historicos = {decision: "", fuentes: []};
  catalogOnly.dispositivos = createOwnerDataTemplate().dispositivos;
  const catalogOnlyValidation = validateOwnerData(catalogOnly);
  assert.equal(catalogOnlyValidation.complete, false);
  assert.equal(catalogOnlyValidation.blocks.estructura, "COMPLETO");
  assert.equal(catalogOnlyValidation.blocks.inventarioInicial, "COMPLETO");
  assert.equal(
    buildPrivateMigrationPackage(catalogOnly, "2026-07-17T15:00:00.000Z")
      .packageBlocksComplete,
    true,
  );
});

test("acepta inventario cero solo para una línea vacía confirmada", () => {
  const confirmed = validOwnerData();
  Object.assign(confirmed.inventarioInicial[0], {
    hembras: 0,
    machos: 0,
    patrones: 0,
    totalCalculado: 0,
    lineaVaciaConfirmada: true,
    observacion: "Línea vacía confirmada por el responsable.",
  });
  const validation = validateOwnerData(confirmed);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.blocks.inventarioInicial, "COMPLETO");
  const built = buildPrivateMigrationPackage(confirmed, "2026-07-17T15:00:00.000Z");
  assert.equal(built.packageValue.inventariosIniciales[0].lineaVaciaConfirmada, true);

  const unconfirmed = structuredClone(confirmed);
  delete unconfirmed.inventarioInicial[0].lineaVaciaConfirmada;
  assert.ok(validateOwnerData(unconfirmed).errors.some((entry) =>
    entry.startsWith("TOTAL_CERO_SIN_CONFIRMACION")));
});

test("detecta ciclos, relaciones inválidas, duplicados y totales incorrectos", () => {
  const data = validOwnerData();
  data.estructura.ubicaciones[0].ubicacionPadreClaveExterna = "UB-PRUEBA-MODULO";
  data.estructura.ubicaciones[1].ubicacionPadreClaveExterna = "UB-PRUEBA-RAIZ";
  data.estructura.ubicaciones[1].activa = false;
  data.estructura.lineas.push({
    ...data.estructura.lineas[0],
    claveExterna: "LINEA-PRUEBA-002",
  });
  data.estructura.lineas.push({
    ...data.estructura.lineas[0],
    claveExterna: "LINEA-PRUEBA-003",
    codigo: "PRUEBA-LINEA-003",
    ubicacionClaveExterna: "UB-INEXISTENTE",
  });
  data.inventarioInicial[0].hembras = -1;
  data.inventarioInicial[0].totalCalculado = 99;
  data.estructura.lineas[0].claveExterna = "X";
  const validation = validateOwnerData(data);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((entry) => entry.startsWith("CICLO_UBICACIONES")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("UBICACION_LINEA_INEXISTENTE")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("UBICACION_LINEA_INACTIVA")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("CODIGO_LINEA_DUPLICADO")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("CANTIDAD_INVALIDA")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("CLAVE_EXTERNA_INVALIDA")));
});

test("rechaza correos duplicados, roles desconocidos, contraseñas y secretos", () => {
  const data = validOwnerData();
  data.usuarios.push({
    ...data.usuarios[0],
    correo: "USUARIO@PRUEBA.LOCAL",
    rol: "SUPERUSUARIO",
    password: "valor-no-admitido",
  });
  data.usuarios[0].observacion = `AIza${"0".repeat(35)}`;
  const validation = validateOwnerData(data);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((entry) => entry.startsWith("CORREO_DUPLICADO")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("ROL_NO_ADMITIDO")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("CAMPO_SECRETO_PROHIBIDO")));
  assert.ok(validation.errors.some((entry) => entry.startsWith("SECRETO_DETECTADO")));
});

test("extrae un inventario privado mínimo sin copiar secretos", () => {
  const summary = summarizePrivateDocument("JORNADA-PRUEBA-01", {
    nombreVisible: "Jornada PRUEBA",
    estadoAdministrativo: "BORRADOR",
    contadorId: "uid-ficticio-001",
    roles: ["AUXILIAR"],
    tokenReserva: "secreto-que-no-debe-copiarse",
    contenidoIrrelevante: "no se copia",
  });
  assert.deepEqual(summary.fieldNames, [
    "contadorId",
    "contenidoIrrelevante",
    "estadoAdministrativo",
    "nombreVisible",
    "roles",
    "tokenReserva",
  ]);
  assert.ok(summary.descriptors.some((entry) => entry.field === "nombreVisible"));
  assert.ok(summary.states.some((entry) => entry.field === "estadoAdministrativo"));
  assert.ok(summary.relations.some((entry) => entry.field === "contadorId"));
  assert.deepEqual(summary.redactedFields, ["tokenReserva"]);
  assert.doesNotMatch(JSON.stringify(summary), /secreto-que-no/u);
  assert.doesNotMatch(JSON.stringify(summary), /no se copia/u);
});

test("localiza referencias de UID y las enmascara antes de compartir", () => {
  const identifier = "uid-ficticio-001";
  const matches = collectExactIdentifierReferences({
    autorId: identifier,
    ruta: `usuarios/${identifier}`,
    otro: "sin-coincidencia",
  }, [identifier]);
  assert.equal(matches.length, 2);
  const redacted = redactKnownIdentifiers({ruta: `usuarios/${identifier}`}, [identifier]);
  assert.match(redacted.ruta, /^usuarios\/sha256:[0-9a-f]{12}$/u);
  assert.doesNotMatch(redacted.ruta, /uid-ficticio/u);
});

test("solo permite lecturas exactas del proyecto y rechaza objetos Storage y mutaciones", () => {
  assert.equal(
    assertPreparationRemoteRead(
      "https://firebase.googleapis.com/v1beta1/projects/viverocontrol-3f83f/androidApps?pageSize=100",
    ),
    true,
  );
  assert.equal(
    assertPreparationRemoteRead(
      "https://cloudfunctions.googleapis.com/v2/projects/viverocontrol-3f83f/locations/us-central1/functions",
    ),
    true,
  );
  assert.equal(
    assertPreparationRemoteRead(
      "https://storage.googleapis.com/storage/v1/b?project=viverocontrol-3f83f",
    ),
    true,
  );
  assert.throws(
    () => assertPreparationRemoteRead(
      "https://storage.googleapis.com/storage/v1/b/bucket/o",
    ),
    /LECTURA_REMOTA_NO_PERMITIDA/u,
  );
  assert.throws(
    () => assertPreparationRemoteRead(
      "https://firebase.googleapis.com/v1beta1/projects/viverocontrol-3f83f/androidApps",
      "DELETE",
    ),
    /LECTURA_REMOTA_NO_PERMITIDA/u,
  );
});

test("las entradas y salidas locales deben permanecer dentro de .private", () => {
  const privateJson = resolve(repoRoot, ".private/etapa-21/fase-b/datos-reales.json");
  const privateMarkdown = resolve(
    repoRoot,
    ".private/etapa-21/fase-b/INFORMACION_REAL_REQUERIDA_ETAPA_21.md",
  );
  assert.equal(assertPrivateDataPath(repoRoot, privateJson, [".json"]), privateJson);
  assert.equal(assertPrivateDataPath(repoRoot, privateMarkdown, [".md"]), privateMarkdown);
  assert.throws(
    () => assertPrivateDataPath(repoRoot, resolve(repoRoot, "docs/datos-reales.json")),
    /RUTA_PRIVADA_REQUERIDA/u,
  );
});

test("la herramienta remota aborta en CI y no contiene operaciones de mutación", async () => {
  const source = await readFile(resolve(toolDirectory, "prepare-private.mjs"), "utf8");
  const forbidden = [
    /\.ref\.(?:set|update|create|delete)\s*\(/u,
    /\b(?:database|firestore|batch|transaction)\.(?:set|update|create|delete)\s*\(/u,
    /recursiveDelete/u,
    /createUser/u,
    /deleteUser/u,
    /importUsers/u,
    /firebase\s+deploy/u,
    /functions:delete/u,
    /apps:delete/u,
  ];
  forbidden.forEach((pattern) => assert.doesNotMatch(source, pattern));
  assert.match(source, /if \(process\.env\.CI\)/u);
  assert.doesNotMatch(source, /storage\.googleapis\.com\/storage\/v1\/b\/.*\/o/u);
  assert.match(source, /REMOTE_MUTATIONS=0/u);
  assert.match(source, /STORAGE_OBJECTS_OPENED=0/u);
});

test("solo los registros con nombre Staging quedan como candidatos iniciales", () => {
  assert.equal(
    initialApplicationClassification({displayName: "Vivero Campo Staging"}),
    "CANDIDATO_ELIMINACION_FUTURA",
  );
  assert.equal(
    initialApplicationClassification({packageName: "com.arles.viverocontrol"}),
    "REQUIERE_REVISION",
  );
  assert.equal(
    initialApplicationClassification({displayName: "Aplicación desconocida"}),
    "REQUIERE_REVISION",
  );
});
