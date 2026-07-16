import {useState} from "react";

import type {
  MigrationValidationEntity,
  MigrationValidationIssue,
  MigrationValidationReport,
  MonitorRepository,
} from "../domain/MonitorModels";

interface MigrationValidationSectionProps {
  readonly repository: MonitorRepository;
}

const MAX_FILE_BYTES = 512_000;
const ROOT_FIELDS = new Set(["formato", "metadatos", "ubicaciones", "lineas", "inventariosIniciales"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateLocalMigrationPackage(value: unknown, size: number): string | undefined {
  if (size > MAX_FILE_BYTES) return "El archivo supera el máximo técnico de 512.000 bytes.";
  if (!isRecord(value)) return "El archivo debe contener un objeto JSON.";
  const extras = Object.keys(value).filter((field) => !ROOT_FIELDS.has(field));
  if (extras.length > 0) return `El archivo contiene campos raíz no permitidos: ${extras.join(", ")}.`;
  if (value.formato !== "paquete-migracion-catalogo-v1") {
    return "El formato debe ser paquete-migracion-catalogo-v1.";
  }
  if (!isRecord(value.metadatos) || !Array.isArray(value.ubicaciones) ||
      !Array.isArray(value.lineas) || !Array.isArray(value.inventariosIniciales)) {
    return "Faltan metadatos o listas obligatorias del formato v1.";
  }
  return undefined;
}

function entityLabel(entity: MigrationValidationEntity): string {
  return {
    PAQUETE: "Paquete",
    UBICACION: "Ubicación",
    LINEA: "Línea",
    INVENTARIO_INICIAL: "Inventario inicial",
  }[entity];
}

export function MigrationValidationSection({repository}: MigrationValidationSectionProps) {
  const [packageData, setPackageData] = useState<unknown>();
  const [fileName, setFileName] = useState<string>();
  const [localCounts, setLocalCounts] = useState<{locations: number; lines: number; inventories: number}>();
  const [report, setReport] = useState<MigrationValidationReport>();
  const [error, setError] = useState<string>();
  const [validating, setValidating] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("TODAS");
  const [entityFilter, setEntityFilter] = useState("TODAS");

  const selectFile = async (file: File | undefined) => {
    setPackageData(undefined);
    setFileName(undefined);
    setLocalCounts(undefined);
    setReport(undefined);
    setError(undefined);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const localError = validateLocalMigrationPackage(parsed, new TextEncoder().encode(text).length);
      if (localError) {
        setError(localError);
        return;
      }
      const root = parsed as Record<string, unknown>;
      setPackageData(parsed);
      setFileName(file.name);
      setLocalCounts({
        locations: (root.ubicaciones as unknown[]).length,
        lines: (root.lineas as unknown[]).length,
        inventories: (root.inventariosIniciales as unknown[]).length,
      });
    } catch {
      setError("No fue posible leer un JSON válido. El archivo permanece únicamente en memoria local.");
    }
  };

  const validate = async () => {
    if (packageData === undefined || validating) return;
    setValidating(true);
    setError(undefined);
    try {
      setReport(await repository.validateMigrationPackage(packageData));
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "No fue posible validar el paquete.");
    } finally {
      setValidating(false);
    }
  };

  const exportReport = () => {
    if (!report) return;
    const safeExport = {
      tipo: "INFORME_VALIDACION_MIGRACION_ETAPA_18",
      confirmacion: "SOLO_VALIDACION_SIN_IMPORTACION_NI_ESCRITURAS",
      ...report,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(safeExport, null, 2)], {type: "application/json"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `informe-validacion-migracion-${report.packageHash.slice(0, 12)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const issues: readonly MigrationValidationIssue[] = report
    ? [...report.blockingErrors, ...report.warnings]
    : [];
  const visibleIssues = issues.filter((issue) =>
    (severityFilter === "TODAS" || issue.severity === severityFilter) &&
    (entityFilter === "TODAS" || issue.entity === entityFilter)
  );

  return (
    <section className="migration-validation" aria-labelledby="migration-validation-title">
      <header className="section-heading">
        <div>
          <p className="eyebrow">ETAPA 18 · SOLO LECTURA</p>
          <h1 id="migration-validation-title">Migración — Validación</h1>
        </div>
      </header>
      <div className="migration-safety-banner">
        <strong>NO IMPORTA NI ESCRIBE DATOS</strong>
        <span>El resultado es informativo y funciona exclusivamente con Firebase Emulator Suite.</span>
      </div>
      <p className="read-only-note">
        Selecciona localmente un paquete ficticio v1. El archivo no se guarda ni se persiste automáticamente.
      </p>
      <label className="migration-file-picker">
        Archivo JSON local
        <input
          aria-label="Archivo JSON de migración"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
      </label>
      {error && <p className="alert" role="alert">{error}</p>}
      {fileName && localCounts && (
        <div className="migration-local-summary">
          <strong>Estructura local válida: {fileName}</strong>
          <span>{localCounts.locations} ubicaciones · {localCounts.lines} líneas · {localCounts.inventories} inventarios</span>
          <button className="button" type="button" disabled={validating} onClick={() => void validate()}>
            {validating ? "Validando en emulador…" : "Validar paquete en emulador"}
          </button>
        </div>
      )}

      {report && (
        <section className="migration-report" aria-labelledby="migration-report-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">INFORME SIN ESCRITURAS</p>
              <h2 id="migration-report-title">Resultado de validación</h2>
            </div>
            <button className="button button--secondary" type="button" onClick={exportReport}>
              Exportar informe seguro
            </button>
          </div>
          <div className="migration-report-summary">
            <span><strong>Hash SHA-256</strong>{report.packageHash}</span>
            <span><strong>Errores</strong>{report.blockingErrors.length}</span>
            <span><strong>Advertencias</strong>{report.warnings.length}</span>
            <span><strong>Resultado informativo</strong>{report.eligibleToImport ? "Apto para una futura importación" : "Bloqueado"}</span>
          </div>
          <p className={report.eligibleToImport ? "notice" : "alert"}>
            Validación terminada. No se realizó ninguna importación ni modificación del catálogo o inventario.
          </p>
          <div className="migration-conflicts">
            <span>Códigos existentes: {report.conflicts.existingCodes}</span>
            <span>Claves incompatibles: {report.conflicts.incompatibleKeys}</span>
            <span>Líneas con inventario: {report.conflicts.linesWithCurrentInventory}</span>
            <span>Conflictos operativos: {report.conflicts.operationalConflicts}</span>
          </div>
          <div className="monitor-filters">
            <label>Severidad<select aria-label="Filtrar severidad" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="TODAS">Todas</option><option value="ERROR">Errores</option><option value="ADVERTENCIA">Advertencias</option></select></label>
            <label>Entidad<select aria-label="Filtrar entidad" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}><option value="TODAS">Todas</option><option value="PAQUETE">Paquete</option><option value="UBICACION">Ubicaciones</option><option value="LINEA">Líneas</option><option value="INVENTARIO_INICIAL">Inventarios</option></select></label>
          </div>
          <div className="migration-issues">
            {visibleIssues.length === 0 ? <p>Sin hallazgos para los filtros seleccionados.</p> : visibleIssues.map((issue, index) => (
              <article className={`migration-issue migration-issue--${issue.severity.toLowerCase()}`} key={`${issue.code}-${issue.externalKey ?? "package"}-${index}`}>
                <strong>{issue.severity} · {entityLabel(issue.entity)} · {issue.code}</strong>
                {issue.externalKey && <span>{issue.externalKey}</span>}
                <p>{issue.message}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
