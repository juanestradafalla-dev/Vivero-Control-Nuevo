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

function formatReservationTime(value: string): string {
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
  const unsubscribeRef = useRef<MonitorUnsubscribe | undefined>(undefined);

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
    },
    [],
  );

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
  };

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
        {repository.emulatorEnabled
          ? "MODO DE PRUEBA — EMULADOR"
          : "FIREBASE DESHABILITADO — SIN PRODUCCIÓN"}
      </div>

      {!user ? (
        <section className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">ETAPA 3</p>
          <h1 id="login-title">Acceso al monitor</h1>
          <p>Use únicamente una cuenta ficticia cargada en Firebase Emulator Suite.</p>
          <form onSubmit={handleSignIn}>
            <label>
              Correo
              <input
                autoComplete="username"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Contraseña
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
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
          {!snapshot ? (
            <p className="empty-state">Esperando datos del emulador…</p>
          ) : (
            <div className="line-grid" aria-label="Líneas de la jornada">
              {sortMonitorLines(snapshot.lines).map((line) => (
                <article className="line-card" key={line.id}>
                  <div>
                    <span className={`state state--${line.state.toLowerCase()}`}>{line.state.replace("_", " ")}</span>
                    <h2>{line.location.displayName}</h2>
                    <p>{line.location.nursery} · {line.location.module} · {line.location.bed}</p>
                  </div>
                  {line.state === "EN_CONTEO" && (
                    user.canViewReservationDetails && line.reservation ? (
                      <dl className="reservation-detail">
                        <div><dt>Reservada por</dt><dd>{line.reservation.userDisplayName}</dd></div>
                        <div><dt>Desde</dt><dd>{formatReservationTime(line.reservation.reservedAt)}</dd></div>
                      </dl>
                    ) : (
                      <p className="reservation-private">Reserva activa</p>
                    )
                  )}
                </article>
              ))}
            </div>
          )}
          <p className="read-only-note">Este monitor no permite reservar, liberar, aprobar ni modificar líneas.</p>
        </section>
      )}
    </main>
  );
}
