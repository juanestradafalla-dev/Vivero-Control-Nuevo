import {type FormEvent, useEffect, useMemo, useRef, useState} from "react";

import type {
  DraftActivationResult,
  DraftCatalogLine,
  ManageableDraftJourney,
  ManageableJourneysData,
  MonitorRepository,
  MonitorUser,
} from "../domain/MonitorModels";
import {DraftParticipantsEditor} from "./DraftParticipantsEditor";

interface DraftJourneysSectionProps {
  readonly repository: MonitorRepository;
  readonly user: MonitorUser;
  readonly onActiveJourneysChanged: () => void | Promise<void>;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("es-CO", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(date);
}

function groupKey(line: DraftCatalogLine): string {
  return `${line.location.nursery}\u0000${line.location.module}\u0000${line.location.bed}`;
}

export function DraftJourneysSection({repository, user, onActiveJourneysChanged}: DraftJourneysSectionProps) {
  const [data, setData] = useState<ManageableJourneysData>({journeys: [], cancelledJourneys: [], catalogLines: []});
  const [selectedDraftId, setSelectedDraftId] = useState<string>();
  const [selectedCancelledId, setSelectedCancelledId] = useState<string>();
  const [selectedLineIds, setSelectedLineIds] = useState<readonly string[]>([]);
  const [draftName, setDraftName] = useState("");
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("TODAS");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [showReopenSummary, setShowReopenSummary] = useState(false);
  const [showSaveSummary, setShowSaveSummary] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const createKey = useRef<string | undefined>(undefined);
  const saveKey = useRef<string | undefined>(undefined);
  const reopenKey = useRef<string | undefined>(undefined);

  const load = async (): Promise<ManageableJourneysData | undefined> => {
    setLoading(true);
    try {
      const next = await repository.listManageableJourneys();
      setData(next);
      setError(undefined);
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No fue posible cargar los borradores.");
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedDraft = data.journeys.find((journey) => journey.id === selectedDraftId);
  const selectedCancelled = data.cancelledJourneys.find((journey) => journey.id === selectedCancelledId);
  const cancelledLines = selectedCancelled?.lineIds.flatMap((lineId) => {
    const line = data.catalogLines.find((candidate) => candidate.id === lineId);
    return line ? [line] : [];
  }) ?? [];
  const visibleLines = data.catalogLines.filter((line) => {
    const haystack = [
      line.displayName,
      line.location.nursery,
      line.location.module,
      line.location.bed,
      line.location.line,
    ].join(" ").toLocaleLowerCase("es");
    const matchesAvailability = availabilityFilter === "TODAS" ||
      (availabilityFilter === "DISPONIBLES" ? line.selectable : !line.selectable);
    return matchesAvailability && haystack.includes(search.trim().toLocaleLowerCase("es"));
  });
  const groups = useMemo(() => {
    const next = new Map<string, DraftCatalogLine[]>();
    for (const line of visibleLines) next.set(groupKey(line), [...(next.get(groupKey(line)) ?? []), line]);
    return [...next.entries()];
  }, [visibleLines]);

  const openDraft = (journey: ManageableDraftJourney) => {
    setSelectedDraftId(journey.id);
    setSelectedCancelledId(undefined);
    setSelectedLineIds(journey.lineIds);
    setShowSaveSummary(false);
    saveKey.current = undefined;
    setError(undefined);
    setNotice(undefined);
  };

  const openCancelled = (journeyId: string) => {
    setSelectedDraftId(undefined);
    setSelectedCancelledId(journeyId);
    setSelectedLineIds([]);
    setShowSaveSummary(false);
    setShowReopenSummary(false);
    reopenKey.current = undefined;
    setError(undefined);
    setNotice(undefined);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draftName.trim();
    if (name === "" || creating) {
      if (name === "") setError("Escribe un nombre para la jornada.");
      return;
    }
    setCreating(true);
    setError(undefined);
    const idempotencyKey = createKey.current ?? crypto.randomUUID();
    createKey.current = idempotencyKey;
    try {
      const created = await repository.createDraftJourney(name, idempotencyKey);
      createKey.current = undefined;
      setDraftName("");
      const next = await load();
      const refreshed = next?.journeys.find((journey) => journey.id === created.id) ?? created;
      openDraft(refreshed);
      setNotice("Jornada creada en BORRADOR. Aun no esta disponible en Campo.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No fue posible crear el borrador.");
    } finally {
      setCreating(false);
    }
  };

  const toggleLine = (line: DraftCatalogLine) => {
    if (!line.selectable) return;
    setSelectedLineIds((current) => current.includes(line.id)
      ? current.filter((lineId) => lineId !== line.id)
      : [...new Set([...current, line.id])]);
    setShowSaveSummary(false);
    saveKey.current = undefined;
    setNotice(undefined);
  };

  const confirmSave = async () => {
    if (!selectedDraft || saving) return;
    setSaving(true);
    setError(undefined);
    const idempotencyKey = saveKey.current ?? crypto.randomUUID();
    saveKey.current = idempotencyKey;
    try {
      await repository.updateDraftJourneyLines(selectedDraft.id, selectedLineIds, idempotencyKey);
      saveKey.current = undefined;
      const next = await load();
      const refreshed = next?.journeys.find((journey) => journey.id === selectedDraft.id);
      if (refreshed) openDraft(refreshed);
      setShowSaveSummary(false);
      setNotice("Seleccion guardada y confirmada centralmente.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No fue posible guardar la seleccion.");
    } finally {
      setSaving(false);
    }
  };

  const handleActivated = async (result: DraftActivationResult) => {
    setSelectedDraftId(undefined);
    setSelectedLineIds([]);
    setShowSaveSummary(false);
    saveKey.current = undefined;
    await load();
    await onActiveJourneysChanged();
    setNotice(
      `Jornada activada correctamente: ${result.lineCount} líneas y ${result.participantCount} participantes. Campo ya puede verla.`,
    );
  };

  const handleCancelled = async () => {
    setSelectedDraftId(undefined);
    setSelectedLineIds([]);
    setShowSaveSummary(false);
    saveKey.current = undefined;
    await load();
    setNotice("Borrador cancelado. Sus selecciones permanecen conservadas en modo lectura.");
  };

  const confirmReopen = async () => {
    if (!selectedCancelled || reopening) return;
    setReopening(true);
    setError(undefined);
    const key = reopenKey.current ?? crypto.randomUUID();
    reopenKey.current = key;
    try {
      await repository.reopenCancelledJourney(selectedCancelled.id, selectedCancelled.version, key);
      reopenKey.current = undefined;
      setShowReopenSummary(false);
      setSelectedCancelledId(undefined);
      const next = await load();
      const reopened = next?.journeys.find((journey) => journey.id === selectedCancelled.id);
      if (reopened) openDraft(reopened);
      setNotice("Borrador reabierto. Las selecciones conservadas vuelven a estar disponibles para edición.");
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : "No fue posible reabrir el borrador.");
    } finally {
      setReopening(false);
    }
  };

  const lineSelectionDirty = selectedDraft
    ? [...selectedLineIds].sort().join("|") !== [...selectedDraft.lineIds].sort().join("|")
    : false;

  return (
    <section className="monitor draft-journeys" aria-labelledby="journeys-title">
      <div className="monitor-heading">
        <div>
          <p className="eyebrow">ETAPA 12</p>
          <h1 id="journeys-title">Jornadas</h1>
          <p className="draft-warning">BORRADOR — AÚN NO DISPONIBLE EN CAMPO</p>
        </div>
        <span>{user.role === "ADMINISTRADOR" ? "Todos los borradores" : "Solo tus borradores"}</span>
      </div>

      {error && <p className="alert" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <form className="draft-create-form" onSubmit={handleCreate}>
        <label>
          Nombre de la nueva jornada
          <input
            aria-label="Nombre de la nueva jornada"
            maxLength={200}
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value);
              createKey.current = undefined;
            }}
            placeholder="Ej. Conteo semanal vivero norte"
          />
        </label>
        <button className="button" type="submit" disabled={creating}>
          {creating ? "Creando…" : "Crear borrador"}
        </button>
      </form>

      <div className="draft-layout">
        <aside className="draft-list" aria-label="Jornadas en borrador">
          <h2>Borradores</h2>
          {loading ? (
            <p>Cargando…</p>
          ) : data.journeys.length === 0 ? (
            <p>No hay borradores administrables.</p>
          ) : data.journeys.map((journey) => (
            <button
              className={journey.id === selectedDraftId ? "draft-card draft-card--selected" : "draft-card"}
              key={journey.id}
              type="button"
              onClick={() => openDraft(journey)}
            >
              <strong>{journey.displayName}</strong>
              <span>BORRADOR · {journey.lineIds.length} líneas</span>
              <span>Creada por {journey.creatorDisplayName}</span>
              <span>Versión {journey.version} · {formatTime(journey.updatedAt)}</span>
            </button>
          ))}
          <h2>Borradores cancelados</h2>
          {data.cancelledJourneys.length === 0 ? (
            <p>No hay borradores cancelados.</p>
          ) : data.cancelledJourneys.map((journey) => (
            <button
              className={journey.id === selectedCancelledId ? "draft-card draft-card--selected" : "draft-card"}
              key={journey.id}
              type="button"
              onClick={() => openCancelled(journey.id)}
            >
              <strong>{journey.displayName}</strong>
              <span>CANCELADO · {journey.lineIds.length} líneas</span>
              <span>Por {journey.cancelledByDisplayName}</span>
              <span>{formatTime(journey.cancelledAt)}</span>
            </button>
          ))}
        </aside>

        <div className="draft-editor">
          {selectedCancelled ? (
            <section className="cancelled-draft-detail" aria-labelledby="cancelled-draft-title">
              <div className="draft-editor-heading">
                <div>
                  <span className="state state--inactive">CANCELADO</span>
                  <h2 id="cancelled-draft-title">{selectedCancelled.displayName}</h2>
                  <p>BORRADOR CANCELADO — SOLO LECTURA</p>
                </div>
                <button className="button" type="button" disabled={reopening} onClick={() => setShowReopenSummary(true)}>
                  Reabrir borrador
                </button>
              </div>
              <div className="inventory-summary" aria-label="Datos de cancelación">
                <span>Creada por: {selectedCancelled.creatorDisplayName}</span>
                <span>Cancelada por: {selectedCancelled.cancelledByDisplayName}</span>
                <span>Fecha: {formatTime(selectedCancelled.cancelledAt)}</span>
                <span>Motivo: {selectedCancelled.cancellationReason}</span>
                <span>Versión: {selectedCancelled.version}</span>
              </div>
              <h3>Líneas conservadas</h3>
              {cancelledLines.length === 0 ? <p>No había líneas seleccionadas.</p> : cancelledLines.map((line) => (
                <p key={line.id}>{line.location.nursery} · {line.location.module} · {line.location.bed} · {line.displayName}</p>
              ))}
              <h3>Participantes conservados</h3>
              {selectedCancelled.participants.length === 0 ? <p>No había participantes seleccionados.</p> : (
                <div className="participant-list">
                  {selectedCancelled.participants.map((participant) => (
                    <div className="participant-row" key={participant.id}>
                      <span><strong>{participant.displayName}</strong><small>{participant.role}</small></span>
                      <span>{participant.canCount ? "Puede contar" : "No cuenta"}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : !selectedDraft ? (
            <p className="empty-state">Abre un borrador para seleccionar sus líneas.</p>
          ) : (
            <>
              <div className="draft-editor-heading">
                <div>
                  <span className="state state--draft">BORRADOR</span>
                  <h2>{selectedDraft.displayName}</h2>
                  <p>{selectedLineIds.length} líneas seleccionadas</p>
                </div>
                <button
                  className="button"
                  type="button"
                  disabled={saving}
                  onClick={() => setShowSaveSummary(true)}
                >
                  Revisar selección
                </button>
              </div>
              <div className="monitor-filters">
                <label>
                  Buscar línea
                  <input
                    aria-label="Buscar línea del catálogo"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Vivero, módulo, cama o línea"
                  />
                </label>
                <label>
                  Disponibilidad
                  <select
                    aria-label="Filtrar disponibilidad"
                    value={availabilityFilter}
                    onChange={(event) => setAvailabilityFilter(event.target.value)}
                  >
                    <option value="TODAS">Todas</option>
                    <option value="DISPONIBLES">Seleccionables</option>
                    <option value="OCUPADAS">No seleccionables</option>
                  </select>
                </label>
              </div>
              <div className="catalog-groups">
                {groups.map(([key, lines]) => {
                  const first = lines[0];
                  if (!first) return null;
                  return (
                    <section className="catalog-group" key={key}>
                      <h3>{first.location.nursery} · {first.location.module} · {first.location.bed}</h3>
                      {lines.map((line) => (
                        <label className={line.selectable ? "catalog-line" : "catalog-line catalog-line--disabled"} key={line.id}>
                          <input
                            type="checkbox"
                            checked={selectedLineIds.includes(line.id)}
                            disabled={!line.selectable}
                            onChange={() => toggleLine(line)}
                          />
                          <span>
                            <strong>{line.displayName}</strong>
                            <small>{line.location.line}</small>
                          </span>
                          {!line.selectable && (
                            <em>{line.unavailableReason === "LINEA_INACTIVA" ? "Línea inactiva; corrige la selección" : "Ya pertenece a una jornada activa"}</em>
                          )}
                        </label>
                      ))}
                    </section>
                  );
                })}
              </div>
              <DraftParticipantsEditor
                repository={repository}
                journey={selectedDraft}
                catalogLines={data.catalogLines}
                lineSelectionDirty={lineSelectionDirty}
                onActivated={handleActivated}
                onCancelled={handleCancelled}
              />
            </>
          )}
        </div>
      </div>

      {showSaveSummary && selectedDraft && (
        <div className="dialog-backdrop" role="presentation">
          <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-save-title">
            <p className="eyebrow">CONFIRMACIÓN CENTRAL</p>
            <h2 id="draft-save-title">Guardar selección de líneas</h2>
            <div className="inventory-summary" aria-label="Resumen de selección de líneas">
              <strong>{selectedDraft.displayName}</strong>
              <span>Estado: BORRADOR</span>
              <span>Líneas seleccionadas: {selectedLineIds.length}</span>
              <span>No se crearán estados DISPONIBLE ni inventario.</span>
            </div>
            <div className="dialog-actions">
              <button className="button button--secondary" type="button" disabled={saving} onClick={() => setShowSaveSummary(false)}>
                Volver
              </button>
              <button className="button" type="button" disabled={saving} onClick={confirmSave}>
                {saving ? "Guardando…" : "Confirmar y guardar"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showReopenSummary && selectedCancelled && (
        <div className="dialog-backdrop" role="presentation">
          <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="reopen-draft-title">
            <p className="eyebrow">REAPERTURA TRANSACCIONAL</p>
            <h2 id="reopen-draft-title">Reabrir borrador</h2>
            <div className="inventory-summary" aria-label="Resumen de reapertura">
              <strong>{selectedCancelled.displayName}</strong>
              <span>Líneas conservadas: {selectedCancelled.lineIds.length}</span>
              <span>Participantes conservados: {selectedCancelled.participants.length}</span>
              <span>La cancelación anterior permanecerá en la trazabilidad.</span>
            </div>
            <div className="dialog-actions">
              <button className="button button--secondary" type="button" disabled={reopening} onClick={() => setShowReopenSummary(false)}>
                Volver
              </button>
              <button className="button" type="button" disabled={reopening} onClick={confirmReopen}>
                {reopening ? "Reabriendo…" : "Confirmar reapertura"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
