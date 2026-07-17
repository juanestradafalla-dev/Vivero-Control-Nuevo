import {Buffer} from "node:buffer";
import {createHash} from "node:crypto";
import {resolve, sep} from "node:path";

import {
  PRODUCTION_PROJECT_ID,
  maskIdentifier,
} from "./core.mjs";

export const BACKUP_BLOCK = "BACKUP_PENDIENTE";
export const OWNER_DATA_FORMAT = "preparacion-datos-reales-etapa-21-v1";
export const MIGRATION_PACKAGE_FORMAT = "paquete-migracion-catalogo-v1";
export const MIGRATION_PACKAGE_MAX_BYTES = 512_000;

export const ALLOWED_CLASSIFICATIONS = Object.freeze({
  applications: Object.freeze([
    "CONSERVAR",
    "CANDIDATO_ELIMINACION_FUTURA",
    "REQUIERE_REVISION",
  ]),
  accounts: Object.freeze([
    "CUENTA_REAL_CONSERVAR",
    "CUENTA_PRUEBA_ELIMINAR_DESPUES",
    "REQUIERE_REVISION",
  ]),
  firestore: Object.freeze([
    "CONSERVAR",
    "ELIMINAR_DESPUES",
    "REQUIERE_REVISION",
  ]),
  iam: Object.freeze([
    "RESPONSABLE_AUTORIZADO",
    "RETIRAR_DESPUES",
    "REQUIERE_REVISION",
  ]),
});

const ALLOWED_ROLES = new Set(["ADMINISTRADOR", "SUPERVISOR", "AUXILIAR"]);
const ALLOWED_USER_STATES = new Set(["ACTIVO", "INACTIVO"]);
const ALLOWED_DEVICE_OWNERSHIP = new Set(["COMPARTIDO", "PERSONAL"]);
const ALLOWED_SIGNAL_STATES = new Set(["BUENA", "INTERMITENTE", "SIN_SENAL"]);
const ALLOWED_HISTORY_DECISIONS = new Set([
  "CONSERVAR_HISTORICOS",
  "SIN_HISTORICOS_A_MIGRAR",
]);
const EXTERNAL_KEY = /^[A-Za-z0-9._:-]+$/u;
const FORBIDDEN_PRIVATE_KEY =
  /(?:password|contrase(?:n|ñ)a|token|secret|credential|credencial|api.?key|private.?key|llave.?privada)/iu;
const FORBIDDEN_SECRET_VALUE =
  /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAIza[0-9A-Za-z_-]{30,}\b|\bgh[oprsu]_[A-Za-z0-9]{20,}\b|\bsk-[A-Za-z0-9_-]{20,}\b)/u;
const TEST_MARKER = /(?:^|[^\p{L}\p{N}])(?:PRUEBA|FICTICI[OA]|EMULATOR|STAGING|TEST)(?:$|[^\p{L}\p{N}])/iu;
const DESCRIPTOR_KEY = /^(?:nombre|nombreVisible|displayName|codigo|codigoNormalizado|claveExterna|correo|email)$/iu;
const STATE_KEY = /^(?:estado|estadoAdministrativo|estadoCentral|activo|activa|roles|rol|tipo|origen|fuente|ambiente|status)$/iu;
const RELATION_KEY = /(?:id|ids|uid|uids|ref|refs|path|ruta|claveExterna)$/iu;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalized(value) {
  return String(value ?? "").trim().normalize("NFKC");
}

function normalizedCode(value) {
  return normalized(value).toLocaleUpperCase("es-CO");
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function privateScalar(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return "FECHA_NO_INTERPRETABLE";
    }
  }
  if (typeof value?.path === "string") return value.path;
  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map(privateScalar).filter((item) => item !== undefined);
    return items;
  }
  return undefined;
}

function visitValues(value, visitor, path = "", visited = new WeakSet(), depth = 0) {
  if (depth > 12) return;
  const scalar = privateScalar(value);
  if (scalar !== undefined && !Array.isArray(value)) {
    visitor(scalar, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitValues(entry, visitor, `${path}[${index}]`, visited, depth + 1));
    return;
  }
  if (!isRecord(value) || visited.has(value)) return;
  if (typeof value.path === "string") {
    visitor(value.path, path);
    return;
  }
  visited.add(value);
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = path ? `${path}.${key}` : key;
    visitValues(entry, visitor, entryPath, visited, depth + 1);
  }
}

