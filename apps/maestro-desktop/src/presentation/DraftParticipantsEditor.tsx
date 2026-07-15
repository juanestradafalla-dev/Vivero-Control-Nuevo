import {useEffect, useMemo, useRef, useState} from "react";

import type {
  DraftParticipantInput,
  DraftParticipantsData,
  ManageableDraftJourney,
  MonitorRepository,
  MonitorRole,
} from "../domain/MonitorModels";

interface DraftParticipantsEditorProps {
  readonly repository: MonitorRepository;
  readonly journey: ManageableDraftJourney;
}

const roleLabels: Record<MonitorRole, string> = {
  AUXILIAR: "Auxiliar",
  SUPERVISOR: "Supervisor",
  ADMINISTRADOR: "Administrador",
};

export function DraftParticipantsEditor({repository, journey}: DraftParticipantsEditorProps) {
  const [data, setData] = useState<DraftParticipantsData>();
  const [selection, setSelection] = useState<readonly DraftParticipantInput[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("TODOS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const saveKey = useRef<string | undefined>(undefined);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const next = await repository.listDraftJourneyParticipants(journey.id);
      setData(next);
      setSelection(next.participants.map((participant) => ({
        userId: participant.id,
        canCount: participant.canCount,
      })));
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No fue posible cargar participantes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(undefined);
    setSelection([]);
    setSearch("");
    setRoleFilter("TODOS");
    setShowSummary(false);
    setNotice(undefined);
    saveKey.current = undefined;
    void load();
  }, [journey.id]);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return (data?.activeUsers ?? []).filter((user) =>
      (roleFilter === "TODOS" || user.role === roleFilter) &&
      `${user.displayName} ${roleLabels[user.role]}`.toLocaleLowerCase("es").includes(term)
    );
  }, [data, roleFilter, search]);

  const updateSelection = (next: readonly DraftParticipantInput[]) => {
    setSelection([...new Map(next.map((participant) => [participant.userId, participant])).values()]);
    saveKey.current = undefined;
    setShowSummary(false);
    setNotice(undefined);
  };

  const toggleParticipant = (userId: string) => {
    const current = selection.find((participant) => participant.userId === userId);
    updateSelection(current
      ? selection.filter((participant) => participant.userId !== userId)
      : [...selection, {userId, canCount: true}]);
  };

  const toggleCanCount = (userId: string) => {
    updateSelection(selection.map((participant) => participant.userId === userId
      ? {...participant, canCount: !participant.canCount}
      : participant));
  };

  const confirmSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    const key = saveKey.current ?? crypto.randomUUID();
    saveKey.current = key;
    try {
      await repository.updateDraftJourneyParticipants(journey.id, selection, key);
      saveKey.current = undefined;
      await load();
      setShowSummary(false);
      setNotice("Participantes guardados centralmente. La jornada continúa en BORRADOR.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No fue posible guardar participantes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="draft-participants" aria-labelledby="participants-title">
      <div className="draft-editor-heading">
        <div>
          <span className="state state--draft">BORRADOR</span>
          <h3 id="participants-title">Participantes</h3>
          <p>{selection.length} participantes seleccionados</p>
        </div>
        <button className="button" type="button" disabled={loading || saving} onClick={() => setShowSummary(true)}>
          Revisar participantes
        </button>
      </div>

      <p className="draft-warning">BORRADOR — LOS PARTICIPANTES AÚN NO TIENEN AUTORIZACIÓN OPERATIVA</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="monitor-filters">
        <label>
          Buscar usuario
          <input
            aria-label="Buscar participante"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre o rol"
          />
        </label>
        <label>
          Rol
          <select aria-label="Filtrar participantes por rol" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="TODOS">Todos</option>
            <option value="AUXILIAR">Auxiliares</option>
            <option value="SUPERVISOR">Supervisores</option>
            <option value="ADMINISTRADOR">Administradores</option>
          </select>
        </label>
      </div>

      {loading ? <p>Cargando usuarios activos…</p> : (
        <div className="participant-list">
          {visibleUsers.map((user) => {
            const selected = selection.find((participant) => participant.userId === user.id);
            return (
              <div className={selected ? "participant-row participant-row--selected" : "participant-row"} key={user.id}>
                <label>
                  <input
                    aria-label={`Seleccionar ${user.displayName}`}
                    type="checkbox"
                    checked={Boolean(selected)}
                    onChange={() => toggleParticipant(user.id)}
                  />
                  <span><strong>{user.displayName}</strong><small>{roleLabels[user.role]}</small></span>
                </label>
                <label className="can-count-toggle">
                  <input
                    aria-label={`Puede contar ${user.displayName}`}
                    type="checkbox"
                    checked={selected?.canCount ?? false}
                    disabled={!selected}
                    onChange={() => toggleCanCount(user.id)}
                  />
                  Puede contar
                </label>
              </div>
            );
          })}
        </div>
      )}

      {showSummary && (
        <div className="dialog-backdrop" role="presentation">
          <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="participant-summary-title">
            <p className="eyebrow">CONFIRMACIÓN CENTRAL</p>
            <h2 id="participant-summary-title">Guardar participantes</h2>
            <div className="inventory-summary" aria-label="Resumen de participantes">
              <strong>{journey.displayName}</strong>
              <span>Estado: BORRADOR</span>
              <span>Participantes: {selection.length}</span>
              <span>Con permiso para contar: {selection.filter((participant) => participant.canCount).length}</span>
              <span>No se crearán autorizaciones operativas.</span>
            </div>
            <div className="dialog-actions">
              <button className="button button--secondary" type="button" disabled={saving} onClick={() => setShowSummary(false)}>
                Volver
              </button>
              <button className="button" type="button" disabled={saving} onClick={confirmSave}>
                {saving ? "Guardando…" : "Confirmar participantes"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
