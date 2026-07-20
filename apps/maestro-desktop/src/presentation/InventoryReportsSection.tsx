import {useEffect, useMemo, useRef, useState} from "react";

import type {
  InventoryReportStatus,
  InventoryReportSummary,
  MonitorRepository,
} from "../domain/MonitorModels";

interface InventoryReportsSectionProps {
  readonly repository: MonitorRepository;
}

const statusLabels: Record<InventoryReportStatus, string> = {
  PENDIENTE: "Pendiente",
  PROCESANDO: "Procesando",
  COMPLETADO: "Completado",
  ERROR_REINTENTABLE: "Error reintentable",
  ERROR_PERMANENTE: "Error permanente",
};

function formatTime(value: string | undefined): string {
  if (!value) return "No disponible";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("es-CO", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(date);
}

export function InventoryReportsSection({repository}: InventoryReportsSectionProps) {
  const [reports, setReports] = useState<readonly InventoryReportSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [loading, setLoading] = useState(true);
  const [retryingJourneyId, setRetryingJourneyId] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const retryKeys = useRef(new Map<string, string>());

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await repository.listInventoryReports();
      setReports(result.informes);
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No fue posible cargar los informes de inventario.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleReports = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return reports.filter((report) =>
      (statusFilter === "TODOS" || report.estado === statusFilter) &&
      `${report.jornadaNombreVisible} ${report.archivoNombre ?? ""} ${report.errorCodigo ?? ""}`
        .toLocaleLowerCase("es")
        .includes(term)
    );
  }, [reports, search, statusFilter]);

  const retry = async (report: InventoryReportSummary): Promise<void> => {
    if (report.estado !== "ERROR_REINTENTABLE" || retryingJourneyId) return;
    setRetryingJourneyId(report.jornadaId);
    setError(undefined);
    setNotice(undefined);
    const key = retryKeys.current.get(report.jornadaId) ?? crypto.randomUUID();
    retryKeys.current.set(report.jornadaId, key);
    try {
      await repository.retryInventoryReport({jornadaId: report.jornadaId, claveIdempotencia: key});
      retryKeys.current.delete(report.jornadaId);
      await load();
      setNotice("Reintento solicitado de forma idempotente.");
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "No fue posible reintentar el informe.");
    } finally {
      setRetryingJourneyId(undefined);
    }
  };

  const openReport = async (report: InventoryReportSummary): Promise<void> => {
    if (!report.archivoEnlace) return;
    setError(undefined);
    const openExternalUrl = window.viveroFoundation?.openExternalUrl;
    if (!openExternalUrl) {
      setError("La apertura segura del archivo no está disponible en esta instalación.");
      return;
    }
    try {
      const opened = await openExternalUrl(report.archivoEnlace);
      if (!opened) setError("El enlace del informe no pertenece a un destino permitido.");
    } catch {
      setError("No fue posible abrir el informe de forma segura.");
    }
  };

  return (
    <section className="monitor inventory-reports" aria-labelledby="inventory-reports-title">
      <div className="monitor-heading">
        <div>
          <p className="eyebrow">INFORMES CENTRALIZADOS</p>
          <h1 id="inventory-reports-title">Informes de inventario</h1>
          <p>Maestro consulta el estado central. No accede directamente a Google Drive.</p>
        </div>
        <button className="button button--secondary" type="button" disabled={loading} onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      {error && <p className="alert" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="monitor-filters">
        <label>
          Buscar informe
          <input
            aria-label="Buscar informe"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Jornada, archivo o código de error"
          />
        </label>
        <label>
          Estado
          <select aria-label="Filtrar informes por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="TODOS">Todos</option>
            {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
          </select>
        </label>
      </div>

      {loading ? <p className="empty-state">Cargando informes…</p> : visibleReports.length === 0 ? (
        <p className="empty-state">No hay informes que coincidan con el filtro.</p>
      ) : (
        <div className="report-grid" aria-label="Informes de inventario">
          {visibleReports.map((report) => (
            <article className="report-card" key={report.informeId}>
              <div className="report-card-heading">
                <div>
                  <span className={`state report-state report-state--${report.estado.toLocaleLowerCase("es")}`}>
                    {statusLabels[report.estado]}
                  </span>
                  <h2>{report.jornadaNombreVisible}</h2>
                </div>
                <strong>{report.mes}/{report.anio}</strong>
              </div>
              <dl className="count-detail">
                <div><dt>Fuente de plantas muertas</dt><dd>{report.fuentePlantasMuertas === "CONTEO_FISICO" ? "Conteo físico" : "Descartes aprobados"}</dd></div>
                <div><dt>Intentos</dt><dd>{report.intentos}</dd></div>
                <div><dt>Creado</dt><dd>{formatTime(report.creadoEn)}</dd></div>
                <div><dt>Actualizado</dt><dd>{formatTime(report.actualizadoEn)}</dd></div>
                <div><dt>Finalizado</dt><dd>{formatTime(report.finalizadoEn)}</dd></div>
                {report.archivoNombre && <div><dt>Archivo</dt><dd>{report.archivoNombre}</dd></div>}
                {report.errorCodigo && <div><dt>Código</dt><dd>{report.errorCodigo}</dd></div>}
                {report.errorMensaje && <div><dt>Detalle</dt><dd>{report.errorMensaje}</dd></div>}
              </dl>
              <div className="review-actions">
                {report.estado === "COMPLETADO" && report.archivoEnlace && (
                  <button className="button" type="button" onClick={() => void openReport(report)}>
                    Abrir archivo
                  </button>
                )}
                {report.estado === "ERROR_REINTENTABLE" && (
                  <button
                    className="button"
                    type="button"
                    disabled={retryingJourneyId !== undefined}
                    onClick={() => void retry(report)}
                  >
                    {retryingJourneyId === report.jornadaId ? "Reintentando…" : "Reintentar"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
