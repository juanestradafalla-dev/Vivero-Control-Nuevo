import {type FormEvent, useEffect, useRef, useState} from "react";

import type {
  MonitorLine,
  MonitorRepository,
  MonitorSnapshot,
  MonitorUnsubscribe,
  MonitorUser,
} from "../domain/MonitorModels";
import {sortMonitorLines} from "../domain/MonitorModels";
import "./app.css";

interface AppProps {
  readonly repository: MonitorRepository;
}

interface ReviewDialog {
  readonly kind: "APPROVE" | "RETURN";
  readonly line: MonitorLine;
  readonly idempotencyKey: string;
  readonly attempted: boolean;
  readonly reason: string;
}

interface ReassignmentDialog {
  readonly line: MonitorLine;
  readonly idempotencyKey: string;
  readonly targetUserId: string;
  readonly reason: string;
  readonly showSummary: boolean;
  readonly attempted: boolean;
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

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function App({repository}: AppProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<MonitorUser>();
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("PENDIENTE_REVISION");
  const [reviewDialog, setReviewDialog] = useState<ReviewDialog>();
  const [reviewing, setReviewing] = useState(false);
  const [reassignmentDialog, setReassignmentDialog] = useState<ReassignmentDialog>();
  const [reassigning, setReassigning] = useState(false);
  const unsubscribeRef = useRef<MonitorUnsubscribe | undefined>(undefined);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      const signedInUser = await repository.signIn(email, password);
      setUser(signedInUser);
      setPassword("");
      unsubscribeRef.current = repository.observeMonitor(
        signedInUser,
        (nextSnapshot) => {
          setSnapshot(nextSnapshot);
          setError(undefined);
        },
        setError,
      );
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = undefined;
    await repository.signOut();
    setUser(undefined);
    setSnapshot(undefined);
    setError(undefined);
    setNotice(undefined);
    setSearch("");
    setStateFilter("PENDIENTE_REVISION");
    setReviewDialog(undefined);
    setReassignmentDialog(undefined);
  };

  const openReview = (kind: ReviewDialog["kind"], line: MonitorLine) => {
    setError(undefined);
    setNotice(undefined);
    setReviewDialog({kind, line, idempotencyKey: crypto.randomUUID(), attempted: false, reason: ""});
  };

  const updateReviewReason = (reason: string) => {
    setReviewDialog((current) => current && ({
      ...current,
      reason,
      idempotencyKey: current.attempted ? crypto.randomUUID() : current.idempotencyKey,
      attempted: false,
    }));
  };

