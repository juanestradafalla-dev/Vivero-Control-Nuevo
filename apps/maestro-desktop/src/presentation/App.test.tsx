import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  MonitorRepository,
  MonitorSnapshot,
  MonitorUnsubscribe,
  MonitorUser,
} from "../domain/MonitorModels";
import { App } from "./App";

afterEach(cleanup);

const supervisor: MonitorUser = {
  id: "usuario-supervisor",
  displayName: "Supervisor Pruebas",
  role: "SUPERVISOR",
  canViewReservationDetails: true,
};

const snapshot: MonitorSnapshot = {
  journeyId: "JORNADA-PRUEBA-ETAPA-3",
  journeyDisplayName: "Jornada ficticia Etapa 3",
  lines: [
    {
      id: "LINEA-002",
      state: "EN_CONTEO",
      location: {
        nursery: "Vivero ficticio",
        module: "Módulo A",
        bed: "Cama 1",
        line: "Línea 2",
        displayName: "Línea ficticia 2",
        order: 2,
      },
      reservation: { userDisplayName: "Auxiliar Pruebas", reservedAt: "2026-07-13T14:30:00.000Z" },
    },
    {
      id: "LINEA-001",
      state: "DISPONIBLE",
      location: {
        nursery: "Vivero ficticio",
        module: "Módulo A",
        bed: "Cama 1",
        line: "Línea 1",
        displayName: "Línea ficticia 1",
        order: 1,
      },
    },
  ],
};

class FakeMonitorRepository implements MonitorRepository {
  readonly emulatorEnabled = true;
  private onSnapshot?: (snapshot: MonitorSnapshot) => void;

  async signIn(): Promise<MonitorUser> {
    return supervisor;
  }

  async signOut(): Promise<void> {}

  observeMonitor(
    _user: MonitorUser,
    onSnapshot: (snapshot: MonitorSnapshot) => void,
  ): MonitorUnsubscribe {
    this.onSnapshot = onSnapshot;
    onSnapshot(snapshot);
    return () => {
      this.onSnapshot = undefined;
    };
  }

  publish(nextSnapshot: MonitorSnapshot): void {
    this.onSnapshot?.(nextSnapshot);
  }
}

async function signIn(repository: FakeMonitorRepository): Promise<void> {
  render(<App repository={repository} />);
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "supervisor@vivero.test" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreto" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await screen.findByRole("heading", { name: "Jornada ficticia Etapa 3" });
}

describe("App", () => {
  it("shows an emulator-only login without public registration", () => {
    render(<App repository={new FakeMonitorRepository()} />);

    expect(screen.getByText("MODO DE PRUEBA — EMULADOR")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Acceso al monitor" })).toBeInTheDocument();
    expect(screen.queryByText(/registr/i)).not.toBeInTheDocument();
  });

  it("sorts lines and shows reservation owner to a supervisor", async () => {
    await signIn(new FakeMonitorRepository());

    const cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveTextContent("Línea ficticia 1");
    expect(cards[1]).toHaveTextContent("Línea ficticia 2");
    expect(screen.getByText("Auxiliar Pruebas")).toBeInTheDocument();
  });

  it("updates the monitor when a new snapshot arrives", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);

    act(() => {
      repository.publish({ ...snapshot, lines: snapshot.lines.slice(0, 1) });
    });

    await waitFor(() => expect(screen.queryByText("Línea ficticia 1")).not.toBeInTheDocument());
  });

  it("hides reservation identity from an auxiliary account", async () => {
    const repository = new FakeMonitorRepository();
    repository.signIn = async () => ({ ...supervisor, role: "AUXILIAR", canViewReservationDetails: false });
    await signIn(repository);

    expect(screen.getByText("Reserva activa")).toBeInTheDocument();
    expect(screen.queryByText("Auxiliar Pruebas")).not.toBeInTheDocument();
  });

  it("offers no operational actions", async () => {
    await signIn(new FakeMonitorRepository());

    for (const action of ["Reservar", "Liberar", "Aprobar", "Modificar"]) {
      expect(screen.queryByRole("button", { name: new RegExp(action, "i") })).not.toBeInTheDocument();
    }
  });
});
