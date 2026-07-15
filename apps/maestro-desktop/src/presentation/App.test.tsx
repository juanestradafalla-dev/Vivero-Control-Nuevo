import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it} from "vitest";

import type {MonitorRepository, MonitorSnapshot, MonitorUnsubscribe, MonitorUser} from "../domain/MonitorModels";
import {App} from "./App";

afterEach(cleanup);

const supervisor: MonitorUser = {
  id: "uid-supervisor",
  displayName: "Supervisor Pruebas",
  role: "SUPERVISOR",
  canViewReservationDetails: true,
  canReview: true,
};

const pendingLine = {
  id: "JORNADA-1__LINEA-003",
  lineId: "LINEA-003",
  state: "PENDIENTE_REVISION" as const,
  location: {
    nursery: "Vivero ficticio",
    module: "Módulo A",
    bed: "Cama 1",
    line: "Línea 3",
    displayName: "Línea ficticia 3",
    order: 3,
  },
  count: {
    id: "CONTEO-003",
    authorUserId: "uid-auxiliar-1",
    authorDisplayName: "Auxiliar Conteo",
    effectiveRole: "AUXILIAR" as const,
    deviceId: "DISPOSITIVO-FICTICIO",
    females: 450,
    males: 320,
    rootstocks: 210,
    total: 980,
    observations: "Sin novedad",
    deviceTimestamp: "2026-07-14T13:29:00.000Z",
    serverTimestamp: "2026-07-14T13:30:00.000Z",
    version: 1,
  },
  inventory: {females: 500, males: 300, rootstocks: 200, total: 1000, version: 1},
};

const snapshot: MonitorSnapshot = {
  journeyId: "JORNADA-PRUEBA-ETAPA-3",
  journeyDisplayName: "Jornada ficticia Etapa 5",
  lines: [pendingLine],
};

class FakeMonitorRepository implements MonitorRepository {
  readonly emulatorEnabled = true;
  private onSnapshot?: (snapshot: MonitorSnapshot) => void;
  user: MonitorUser = supervisor;
  currentSnapshot: MonitorSnapshot = snapshot;
  approved: Array<{countId: string; key: string; reason?: string}> = [];
  returned: Array<{countId: string; reason: string; key: string}> = [];

  async signIn(): Promise<MonitorUser> { return this.user; }
  async signOut(): Promise<void> {}
  async approveCount(countId: string, key: string, reason?: string): Promise<void> {
    this.approved.push({countId, key, ...(reason === undefined ? {} : {reason})});
  }
  async returnCount(countId: string, reason: string, key: string): Promise<void> {
    this.returned.push({countId, reason, key});
  }
  observeMonitor(_user: MonitorUser, onSnapshot: (snapshot: MonitorSnapshot) => void): MonitorUnsubscribe {
    this.onSnapshot = onSnapshot;
    onSnapshot(this.currentSnapshot);
    return () => { this.onSnapshot = undefined; };
  }
  publish(nextSnapshot: MonitorSnapshot): void { this.onSnapshot?.(nextSnapshot); }
}

async function signIn(repository: FakeMonitorRepository): Promise<void> {
  render(<App repository={repository} />);
  fireEvent.change(screen.getByLabelText("Correo"), {target: {value: "supervisor@prueba.local"}});
  fireEvent.change(screen.getByLabelText("Contraseña"), {target: {value: "secreto"}});
  fireEvent.click(screen.getByRole("button", {name: "Iniciar sesión"}));
  await screen.findByRole("heading", {name: "Jornada ficticia Etapa 5"});
}