  const submitReview = async () => {
    if (!reviewDialog?.line.count || !user || reviewing) return;
    const selfApproval = reviewDialog.line.count.authorUserId === user.id;
    const reason = reviewDialog.reason.trim();
    if (reviewDialog.kind === "RETURN" && reason === "") {
      setError("Escribe el motivo de la devolución.");
      return;
    }
    if (reviewDialog.kind === "APPROVE" && selfApproval && user.role === "ADMINISTRADOR" && reason === "") {
      setError("La aprobación excepcional del propio conteo exige un motivo.");
      return;
    }
    setReviewing(true);
    setError(undefined);
    setReviewDialog({...reviewDialog, attempted: true});
    try {
      if (reviewDialog.kind === "APPROVE") {
        await repository.approveCount(
          reviewDialog.line.count.id,
          reviewDialog.idempotencyKey,
          selfApproval && user.role === "ADMINISTRADOR" ? reason : undefined,
        );
        setNotice("Conteo aprobado mediante transacción central.");
      } else {
        await repository.returnCount(reviewDialog.line.count.id, reason, reviewDialog.idempotencyKey);
        setNotice("Conteo devuelto mediante transacción central.");
      }
      setReviewDialog(undefined);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "No fue posible completar la revisión.");
    } finally {
      setReviewing(false);
    }
  };

  const openReassignment = (line: MonitorLine) => {
    setError(undefined);
    setNotice(undefined);
    setReassignmentDialog({
      line,
      idempotencyKey: crypto.randomUUID(),
      targetUserId: "",
      reason: "",
      showSummary: false,
      attempted: false,
    });
  };

  const updateReassignment = (changes: Partial<Pick<ReassignmentDialog, "targetUserId" | "reason">>) => {
    setReassignmentDialog((current) => current && ({
      ...current,
      ...changes,
      idempotencyKey: current.attempted ? crypto.randomUUID() : current.idempotencyKey,
      showSummary: false,
      attempted: false,
    }));
  };

  const reviewReassignment = () => {
    if (!reassignmentDialog) return;
    if (!reassignmentDialog.targetUserId) {
      setError("Selecciona una persona activa y autorizada.");
      return;
    }
    if (!reassignmentDialog.reason.trim()) {
      setError("Escribe el motivo de la reasignación.");
      return;
    }
    setError(undefined);
    setReassignmentDialog({...reassignmentDialog, reason: reassignmentDialog.reason.trim(), showSummary: true});
  };

  const submitReassignment = async () => {
    if (!reassignmentDialog?.line.count || !reassignmentDialog.showSummary || reassigning) return;
    setReassigning(true);
    setError(undefined);
    setReassignmentDialog({...reassignmentDialog, attempted: true});
    try {
      await repository.reassignCountCorrection(
        reassignmentDialog.line.count.id,
        reassignmentDialog.targetUserId,
        reassignmentDialog.reason,
        reassignmentDialog.idempotencyKey,
      );
      setNotice("Corrección reasignada mediante transacción central.");
      setReassignmentDialog(undefined);
    } catch (reassignmentError) {
      setError(reassignmentError instanceof Error ? reassignmentError.message : "No fue posible reasignar la corrección.");
    } finally {
      setReassigning(false);
    }
  };

  const visibleLines = sortMonitorLines(snapshot?.lines ?? []).filter((line) => {
    const haystack = Object.values(line.location).join(" ").toLocaleLowerCase("es");
    return (stateFilter === "TODOS" || line.state === stateFilter) &&
      haystack.includes(search.trim().toLocaleLowerCase("es"));
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-mark" aria-hidden="true">VC</span>
          <div>
            <strong>Vivero Maestro</strong>
            <small>Revisión transaccional de conteos</small>
          </div>
        </div>
        {user && (
          <div className="session">
            <span>{user.displayName} · {user.role}</span>
            <button className="button button--secondary" type="button" onClick={handleSignOut}>
              Cerrar sesión
            </button>
          </div>
        )}
      </header>

      <div className={repository.emulatorEnabled ? "environment-banner" : "environment-banner environment-banner--danger"}>
        {repository.emulatorEnabled ? "MODO DE PRUEBA — EMULADOR" : "FIREBASE DESHABILITADO — SIN PRODUCCIÓN"}
      </div>

      {!user ? (
        <section className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">ETAPA 7</p>
          <h1 id="login-title">Acceso a revisión</h1>
          <p>Use únicamente una cuenta ficticia cargada en Firebase Emulator Suite.</p>
          <form onSubmit={handleSignIn}>
            <label>
              Correo
              <input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Contraseña
              <input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <p className="alert" role="alert">{error}</p>}
            <button className="button" type="submit" disabled={loading || !repository.emulatorEnabled}>
              {loading ? "Ingresando…" : "Iniciar sesión"}
            </button>
          </form>
        </section>
      ) : (
        <section className="monitor" aria-labelledby="monitor-title">
          <div className="monitor-heading">
            <div>
              <p className="eyebrow">BANDEJA DE REVISIÓN</p>
              <h1 id="monitor-title">{snapshot?.journeyDisplayName ?? "Cargando jornada…"}</h1>
            </div>
            <span className="live-indicator"><i aria-hidden="true" /> Actualización en vivo</span>
          </div>

          {error && <p className="alert" role="alert">{error}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}
          <div className="monitor-filters">
            <label>
              Buscar ubicación
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vivero, módulo, cama o línea" />
            </label>
            <label>
              Estado
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="PENDIENTE_REVISION">Pendiente de revisión</option>
                <option value="DEVUELTA">Devuelta</option>
                <option value="APROBADA">Aprobada</option>
                <option value="DISPONIBLE">Disponible</option>
                <option value="EN_CONTEO">En conteo</option>
              </select>
            </label>
          </div>
          {!snapshot ? (
            <p className="empty-state">Esperando datos del emulador…</p>
          ) : visibleLines.length === 0 ? (
            <p className="empty-state">No hay líneas que coincidan con el filtro.</p>
          ) : (
            <div className="line-grid" aria-label="Líneas de la jornada">
              {visibleLines.map((line) => {
                const count = line.count;
                const inventory = line.inventory;
                const ownCount = count?.authorUserId === user.id;
                const supervisorOwnApproval = ownCount && user.role === "SUPERVISOR";
                return (
                  <article className="line-card" key={line.id}>
                    <div>
                      <span className={`state state--${line.state.toLowerCase()}`}>{line.state.replaceAll("_", " ")}</span>
                      <h2>{line.location.displayName}</h2>
                      <p>{line.location.nursery} · {line.location.module} · {line.location.bed}</p>
                    </div>
                    {line.state === "EN_CONTEO" && (
                      user.canViewReservationDetails && line.reservation ? (
                        <dl className="reservation-detail">
                          <div><dt>Reservada por</dt><dd>{line.reservation.userDisplayName}</dd></div>
                          <div><dt>Desde</dt><dd>{formatTime(line.reservation.reservedAt)}</dd></div>
                        </dl>
                      ) : <p className="reservation-private">Reserva activa</p>
                    )}
                    {line.state === "PENDIENTE_REVISION" && (
                      user.canViewReservationDetails && count ? (
                        <>
                          <dl className="count-detail">
                            <div><dt>Autor</dt><dd>{count.authorDisplayName} · {count.effectiveRole}</dd></div>
                            <div><dt>Dispositivo</dt><dd>{count.deviceId}</dd></div>
                            <div><dt>Hembras</dt><dd>{count.females}</dd></div>
                            <div><dt>Machos</dt><dd>{count.males}</dd></div>
                            <div><dt>Patrones</dt><dd>{count.rootstocks}</dd></div>
                            <div><dt>Total</dt><dd><strong>{count.total}</strong></dd></div>
                            <div><dt>Observaciones</dt><dd>{count.observations ?? "Sin observaciones"}</dd></div>
                            <div><dt>Hora dispositivo</dt><dd>{formatTime(count.deviceTimestamp)}</dd></div>
                            <div><dt>Hora servidor</dt><dd>{formatTime(count.serverTimestamp)}</dd></div>
                            <div><dt>Versión</dt><dd>{count.version}</dd></div>
                            <div><dt>Inventario actual</dt><dd>{inventory?.total ?? "No disponible"}</dd></div>
                            <div><dt>Diferencia total</dt><dd>{inventory ? signed(count.total - inventory.total) : "—"}</dd></div>
                          </dl>
                          {user.canReview && (
                            <div className="review-actions">
                              <button
                                className="button"
                                type="button"
                                disabled={!inventory || supervisorOwnApproval}
                                onClick={() => openReview("APPROVE", line)}
                              >
                                Aprobar
                              </button>
                              <button className="button button--secondary" type="button" onClick={() => openReview("RETURN", line)}>
                                Devolver
                              </button>
                            </div>
                          )}
                          {supervisorOwnApproval && <p className="warning">Un supervisor no puede aprobar su propio conteo.</p>}
                          {!inventory && <p className="warning">No se puede aprobar sin inventario oficial inicial.</p>}
                        </>
                      ) : <p className="reservation-private">Conteo pendiente de revisión · detalle restringido</p>
                    )}
                    {line.state === "DEVUELTA" && count && user.canViewReservationDetails && (
                      <section className="correction-responsibility" aria-label={`Responsabilidad de corrección de ${line.location.displayName}`}>
                        <h3>Corrección pendiente</h3>
                        <span>Autor original: {line.correctionResponsibility?.originalAuthorDisplayName ?? count.authorDisplayName}</span>
                        <span>
                          Responsable actual: {line.correctionResponsibility?.responsibleDisplayName ?? count.authorDisplayName}
                        </span>
                        <span>Motivo de devolución: {count.returnReason ?? "No disponible"}</span>
                        {line.correctionResponsibility && (
                          <>
                            <span>Asignada por: {line.correctionResponsibility.assignedByDisplayName}</span>
                            <span>Motivo de reasignación: {line.correctionResponsibility.reason}</span>
                            <span>Hora: {formatTime(line.correctionResponsibility.assignedAt)}</span>
                          </>
                        )}
                        {user.canReview && (
                          <button className="button" type="button" onClick={() => openReassignment(line)}>
                            Reasignar corrección
                          </button>
                        )}
                      </section>
                    )}
                    {user.canViewReservationDetails && (line.countHistory?.length ?? 0) > 0 && (
                      <section className="count-history" aria-label={`Historial de versiones de ${line.location.displayName}`}>
                        <h3>Historial de versiones</h3>
                        {line.countHistory?.map((version) => (
                          <article className="count-version" key={version.id}>
                            <strong>
                              Versión {version.version}
                              {version.id === line.count?.id ? " · Vigente" : " · Anterior inmutable"}
                            </strong>
                            <span>
                              Hembras {version.females} · Machos {version.males} · Patrones {version.rootstocks} · Total {version.total}
                            </span>
                            <span>Observaciones: {version.observations ?? "Sin observaciones"}</span>
                            {version.returnReason && <span>Motivo de devolución: {version.returnReason}</span>}
                          </article>
                        ))}
                      </section>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <p className="read-only-note">
            Los conteos son inmutables: Maestro solo solicita aprobar o devolver al backend transaccional. No edita conteos ni inventario directamente.
          </p>
        </section>
      )}

      {reviewDialog?.line.count && user && (
        <div className="dialog-backdrop" role="presentation">
          <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <p className="eyebrow">CONFIRMACIÓN CENTRAL</p>
            <h2 id="review-title">{reviewDialog.kind === "APPROVE" ? "Aprobar conteo" : "Devolver conteo"}</h2>
            <p>{reviewDialog.line.location.nursery} · {reviewDialog.line.location.module} · {reviewDialog.line.location.bed} · {reviewDialog.line.location.line}</p>
            {reviewDialog.kind === "APPROVE" && reviewDialog.line.inventory ? (
              <div className="inventory-summary" aria-label="Resumen de aprobación">
                <strong>Inventario anterior → Conteo nuevo → Diferencia</strong>
                <span>Hembras: {reviewDialog.line.inventory.females} → {reviewDialog.line.count.females} → {signed(reviewDialog.line.count.females - reviewDialog.line.inventory.females)}</span>
                <span>Machos: {reviewDialog.line.inventory.males} → {reviewDialog.line.count.males} → {signed(reviewDialog.line.count.males - reviewDialog.line.inventory.males)}</span>
                <span>Patrones: {reviewDialog.line.inventory.rootstocks} → {reviewDialog.line.count.rootstocks} → {signed(reviewDialog.line.count.rootstocks - reviewDialog.line.inventory.rootstocks)}</span>
                <span>Total: {reviewDialog.line.inventory.total} → {reviewDialog.line.count.total} → {signed(reviewDialog.line.count.total - reviewDialog.line.inventory.total)}</span>
              </div>
            ) : (
              <div className="inventory-summary">
                <span>Conteo total: {reviewDialog.line.count.total}</span>
                <span>El conteo original no será editado.</span>
              </div>
            )}
            {reviewDialog.kind === "APPROVE" && reviewDialog.line.count.authorUserId === user.id && user.role === "ADMINISTRADOR" && (
              <p className="warning">Advertencia: aprobarás excepcionalmente tu propio conteo. El motivo quedará auditado.</p>
            )}
            {(reviewDialog.kind === "RETURN" || (reviewDialog.line.count.authorUserId === user.id && user.role === "ADMINISTRADOR")) && (
              <label>
                {reviewDialog.kind === "RETURN" ? "Motivo de devolución" : "Motivo de la excepción"}
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={reviewDialog.reason}
                  onChange={(event) => updateReviewReason(event.target.value)}
                />
              </label>
            )}
            <div className="dialog-actions">
              <button className="button button--secondary" type="button" disabled={reviewing} onClick={() => setReviewDialog(undefined)}>
                Cancelar
              </button>
              <button className="button" type="button" disabled={reviewing} onClick={submitReview}>
                {reviewing ? "Procesando…" : reviewDialog.kind === "APPROVE" ? "Confirmar aprobación" : "Confirmar devolución"}
              </button>
            </div>
          </section>
        </div>
      )}

      {reassignmentDialog?.line.count && user && (
        <div className="dialog-backdrop" role="presentation">
          <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="reassignment-title">
            <p className="eyebrow">REASIGNACIÓN SUPERVISADA</p>
            <h2 id="reassignment-title">Reasignar corrección</h2>
            <p>
              {reassignmentDialog.line.location.nursery} · {reassignmentDialog.line.location.module} · {reassignmentDialog.line.location.bed} · {reassignmentDialog.line.location.line}
            </p>
            {!reassignmentDialog.showSummary ? (
              <>
                <label>
                  Nuevo responsable
                  <select
                    value={reassignmentDialog.targetUserId}
                    onChange={(event) => updateReassignment({targetUserId: event.target.value})}
                  >
                    <option value="">Seleccionar usuario</option>
                    {(snapshot?.correctionCandidates ?? []).filter((candidate) => {
                      const currentResponsible = reassignmentDialog.line.correctionResponsibility?.responsibleUserId ??
                        reassignmentDialog.line.count?.authorUserId;
                      return candidate.id !== currentResponsible;
                    }).map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.displayName} · {candidate.role}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Motivo obligatorio
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={reassignmentDialog.reason}
                    onChange={(event) => updateReassignment({reason: event.target.value})}
                  />
                </label>
              </>
            ) : (
              <div className="inventory-summary" aria-label="Resumen de reasignación">
                <strong>Confirma la reasignación</strong>
                <span>Autor original: {reassignmentDialog.line.count.authorDisplayName}</span>
                <span>
                  Responsable actual: {reassignmentDialog.line.correctionResponsibility?.responsibleDisplayName ?? reassignmentDialog.line.count.authorDisplayName}
                </span>
                <span>
                  Nuevo responsable: {(snapshot?.correctionCandidates ?? []).find((candidate) => candidate.id === reassignmentDialog.targetUserId)?.displayName}
                </span>
                <span>Motivo: {reassignmentDialog.reason}</span>
                <span>El conteo original y su autor permanecerán intactos.</span>
              </div>
            )}
            <div className="dialog-actions">
              <button className="button button--secondary" type="button" disabled={reassigning} onClick={() => setReassignmentDialog(undefined)}>
                Cancelar
              </button>
              {reassignmentDialog.showSummary ? (
                <button className="button" type="button" disabled={reassigning} onClick={submitReassignment}>
                  {reassigning ? "Procesando…" : "Confirmar reasignación"}
                </button>
              ) : (
                <button className="button" type="button" onClick={reviewReassignment}>Revisar reasignación</button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
