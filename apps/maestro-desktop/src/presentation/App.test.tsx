import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {MonitorRepository, MonitorSnapshot, MonitorUnsubscribe, MonitorUser} from "../domain/MonitorModels";
import { App } from "./App";

afterEach(cleanup);

const supervisor: MonitorUser = {
  id: "usuario-supervisor",
  displayName: "Supervisor Pruebas",
  role: "SUPERVISOR",
  canViewReservationDetails: true,
};

const location = {
  nursery: "Vivero ficticio",
  module: "Módulo A",
  bed: "Cama 1",
  line: "Línea 1",
  displayName: "Línea ficticia 1",
  order: 1,
};

const snapshot: MonitorSnapshot = {
  journeyId: "JORNADA-PRUEBA-ETAPA-3",
  journeyDisplayName: "Jornada ficticia Etapa 4",
  lines: [
    {
      id: "LINEA-002",
      state: "EN_CONTEO",
      location: {...location, line: "Línea 2", displayName: "Línea ficticia 2", order: 2},
      reservation: {userDisplayName: "Auxiliar Pruebas", reservedAt: "2026-07-13T14:30:00.000Z"},
    },
    {id: "LINEA-001", state: "DISPONIBLE", location},
    {
      id: "LINEA-003",
      state: "PENDIENTE_REVISION",
      location: {...location, line: "Línea 3", displayName: "Línea ficticia 3", order: 3},
      count: {
        authorDisplayName: "Auxiliar Conteo",
        effectiveRole: "AUXILIAR",
        deviceId: "DISPOSITIVO-FICTICIO",
        females: 450,
        males: 320,
        rootstocks: 210,
        total: 980,
        observations: "Sin novedad",
        deviceTimestamp: "2026-07-13T14:29:00.000Z",
        serverTimestamp: "2026-07-13T14:30:00.000Z",
        version: 1,
      },
    },
  ],
};

class FakeMonitorRepository implements MonitorRepository {
  readonly emulatorEnabled = true;
  private onSnapshot?: (snapshot: MonitorSnapshot) => void;
  user: MonitorUser = supervisor;

  async signIn(): Promise<MonitorUser> { return this.user; }
  async signOut(): Promise<void> {}
  observeMonitor(_user: MonitorUser, onSnapshot: (snapshot: MonitorSnapshot) => void): MonitorUnsubscribe {
    this.onSnapshot = onSnapshot;
    onSnapshot(snapshot);
    return () => { this.onSnapshot = undefined; };
  }
  publish(nextSnapshot: MonitorSnapshot): void { this.onSnapshot?.(nextSnapshot); }
}

async function signIn(repository: FakeMonitorRepository): Promise<void> {
  render(<App repository={repository} />);
  fireEvent.change(screen.getByLabelText("Correo"), {target: {value: "supervisor@vivero.test"}});
  fireEvent.change(screen.getByLabelText("Contraseña"), {target: {value: "secreto"}});
  fireEvent.click(screen.getByRole("button", {name: "Iniciar sesión"}));
  await screen.findByRole("heading", {name: "Jornada ficticia Etapa 4"});
}

describe("App", () => {
  it("muestra acceso exclusivo del emulador sin registro público", () => {
    render(<App repository={new FakeMonitorRepository()} />);
    expect(screen.getByText("MODO DE PRUEBA — EMULADOR")).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Acceso al monitor"})).toBeInTheDocument();
    expect(screen.queryByText(/registr/i)).not.toBeInTheDocument();
  });

  it("presenta PENDIENTE_REVISION con cantidades y metadatos al supervisor", async () => {
    await signIn(new FakeMonitorRepository());
    expect(screen.getByText("Auxiliar Conteo · AUXILIAR")).toBeInTheDocument();
    expect(screen.getByText("DISPOSITIVO-FICTICIO")).toBeInTheDocument();
    expect(screen.getByText("980")).toBeInTheDocument();
    expect(screen.getByText("Sin novedad")).toBeInTheDocument();
  });

  it("actualiza el monitor mediante un nuevo snapshot", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    act(() => repository.publish({...snapshot, lines: snapshot.lines.slice(2)}));
    await waitFor(() => expect(screen.queryByText("Línea ficticia 1")).not.toBeInTheDocument());
  });

  it("oculta identidades y detalle de conteos a una cuenta auxiliar", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {...supervisor, role: "AUXILIAR", canViewReservationDetails: false};
    await signIn(repository);
    expect(screen.getByText("Reserva activa")).toBeInTheDocument();
    expect(screen.getByText(/detalle restringido/)).toBeInTheDocument();
    expect(screen.queryByText("Auxiliar Pruebas")).not.toBeInTheDocument();
    expect(screen.queryByText("Auxiliar Conteo · AUXILIAR")).not.toBeInTheDocument();
  });

  it("filtra por estado y busca ubicación", async () => {
    await signIn(new FakeMonitorRepository());
    fireEvent.change(screen.getByLabelText("Estado"), {target: {value: "PENDIENTE_REVISION"}});
    expect(screen.queryByText("Línea ficticia 1")).not.toBeInTheDocument();
    expect(screen.getByText("Línea ficticia 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar ubicación"), {target: {value: "inexistente"}});
    expect(screen.queryByText("Línea ficticia 3")).not.toBeInTheDocument();
  });

  it("no ofrece acciones operativas", async () => {
    await signIn(new FakeMonitorRepository());
    for (const action of ["Reservar", "Liberar", "Aprobar", "Devolver", "Modificar", "Reasignar"]) {
      expect(screen.queryByRole("button", {name: new RegExp(action, "i")})).not.toBeInTheDocument();
    }
  });
});