function findForbiddenPrivateData(value) {
  const errors = [];
  const visit = (candidate, path = "datos", visited = new WeakSet()) => {
    if (typeof candidate === "string") {
      if (FORBIDDEN_SECRET_VALUE.test(candidate)) errors.push(`SECRETO_DETECTADO:${path}`);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`, visited));
      return;
    }
    if (!isRecord(candidate) || visited.has(candidate)) return;
    visited.add(candidate);
    for (const [key, entry] of Object.entries(candidate)) {
      const entryPath = `${path}.${key}`;
      if (FORBIDDEN_PRIVATE_KEY.test(key)) errors.push(`CAMPO_SECRETO_PROHIBIDO:${entryPath}`);
      visit(entry, entryPath, visited);
    }
  };
  visit(value);
  return errors;
}

function addRequiredText(value, path, pending, errors) {
  if (value === undefined || value === null || value === "") {
    pending.push(path);
  } else if (!hasText(value)) {
    errors.push(`TEXTO_INVALIDO:${path}`);
  }
}

function addRequiredBoolean(value, path, pending, errors) {
  if (value === undefined || value === null) pending.push(path);
  else if (typeof value !== "boolean") errors.push(`BOOLEANO_INVALIDO:${path}`);
}

function validateExternalKey(value, path, errors) {
  if (
    hasText(value) &&
    (value.length < 3 || value.length > 128 || !EXTERNAL_KEY.test(value))
  ) {
    errors.push(`CLAVE_EXTERNA_INVALIDA:${path}`);
  }
}

function scopedDuplicate(items, scopeFor, valueFor, code, errors) {
  const seen = new Set();
  for (const item of items) {
    const value = normalizedCode(valueFor(item));
    if (!value) continue;
    const key = `${normalizedCode(scopeFor(item))}\u0000${value}`;
    if (seen.has(key)) errors.push(`${code}:${value}`);
    seen.add(key);
  }
}

function validateLocations(locations, pending, errors) {
  if (!Array.isArray(locations)) {
    errors.push("ESTRUCTURA_INVALIDA:estructura.ubicaciones");
    return new Map();
  }
  if (locations.length === 0) pending.push("estructura.ubicaciones");
  if (locations.length > 500) errors.push("LIMITE_UBICACIONES_EXCEDIDO");
  const byKey = new Map();
  locations.forEach((location, index) => {
    const path = `estructura.ubicaciones[${index}]`;
    if (!isRecord(location)) {
      errors.push(`ESTRUCTURA_INVALIDA:${path}`);
      return;
    }
    for (const field of ["claveExterna", "codigo", "tipo", "nombreVisible"]) {
      addRequiredText(location[field], `${path}.${field}`, pending, errors);
    }
    const maximumLengths = {claveExterna: 128, codigo: 120, tipo: 80, nombreVisible: 240};
    for (const [field, maximum] of Object.entries(maximumLengths)) {
      if (typeof location[field] === "string" && location[field].length > maximum) {
        errors.push(`TEXTO_DEMASIADO_LARGO:${path}.${field}`);
      }
    }
    validateExternalKey(location.claveExterna, `${path}.claveExterna`, errors);
    if (
      location.ubicacionPadreClaveExterna === undefined ||
      location.ubicacionPadreClaveExterna === ""
    ) {
      pending.push(`${path}.ubicacionPadreClaveExterna`);
    } else if (
      location.ubicacionPadreClaveExterna !== null &&
      !hasText(location.ubicacionPadreClaveExterna)
    ) {
      errors.push(`PADRE_INVALIDO:${path}.ubicacionPadreClaveExterna`);
    }
    if (location.ubicacionPadreClaveExterna !== null) {
      validateExternalKey(
        location.ubicacionPadreClaveExterna,
        `${path}.ubicacionPadreClaveExterna`,
        errors,
      );
    }
    if (!isNonNegativeInteger(location.orden)) errors.push(`ORDEN_INVALIDO:${path}.orden`);
    addRequiredBoolean(location.activa, `${path}.activa`, pending, errors);
    const key = normalizedCode(location.claveExterna);
    if (key) {
      if (byKey.has(key)) errors.push(`CLAVE_EXTERNA_DUPLICADA:${key}`);
      byKey.set(key, location);
    }
  });
  scopedDuplicate(
    locations.filter(isRecord),
    (entry) => entry.ubicacionPadreClaveExterna ?? "RAIZ",
    (entry) => entry.codigo,
    "CODIGO_UBICACION_DUPLICADO",
    errors,
  );

  for (const location of locations.filter(isRecord)) {
    const key = normalizedCode(location.claveExterna);
    const parentKey = normalizedCode(location.ubicacionPadreClaveExterna);
    if (parentKey && !byKey.has(parentKey)) errors.push(`PADRE_INEXISTENTE:${key}`);
    if (parentKey && parentKey === key) errors.push(`CICLO_UBICACIONES:${key}`);
    if (location.activa === true && parentKey && byKey.get(parentKey)?.activa !== true) {
      errors.push(`PADRE_INACTIVO:${key}`);
    }
  }

  const colors = new Map();
  const visit = (key, trail) => {
    const color = colors.get(key);
    if (color === "gris") {
      errors.push(`CICLO_UBICACIONES:${[...trail, key].join("->")}`);
      return;
    }
    if (color === "negro") return;
    colors.set(key, "gris");
    const parent = normalizedCode(byKey.get(key)?.ubicacionPadreClaveExterna);
    if (parent && byKey.has(parent)) visit(parent, [...trail, key]);
    colors.set(key, "negro");
  };
  for (const key of byKey.keys()) visit(key, []);
  return byKey;
}

function validateLines(lines, locationsByKey, pending, errors) {
  if (!Array.isArray(lines)) {
    errors.push("ESTRUCTURA_INVALIDA:estructura.lineas");
    return new Map();
  }
  if (lines.length === 0) pending.push("estructura.lineas");
  if (lines.length > 2_000) errors.push("LIMITE_LINEAS_EXCEDIDO");
  const byKey = new Map();
  lines.forEach((line, index) => {
    const path = `estructura.lineas[${index}]`;
    if (!isRecord(line)) {
      errors.push(`ESTRUCTURA_INVALIDA:${path}`);
      return;
    }
    for (const field of ["claveExterna", "ubicacionClaveExterna", "codigo", "nombreVisible"]) {
      addRequiredText(line[field], `${path}.${field}`, pending, errors);
    }
    const maximumLengths = {
      claveExterna: 128,
      ubicacionClaveExterna: 128,
      codigo: 120,
      nombreVisible: 240,
    };
    for (const [field, maximum] of Object.entries(maximumLengths)) {
      if (typeof line[field] === "string" && line[field].length > maximum) {
        errors.push(`TEXTO_DEMASIADO_LARGO:${path}.${field}`);
      }
    }
    validateExternalKey(line.claveExterna, `${path}.claveExterna`, errors);
    validateExternalKey(
      line.ubicacionClaveExterna,
      `${path}.ubicacionClaveExterna`,
      errors,
    );
    if (!isNonNegativeInteger(line.orden)) errors.push(`ORDEN_INVALIDO:${path}.orden`);
    addRequiredBoolean(line.activa, `${path}.activa`, pending, errors);
    const key = normalizedCode(line.claveExterna);
    const locationKey = normalizedCode(line.ubicacionClaveExterna);
    if (key) {
      if (byKey.has(key) || locationsByKey.has(key)) errors.push(`CLAVE_EXTERNA_DUPLICADA:${key}`);
      byKey.set(key, line);
    }
    if (locationKey && !locationsByKey.has(locationKey)) {
      errors.push(`UBICACION_LINEA_INEXISTENTE:${key}`);
    } else if (line.activa === true && locationsByKey.get(locationKey)?.activa !== true) {
      errors.push(`UBICACION_LINEA_INACTIVA:${key}`);
    }
  });
  scopedDuplicate(
    lines.filter(isRecord),
    (entry) => entry.ubicacionClaveExterna,
    (entry) => entry.codigo,
    "CODIGO_LINEA_DUPLICADO",
    errors,
  );
  return byKey;
}

function validateInventory(inventories, linesByKey, pending, errors) {
  if (!Array.isArray(inventories)) {
    errors.push("ESTRUCTURA_INVALIDA:inventarioInicial");
    return;
  }
  if (inventories.length === 0) pending.push("inventarioInicial");
  if (inventories.length > 2_000) errors.push("LIMITE_INVENTARIOS_EXCEDIDO");
  const inventoriedLines = new Set();
  inventories.forEach((inventory, index) => {
    const path = `inventarioInicial[${index}]`;
    if (!isRecord(inventory)) {
      errors.push(`ESTRUCTURA_INVALIDA:${path}`);
      return;
    }
    addRequiredText(inventory.lineaClaveExterna, `${path}.lineaClaveExterna`, pending, errors);
    validateExternalKey(
      inventory.lineaClaveExterna,
      `${path}.lineaClaveExterna`,
      errors,
    );
    const lineKey = normalizedCode(inventory.lineaClaveExterna);
    if (lineKey && !linesByKey.has(lineKey)) errors.push(`LINEA_INVENTARIO_INEXISTENTE:${lineKey}`);
    if (inventoriedLines.has(lineKey)) errors.push(`INVENTARIO_DUPLICADO:${lineKey}`);
    if (lineKey) inventoriedLines.add(lineKey);
    const quantities = ["hembras", "machos", "patrones"];
    for (const field of quantities) {
      if (!isNonNegativeInteger(inventory[field])) errors.push(`CANTIDAD_INVALIDA:${path}.${field}`);
    }
    if (quantities.every((field) => isNonNegativeInteger(inventory[field]))) {
      const total = quantities.reduce((sum, field) => sum + inventory[field], 0);
      if (!Number.isSafeInteger(total)) errors.push(`TOTAL_DESBORDADO:${path}.totalCalculado`);
      if (inventory.totalCalculado !== total) errors.push(`TOTAL_INCORRECTO:${path}.totalCalculado`);
      if (inventory.lineaVaciaConfirmada !== undefined &&
          typeof inventory.lineaVaciaConfirmada !== "boolean") {
        errors.push(`INVENTARIO_CONFIRMACION_INVALIDA:${path}.lineaVaciaConfirmada`);
      }
      if (total === 0 && inventory.lineaVaciaConfirmada !== true) {
        errors.push(`TOTAL_CERO_SIN_CONFIRMACION:${path}.totalCalculado`);
      }
      if (total === 0 && !hasText(inventory.observacion)) {
        errors.push(`TOTAL_CERO_SIN_OBSERVACION:${path}.observacion`);
      }
      if (total > 0 && inventory.lineaVaciaConfirmada === true) {
        errors.push(`TOTAL_POSITIVO_MARCADO_VACIO:${path}.lineaVaciaConfirmada`);
      }
    }
    if (!isValidDate(inventory.fechaCorte)) errors.push(`FECHA_INVALIDA:${path}.fechaCorte`);
    for (const field of ["fuente", "responsable"]) {
      addRequiredText(inventory[field], `${path}.${field}`, pending, errors);
    }
    if (hasText(inventory.fuente) && hasText(inventory.responsable) && isValidDate(inventory.fechaCorte)) {
      const reference = [
        normalized(inventory.fuente),
        `corte ${normalized(inventory.fechaCorte)}`,
        `responsable ${normalized(inventory.responsable)}`,
      ].join("; ");
      if (reference.length > 500) errors.push(`REFERENCIA_FUENTE_DEMASIADO_LARGA:${path}`);
    }
    if (inventory.observacion !== undefined && typeof inventory.observacion !== "string") {
      errors.push(`TEXTO_INVALIDO:${path}.observacion`);
    }
  });
  for (const [lineKey, line] of linesByKey.entries()) {
    if (line.activa === true && !inventoriedLines.has(lineKey)) {
      pending.push(`inventarioInicial.linea:${lineKey}`);
    }
  }
}

function validateUsers(users, pending, errors) {
  if (!Array.isArray(users)) {
    errors.push("ESTRUCTURA_INVALIDA:usuarios");
    return;
  }
  if (users.length === 0) pending.push("usuarios");
  const emails = new Set();
  users.forEach((user, index) => {
    const path = `usuarios[${index}]`;
    if (!isRecord(user)) {
      errors.push(`ESTRUCTURA_INVALIDA:${path}`);
      return;
    }
    for (const field of [
      "nombreVisible",
      "correo",
      "rol",
      "estado",
      "responsableCreacion",
      "responsableEntregaAcceso",
    ]) {
      addRequiredText(user[field], `${path}.${field}`, pending, errors);
    }
    const email = normalized(user.correo).toLocaleLowerCase("es-CO");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      errors.push(`CORREO_INVALIDO:${path}.correo`);
    }
    if (email && emails.has(email)) errors.push(`CORREO_DUPLICADO:${path}.correo`);
    if (email) emails.add(email);
    if (hasText(user.rol) && !ALLOWED_ROLES.has(normalizedCode(user.rol))) {
      errors.push(`ROL_NO_ADMITIDO:${path}.rol`);
    }
    if (hasText(user.estado) && !ALLOWED_USER_STATES.has(normalizedCode(user.estado))) {
      errors.push(`ESTADO_USUARIO_NO_ADMITIDO:${path}.estado`);
    }
    addRequiredBoolean(user.puedeContar, `${path}.puedeContar`, pending, errors);
    addRequiredBoolean(user.puedeRevisar, `${path}.puedeRevisar`, pending, errors);
    for (const field of ["jornadasIniciales", "zonasIniciales"]) {
      if (!Array.isArray(user[field])) errors.push(`LISTA_INVALIDA:${path}.${field}`);
    }
  });
}

function validateHistory(history, pending, errors) {
  if (!isRecord(history)) {
    errors.push("ESTRUCTURA_INVALIDA:historicos");
    return;
  }
  if (!hasText(history.decision)) {
    pending.push("historicos.decision");
    return;
  }
  const decision = normalizedCode(history.decision);
  if (!ALLOWED_HISTORY_DECISIONS.has(decision)) {
    errors.push("DECISION_HISTORICOS_INVALIDA:historicos.decision");
    return;
  }
  if (!Array.isArray(history.fuentes)) {
    errors.push("LISTA_INVALIDA:historicos.fuentes");
    return;
  }
  if (decision === "SIN_HISTORICOS_A_MIGRAR" && history.fuentes.length > 0) {
    errors.push("HISTORICOS_INCONSISTENTES:historicos.fuentes");
  }
  if (decision === "CONSERVAR_HISTORICOS" && history.fuentes.length === 0) {
    pending.push("historicos.fuentes");
  }
  history.fuentes.forEach((source, index) => {
    const path = `historicos.fuentes[${index}]`;
    if (!isRecord(source)) {
      errors.push(`ESTRUCTURA_INVALIDA:${path}`);
      return;
    }
    for (const field of ["fuente", "formato", "rangoFechas", "responsable", "calidadConocida"]) {
      addRequiredText(source[field], `${path}.${field}`, pending, errors);
    }
  });
}

function validateDevices(devices, pending, errors) {
  if (!isRecord(devices)) {
    errors.push("ESTRUCTURA_INVALIDA:dispositivos");
    return;
  }
  if (!Array.isArray(devices.celulares)) errors.push("LISTA_INVALIDA:dispositivos.celulares");
  else {
    if (devices.celulares.length === 0) pending.push("dispositivos.celulares");
    devices.celulares.forEach((device, index) => {
      const path = `dispositivos.celulares[${index}]`;
      if (!isRecord(device)) {
        errors.push(`ESTRUCTURA_INVALIDA:${path}`);
        return;
      }
      for (const field of ["modelo", "versionAndroid", "modalidad"]) {
        addRequiredText(device[field], `${path}.${field}`, pending, errors);
      }
      if (!Number.isSafeInteger(device.cantidad) || device.cantidad < 1) {
        errors.push(`CANTIDAD_DISPOSITIVOS_INVALIDA:${path}.cantidad`);
      }
      if (hasText(device.modalidad) && !ALLOWED_DEVICE_OWNERSHIP.has(normalizedCode(device.modalidad))) {
        errors.push(`MODALIDAD_DISPOSITIVO_INVALIDA:${path}.modalidad`);
      }
    });
  }
  if (!Array.isArray(devices.conectividad)) errors.push("LISTA_INVALIDA:dispositivos.conectividad");
  else {
    if (devices.conectividad.length === 0) pending.push("dispositivos.conectividad");
    devices.conectividad.forEach((zone, index) => {
      const path = `dispositivos.conectividad[${index}]`;
      if (!isRecord(zone)) {
        errors.push(`ESTRUCTURA_INVALIDA:${path}`);
        return;
      }
      addRequiredText(zone.zona, `${path}.zona`, pending, errors);
      addRequiredText(zone.senal, `${path}.senal`, pending, errors);
      if (hasText(zone.senal) && !ALLOWED_SIGNAL_STATES.has(normalizedCode(zone.senal))) {
        errors.push(`ESTADO_SENAL_INVALIDO:${path}.senal`);
      }
      if (!isNonNegativeInteger(zone.interrupcionHabitualMinutos)) {
        errors.push(`DURACION_INVALIDA:${path}.interrupcionHabitualMinutos`);
      }
      if (!isNonNegativeInteger(zone.interrupcionMaximaMinutos)) {
        errors.push(`DURACION_INVALIDA:${path}.interrupcionMaximaMinutos`);
      } else if (
        isNonNegativeInteger(zone.interrupcionHabitualMinutos) &&
        zone.interrupcionMaximaMinutos < zone.interrupcionHabitualMinutos
      ) {
        errors.push(`DURACION_INCONSISTENTE:${path}.interrupcionMaximaMinutos`);
      }
    });
  }
  if (!isRecord(devices.computadorMaestro)) errors.push("ESTRUCTURA_INVALIDA:dispositivos.computadorMaestro");
  else {
    for (const field of ["sistemaOperativo", "version", "responsable"]) {
      addRequiredText(devices.computadorMaestro[field], `dispositivos.computadorMaestro.${field}`, pending, errors);
    }
  }
}

function blockStatus(pendingPrefixes, errorMarkers, pending, errors) {
  const hasError = errors.some((entry) => errorMarkers.some((marker) => entry.includes(marker)));
  if (hasError) return "INVALIDO";
  const isPending = pending.some(
    (entry) => pendingPrefixes.some((prefix) => entry.startsWith(prefix)),
  );
  return isPending ? "INCOMPLETO" : "COMPLETO";
}

export function createOwnerDataTemplate() {
  return {
    formato: OWNER_DATA_FORMAT,
    estado: "PENDIENTE_PROPIETARIO",
    vivero: {
      nombre: "",
      responsableEstructura: "",
    },
    estructura: {
      ubicaciones: [],
      lineas: [],
    },
    inventarioInicial: [],
    usuarios: [],
    historicos: {
      decision: "",
      fuentes: [],
    },
    dispositivos: {
      celulares: [],
      conectividad: [],
      computadorMaestro: {
        sistemaOperativo: "",
        version: "",
        responsable: "",
      },
    },
  };
}

export function validateOwnerData(data) {
  const pending = [];
  const errors = findForbiddenPrivateData(data);
  if (!isRecord(data)) {
    return {
      valid: false,
      complete: false,
      errors: [...errors, "ESTRUCTURA_INVALIDA:datos"],
      pending,
      blocks: {},
    };
  }
  if (data.formato !== OWNER_DATA_FORMAT) errors.push("FORMATO_DATOS_REALES_INVALIDO");
  if (!isRecord(data.vivero)) errors.push("ESTRUCTURA_INVALIDA:vivero");
  else {
    addRequiredText(data.vivero.nombre, "vivero.nombre", pending, errors);
    addRequiredText(
      data.vivero.responsableEstructura,
      "vivero.responsableEstructura",
      pending,
      errors,
    );
    if (typeof data.vivero.nombre === "string" && data.vivero.nombre.length > 229) {
      errors.push("TEXTO_DEMASIADO_LARGO:vivero.nombre");
    }
  }
  if (!isRecord(data.estructura)) errors.push("ESTRUCTURA_INVALIDA:estructura");
  const locationsByKey = validateLocations(data.estructura?.ubicaciones, pending, errors);
  const linesByKey = validateLines(data.estructura?.lineas, locationsByKey, pending, errors);
  validateInventory(data.inventarioInicial, linesByKey, pending, errors);
  validateUsers(data.usuarios, pending, errors);
  validateHistory(data.historicos, pending, errors);
  validateDevices(data.dispositivos, pending, errors);

  const uniquePending = [...new Set(pending)].sort();
  const uniqueErrors = [...new Set(errors)].sort();
  const blocks = {
    estructura: blockStatus(
      ["vivero.", "estructura."],
      [
        "vivero.", "estructura.", "UBICACION", "LINEA", "CLAVE_EXTERNA", "CODIGO_",
        "PADRE_", "CICLO_", "LIMITE_UBICACIONES", "LIMITE_LINEAS",
      ],
      uniquePending,
      uniqueErrors,
    ),
    inventarioInicial: blockStatus(
      ["inventarioInicial"],
      ["inventarioInicial", "INVENTARIO", "CANTIDAD_", "TOTAL_", "FECHA_", "REFERENCIA_FUENTE"],
      uniquePending,
      uniqueErrors,
    ),
    usuarios: blockStatus(
      ["usuarios"],
      ["usuarios", "CORREO_", "ROL_", "ESTADO_USUARIO"],
      uniquePending,
      uniqueErrors,
    ),
    historicos: blockStatus(
      ["historicos"],
      ["historicos", "HISTORICOS_", "DECISION_HISTORICOS"],
      uniquePending,
      uniqueErrors,
    ),
    dispositivos: blockStatus(
      ["dispositivos"],
      ["dispositivos", "DISPOSITIVO", "MODALIDAD_", "ESTADO_SENAL", "DURACION_"],
      uniquePending,
      uniqueErrors,
    ),
  };
  const valid = uniqueErrors.length === 0;
  const complete = valid && Object.values(blocks).every((status) => status === "COMPLETO");
  return {valid, complete, errors: uniqueErrors, pending: uniquePending, blocks};
}

function normalizeForHash(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry)).sort(
      (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(
      (entryKey) => [entryKey, normalizeForHash(value[entryKey], entryKey)],
    ));
  }
  if (typeof value !== "string") return value;
  if (key === "codigo") return normalizedCode(value);
  if (key.includes("ClaveExterna") || key === "claveExterna") return normalizedCode(value);
  return normalized(value);
}

export function deterministicMigrationPackageHash(value) {
  return createHash("sha256").update(JSON.stringify(normalizeForHash(value)), "utf8").digest("hex");
}

export function buildPrivateMigrationPackage(data, createdAt = new Date().toISOString()) {
  const validation = validateOwnerData(data);
  const packageBlocksComplete = ["estructura", "inventarioInicial"].every(
    (block) => validation.blocks[block] === "COMPLETO",
  );
  if (!validation.valid || !packageBlocksComplete) throw new Error("DATOS_REALES_INCOMPLETOS");
  const packageValue = {
    formato: MIGRATION_PACKAGE_FORMAT,
    metadatos: {
      nombrePaquete: `ETAPA 21 - ${normalized(data.vivero.nombre)}`,
      creadoEn: createdAt,
      referenciaFuente: "Preparación privada ETAPA 21 validada localmente",
    },
    ubicaciones: data.estructura.ubicaciones.map((location) => ({
      claveExterna: normalizedCode(location.claveExterna),
      ubicacionPadreClaveExterna: location.ubicacionPadreClaveExterna === null
        ? null
        : normalizedCode(location.ubicacionPadreClaveExterna),
      codigo: normalizedCode(location.codigo),
      tipo: normalized(location.tipo),
      nombreVisible: normalized(location.nombreVisible),
      orden: location.orden,
      activa: location.activa,
    })),
    lineas: data.estructura.lineas.map((line) => ({
      claveExterna: normalizedCode(line.claveExterna),
      ubicacionClaveExterna: normalizedCode(line.ubicacionClaveExterna),
      codigo: normalizedCode(line.codigo),
      nombreVisible: normalized(line.nombreVisible),
      orden: line.orden,
      activa: line.activa,
    })),
    inventariosIniciales: data.inventarioInicial.map((inventory) => ({
      lineaClaveExterna: normalizedCode(inventory.lineaClaveExterna),
      hembras: inventory.hembras,
      machos: inventory.machos,
      patrones: inventory.patrones,
      referenciaFuente: [
        normalized(inventory.fuente),
        `corte ${normalized(inventory.fechaCorte)}`,
        `responsable ${normalized(inventory.responsable)}`,
      ].join("; "),
      ...(inventory.lineaVaciaConfirmada === true ? {lineaVaciaConfirmada: true} : {}),
    })),
  };
  const packageBytes = Buffer.byteLength(JSON.stringify(packageValue), "utf8");
  if (packageBytes > MIGRATION_PACKAGE_MAX_BYTES) {
    throw new Error("PAQUETE_EXCEDE_TAMANO_MAXIMO");
  }
  return {
    packageValue,
    hash: deterministicMigrationPackageHash(packageValue),
    packageBytes,
    validation,
    packageBlocksComplete,
  };
}

export function sanitizedOwnerSummary(data, validation = validateOwnerData(data)) {
  const locations = Array.isArray(data?.estructura?.ubicaciones) ? data.estructura.ubicaciones : [];
  const lines = Array.isArray(data?.estructura?.lineas) ? data.estructura.lineas : [];
  const inventories = Array.isArray(data?.inventarioInicial) ? data.inventarioInicial : [];
  const users = Array.isArray(data?.usuarios) ? data.usuarios : [];
  const phones = Array.isArray(data?.dispositivos?.celulares) ? data.dispositivos.celulares : [];
  const roleCounts = {};
  users.forEach((user) => {
    const role = normalizedCode(user?.rol) || "PENDIENTE";
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  });
  const inventoryTotals = inventories.reduce((totals, inventory) => ({
    hembras: totals.hembras + (isNonNegativeInteger(inventory?.hembras) ? inventory.hembras : 0),
    machos: totals.machos + (isNonNegativeInteger(inventory?.machos) ? inventory.machos : 0),
    patrones: totals.patrones + (isNonNegativeInteger(inventory?.patrones) ? inventory.patrones : 0),
  }), {hembras: 0, machos: 0, patrones: 0});
  return {
    valid: validation.valid,
    complete: validation.complete,
    blocks: validation.blocks,
    errorCount: validation.errors.length,
    pendingCount: validation.pending.length,
    counts: {
      locations: locations.length,
      lines: lines.length,
      inventories: inventories.length,
      users: users.length,
      phones: phones.reduce(
        (sum, phone) => sum + (Number.isSafeInteger(phone?.cantidad) ? phone.cantidad : 0),
        0,
      ),
    },
    inventoryTotals: {
      ...inventoryTotals,
      total: inventoryTotals.hembras + inventoryTotals.machos + inventoryTotals.patrones,
    },
    roleCounts,
    historyDecision: hasText(data?.historicos?.decision)
      ? normalizedCode(data.historicos.decision)
      : "PENDIENTE",
  };
}

export function assertPrivateDataPath(repoRoot, candidatePath, extensions = [".json"]) {
  const privateRoot = resolve(repoRoot, ".private");
  const resolved = resolve(candidatePath);
  if (!resolved.startsWith(`${privateRoot}${sep}`)) throw new Error("RUTA_PRIVADA_REQUERIDA");
  if (!extensions.some((extension) => resolved.toLowerCase().endsWith(extension))) {
    throw new Error("EXTENSION_PRIVADA_NO_PERMITIDA");
  }
  return resolved;
}

export function assertCleanupBlocked(value) {
  if (value?.cleanupBlock !== BACKUP_BLOCK) throw new Error("BACKUP_PENDIENTE_REQUERIDO");
  return {cleanupAllowed: false, reason: BACKUP_BLOCK};
}

export function validateResourceClassification(value) {
  const errors = [];
  try {
    assertCleanupBlocked(value);
  } catch (error) {
    errors.push(error.message);
  }
  const sections = [
    ["applications", value?.applications?.items],
    ["accounts", value?.authentication?.accounts],
    ["firestore", value?.firestore?.groups],
    ["iam", value?.iam?.principals],
  ];
  for (const [section, items] of sections) {
    if (!Array.isArray(items)) {
      errors.push(`SECCION_CLASIFICACION_INVALIDA:${section}`);
      continue;
    }
    for (const [index, item] of items.entries()) {
      if (!ALLOWED_CLASSIFICATIONS[section].includes(item?.classification)) {
        errors.push(`CLASIFICACION_INVALIDA:${section}[${index}]`);
      }
    }
  }
  for (const [index, item] of (value?.functions?.items ?? []).entries()) {
    if (item?.classification !== "CONSERVAR_HASTA_REEMPLAZO_CONTROLADO") {
      errors.push(`CLASIFICACION_FUNCTION_INVALIDA:${index}`);
    }
  }
  for (const [index, item] of (value?.storage?.buckets ?? []).entries()) {
    if (item?.classification !== "CONSERVAR") {
      errors.push(`CLASIFICACION_BUCKET_INVALIDA:${index}`);
    }
  }
  if (value?.storage?.objects?.classification !== "CONSERVAR") {
    errors.push("CLASIFICACION_OBJETOS_INVALIDA");
  }
  return {valid: errors.length === 0, errors};
}

export function initialApplicationClassification({displayName, packageName}) {
  const name = normalized(displayName).toLocaleLowerCase("es-CO");
  const packageValue = normalized(packageName).toLocaleLowerCase("es-CO");
  if (name.includes("staging")) return "CANDIDATO_ELIMINACION_FUTURA";
  if (packageValue === "com.arles.viverocontrol") return "REQUIERE_REVISION";
  return "REQUIERE_REVISION";
}

export function summarizePrivateDocument(documentId, data) {
  const summary = {
    fieldNames: isRecord(data) ? Object.keys(data).sort() : [],
    descriptors: [],
    states: [],
    relations: [],
    testMarkers: [],
    redactedFields: [],
  };
  if (TEST_MARKER.test(String(documentId))) {
    summary.testMarkers.push({field: "__documentId", value: String(documentId)});
  }
  const visit = (value, path = "", visited = new WeakSet(), depth = 0) => {
    if (depth > 12) return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`, visited, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    if (visited.has(value)) return;
    visited.add(value);
    for (const [key, entry] of Object.entries(value)) {
      const entryPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_PRIVATE_KEY.test(key)) {
        summary.redactedFields.push(entryPath);
        continue;
      }
      const scalar = privateScalar(entry);
      if (scalar !== undefined && (Array.isArray(scalar) || !isRecord(scalar))) {
        if (DESCRIPTOR_KEY.test(key)) summary.descriptors.push({field: entryPath, value: scalar});
        if (STATE_KEY.test(key)) summary.states.push({field: entryPath, value: scalar});
        if (RELATION_KEY.test(key)) summary.relations.push({field: entryPath, value: scalar});
        const values = Array.isArray(scalar) ? scalar : [scalar];
        for (const candidate of values) {
          if (typeof candidate === "string" && TEST_MARKER.test(candidate)) {
            summary.testMarkers.push({field: entryPath, value: candidate});
          }
        }
      }
      if (isRecord(entry) && typeof entry.path !== "string") {
        visit(entry, entryPath, visited, depth + 1);
      } else if (Array.isArray(entry)) {
        visit(entry, entryPath, visited, depth + 1);
      }
    }
  };
  visit(data);
  return summary;
}

