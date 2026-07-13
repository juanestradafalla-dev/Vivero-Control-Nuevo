import { StaticFoundationRepository } from "../data/StaticFoundationRepository";
import "./app.css";

const futureModules = ["Inventario", "Jornadas", "Revisión", "Auditoría"];

export function App() {
  const status = new StaticFoundationRepository().currentStatus();

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegación futura">
        <div className="brand-mark">VC</div>
        <p className="brand-name">Vivero Maestro</p>
        <nav>
          {futureModules.map((module) => (
            <span className="nav-placeholder" key={module}>
              {module}
            </span>
          ))}
        </nav>
      </aside>

      <section className="content">
        <p className="eyebrow">ETAPA 2 · BASE TÉCNICA</p>
        <h1>{status.title}</h1>
        <div className="status-grid">
          <article className="status-card status-card--primary">
            <span>Estado</span>
            <strong>{status.message}</strong>
          </article>
          <article className="status-card">
            <span>Servicios centrales</span>
            <strong>{status.firebaseStatus}</strong>
          </article>
        </div>
        <p className="scope-note">
          Esta pantalla es un marcador técnico. Los módulos administrativos se implementarán en
          etapas posteriores.
        </p>
      </section>
    </main>
  );
}