describe("bandeja de revisión de Vivero Maestro", () => {
  it("presenta conteo, inventario vigente y diferencia", async () => {
    await signIn(new FakeMonitorRepository());
    expect(screen.getByText("Auxiliar Conteo · AUXILIAR")).toBeInTheDocument();
    expect(screen.getByText("DISPOSITIVO-FICTICIO")).toBeInTheDocument();
    expect(screen.getByText("Inventario actual").nextSibling).toHaveTextContent("1000");
    expect(screen.getByText("Diferencia total").nextSibling).toHaveTextContent("-20");
  });

  it("actualiza la bandeja mediante snapshot en tiempo real", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    act(() => repository.publish({...snapshot, lines: []}));
    await screen.findByText("No hay líneas que coincidan con el filtro.");
  });

  it("muestra historial, motivo de devolución y marca la versión vigente", async () => {
    const repository = new FakeMonitorRepository();
    const previous = {
      ...pendingLine.count,
      id: "CONTEO-002",
      version: 1,
      total: 990,
      returnReason: "Recontar patrones.",
    };
    const current = {...pendingLine.count, version: 2, previousCountId: previous.id};
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, count: current, countHistory: [previous, current]}],
    };

    await signIn(repository);

    expect(screen.getByText("Versión 1 · Anterior inmutable")).toBeInTheDocument();
    expect(screen.getByText("Versión 2 · Vigente")).toBeInTheDocument();
    expect(screen.getByText("Motivo de devolución: Recontar patrones.")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Editar versión/i})).not.toBeInTheDocument();
  });

  it("muestra resumen no editable y confirma una aprobación", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Aprobar"}));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Inventario anterior → Conteo nuevo → Diferencia")).toBeInTheDocument();
    expect(screen.getByText("Total: 1000 → 980 → -20")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", {name: /Hembras|Machos|Patrones|Total/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Confirmar aprobación"}));
    await waitFor(() => expect(repository.approved).toHaveLength(1));
    expect(repository.approved[0]?.countId).toBe("CONTEO-003");
  });

  it("exige motivo y confirma una devolución", async () => {
    const repository = new FakeMonitorRepository();
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Devolver"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirmar devolución"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el motivo");
    fireEvent.change(screen.getByLabelText("Motivo de devolución"), {target: {value: "Repetir patrones"}});
    fireEvent.click(screen.getByRole("button", {name: "Confirmar devolución"}));
    await waitFor(() => expect(repository.returned).toHaveLength(1));
    expect(repository.returned[0]).toMatchObject({countId: "CONTEO-003", reason: "Repetir patrones"});
  });

  it("impide al supervisor aprobar su propio conteo", async () => {
    const repository = new FakeMonitorRepository();
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, count: {...pendingLine.count, authorUserId: supervisor.id}}],
    };
    await signIn(repository);
    expect(screen.getByRole("button", {name: "Aprobar"})).toBeDisabled();
    expect(screen.getByText("Un supervisor no puede aprobar su propio conteo.")).toBeInTheDocument();
  });

  it("advierte y exige motivo al administrador que aprueba su propio conteo", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {...supervisor, id: "uid-administrador", role: "ADMINISTRADOR"};
    repository.currentSnapshot = {
      ...snapshot,
      lines: [{...pendingLine, count: {...pendingLine.count, authorUserId: "uid-administrador"}}],
    };
    await signIn(repository);
    fireEvent.click(screen.getByRole("button", {name: "Aprobar"}));
    expect(screen.getByText(/aprobarás excepcionalmente tu propio conteo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Confirmar aprobación"}));
    expect(screen.getByRole("alert")).toHaveTextContent("exige un motivo");
    fireEvent.change(screen.getByLabelText("Motivo de la excepción"), {target: {value: "Única cuenta maestra ficticia"}});
    fireEvent.click(screen.getByRole("button", {name: "Confirmar aprobación"}));
    await waitFor(() => expect(repository.approved[0]?.reason).toBe("Única cuenta maestra ficticia"));
  });

  it("oculta detalle y acciones a una cuenta auxiliar", async () => {
    const repository = new FakeMonitorRepository();
    repository.user = {
      id: "uid-auxiliar-1",
      displayName: "Auxiliar",
      role: "AUXILIAR",
      canViewReservationDetails: false,
      canReview: false,
    };
    await signIn(repository);
    expect(screen.getByText(/detalle restringido/)).toBeInTheDocument();
    expect(screen.queryByText("Auxiliar Conteo · AUXILIAR")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Aprobar"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Devolver"})).not.toBeInTheDocument();
  });

  it("no ofrece edición directa, liberación ni reasignación", async () => {
    await signIn(new FakeMonitorRepository());
    for (const action of ["Editar", "Modificar", "Liberar", "Reasignar"]) {
      expect(screen.queryByRole("button", {name: new RegExp(action, "i")})).not.toBeInTheDocument();
    }
  });
});