export function collectExactIdentifierReferences(data, identifiers) {
  const matches = [];
  const identifierSet = new Set(identifiers.filter(hasText));
  visitValues(data, (value, path) => {
    if (typeof value !== "string") return;
    for (const identifier of identifierSet) {
      if (value === identifier || value.endsWith(`/${identifier}`)) {
        matches.push({identifier, field: path});
      }
    }
  });
  return matches;
}

export function redactKnownIdentifiers(value, identifiers) {
  if (typeof value === "string") {
    return identifiers.reduce(
      (result, identifier) => result.replaceAll(identifier, maskIdentifier(identifier)),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((entry) => redactKnownIdentifiers(entry, identifiers));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(
      ([key, entry]) => [key, redactKnownIdentifiers(entry, identifiers)],
    ));
  }
  return value;
}

export function assertPreparationRemoteRead(urlValue, method = "GET") {
  const url = new URL(urlValue);
  const normalizedMethod = String(method).toUpperCase();
  if (url.protocol !== "https:") throw new Error("LECTURA_REMOTA_NO_PERMITIDA");
  const firebaseApps = url.hostname === "firebase.googleapis.com" &&
    new RegExp(
      `^/v1beta1/projects/${PRODUCTION_PROJECT_ID}/(?:androidApps|webApps|iosApps)$`,
      "u",
    ).test(url.pathname);
  const functions = url.hostname === "cloudfunctions.googleapis.com" &&
    url.pathname === `/v2/projects/${PRODUCTION_PROJECT_ID}/locations/us-central1/functions`;
  const buckets = url.hostname === "storage.googleapis.com" &&
    url.pathname === "/storage/v1/b" && url.searchParams.get("project") === PRODUCTION_PROJECT_ID;
  const iamPolicy = url.hostname === "cloudresourcemanager.googleapis.com" &&
    url.pathname === `/v1/projects/${PRODUCTION_PROJECT_ID}:getIamPolicy`;
  const firestoreRoot =
    `/v1/projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents`;
  const firestoreRelativePath = url.pathname.startsWith(`${firestoreRoot}/`)
    ? url.pathname.slice(firestoreRoot.length + 1)
    : "";
  const firestoreSegments = firestoreRelativePath.split("/").filter(Boolean);
  const firestoreDocumentList = url.hostname === "firestore.googleapis.com" &&
    url.pathname.startsWith(`${firestoreRoot}/`) &&
    !url.pathname.endsWith(":listCollectionIds") &&
    firestoreSegments.length % 2 === 1;
  const collectionIdsSuffix = ":listCollectionIds";
  const collectionIdsParent = url.pathname.startsWith(firestoreRoot) &&
    url.pathname.endsWith(collectionIdsSuffix)
    ? url.pathname.slice(firestoreRoot.length, -collectionIdsSuffix.length)
    : "INVALID";
  const collectionIdsSegments = collectionIdsParent.replace(/^\//u, "").split("/").filter(Boolean);
  const firestoreCollectionIds = url.hostname === "firestore.googleapis.com" &&
    collectionIdsParent !== "INVALID" &&
    (collectionIdsParent === "" || collectionIdsSegments.length % 2 === 0);
  if (
    (normalizedMethod === "GET" && (firebaseApps || functions || buckets || firestoreDocumentList)) ||
    (normalizedMethod === "POST" && (iamPolicy || firestoreCollectionIds))
  ) return true;
  throw new Error("LECTURA_REMOTA_NO_PERMITIDA");
}
