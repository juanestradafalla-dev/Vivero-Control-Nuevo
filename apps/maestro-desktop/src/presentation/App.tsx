import { type FormEvent, useEffect, useRef, useState } from "react";

import type {
  MonitorRepository,
  MonitorSnapshot,
  MonitorUnsubscribe,
  MonitorUser,
} from "../domain/MonitorModels";
import { sortMonitorLines } from "../domain/MonitorModels";
import "./app.css";

interface AppProps {
  readonly repository: MonitorRepository;
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

export function App({ repository }: AppProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<MonitorUser>();
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("TODOS");
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
    setSearch("");
    setStateFilter("TODOS");
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
            <small>Monitor operativo de solo lectura</small>
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
          <p className="eyebrow">ETAPA 4</p>
          <h1 id="login-title">Acceso al monitor</h1>
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
              <p className="eyebrow">JORNADA ACTIVA</p>
              <h1 id="monitor-title">{snapshot?.journeyDisplayName ?? "Cargando jornada…"}</h1>
            </div>
            <span className="live-indicator"><i aria-hidden="true" /> Actualización en vivo</span>
          </div>

          {error && <p className="alert" role="alert">{error}</p>}
          <div className="monitor-filters">
            <label>
              Buscar ubicación
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vivero, módulo, cama o línea" />
            </label>
            <label>
              Estado
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="DISPONIBLE">Disponible</option>
                <option value="EN_CONTEO">En conteo</option>
                <option value="PENDIENTE_REVISION">Pendiente de revisión</option>
              </select>
            </label>
          </div>
          {!snapshot ? (
            <p className="empty-state">Esperando datos del emulador…</p>
          ) : (
            <div className="line-grid" aria-label="Líneas de la jornada">
              {visibleLines.map((line) => (
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
                    user.canViewReservationDetails && line.count ? (
                      <dl className="count-detail">
                        <div><dt>Autor</dt><dd>{line.count.authorDisplayName} · {line.count.effectiveRole}</dd></div>
                        <div><dt>Dispositivo</dt><dd>{line.count.deviceId}</dd></div>
                        <div><dt>Hembras</dt><dd>{line.count.females}</dd></div>
                        <div><dt>Machos</dt><dd>{line.count.males}</dd></div>
                        <div><dt>Patrones</dt><dd>{line.count.rootstocks}</dd></div>
                        <div><dt>Total</dt><dd><strong>{line.count.total}</strong></dd></div>
                        <div><dt>Observaciones</dt><dd>{line.count.observations ?? "Sin observaciones"}</dd></div>
                        <div><dt>Hora dispositivo</dt><dd>{formatTime(line.count.deviceTimestamp)}</dd></div>
                        <div><dt>Hora servidor</dt><dd>{formatTime(line.count.serverTimestamp)}</dd></div>
                        <div><dt>Versión</dt><dd>{line.count.version}</dd></div>
                      </dl>
                    ) : <p className="reservation-private">Conteo pendiente de revisión · detalle restringido</p>
                  )}
                </article>
              ))}
            </div>
          )}
          <p className="read-only-note">Este monitor no permite reservar, liberar, aprobar, devolver ni modificar líneas o conteos.</p>
        </section>
      )}
    </main>
  );
}
