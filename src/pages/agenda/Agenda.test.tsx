import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { FECHA, cita, propuesta, recurso, recursoDelDia, servicio } from "../../test/agendaFixtures";

/**
 * A1 · Agenda del día: tocar un hueco abre la nueva cita precargada, y
 * arrastrar una cita la mueve; si el backend dice 409, vuelve a su lugar.
 */

const sesion = vi.hoisted(() => ({ features: ["agenda", "cola_walkin"] as string[] }));

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      usuario: { id: 1, username: "admin", rol: "ADMIN", sucursalId: 1, sucursal: "Centro", ...permisosDe("ADMIN") },
      negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA", features: sesion.features },
    }),
  };
});

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: {
      dia: vi.fn(),
      reglas: vi.fn(),
      moverCita: vi.fn(),
      servicios: vi.fn(),
      recursos: vi.fn(),
      huecos: vi.fn(),
      buscarClientes: vi.fn(),
      cita: vi.fn(),
    },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import Agenda from "./Agenda";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["agenda", "cola_walkin"];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T13:00:00.000Z"));
  vi.mocked(apiAgenda.dia).mockResolvedValue({
    fecha: FECHA,
    sucursalId: 1,
    recursos: [recursoDelDia()],
    citas: [cita()],
    bloqueos: [
      { id: 1, recursoId: 1, sucursalId: 1, inicio: "2026-10-21T17:00:00.000Z", fin: "2026-10-21T18:00:00.000Z", motivo: "Curso" },
    ],
    cola: [],
  });
  vi.mocked(apiAgenda.reglas).mockRejectedValue(new Error("sin reglas"));
  vi.mocked(apiAgenda.servicios).mockResolvedValue([servicio()]);
  vi.mocked(apiAgenda.recursos).mockResolvedValue([recurso()]);
  vi.mocked(apiAgenda.huecos).mockResolvedValue({ huecos: [propuesta("2026-10-21T15:00:00.000Z")] });
  vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Dos personas con horario: la grilla muestra la fila de nombres. */
function conDosProfesionales() {
  const sofia = recursoDelDia({ id: 2, nombre: "Sofía", orden: 2 });
  vi.mocked(apiAgenda.dia).mockResolvedValue({
    fecha: FECHA,
    sucursalId: 1,
    recursos: [recursoDelDia(), sofia],
    citas: [cita()],
    bloqueos: [],
    cola: [],
  });
  vi.mocked(apiAgenda.recursos).mockResolvedValue([recurso(), recurso({ id: 2, nombre: "Sofía", orden: 2 })]);
}

async function montar() {
  render(
    <MemoryRouter>
      <Agenda />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const bloque = () => screen.getByRole("button", { name: /Rosa Mamani, Corte dama/ });

describe("A1 · agenda del día", () => {
  it("dibuja la columna del profesional con su cita, el bloqueo y la cola", async () => {
    await montar();
    expect(apiAgenda.dia).toHaveBeenCalledWith(FECHA, 1);
    // Con una sola persona no hay fila de nombres (IDEAS/7 §3): no dice nada.
    expect(screen.queryByText("Carla R.")).not.toBeInTheDocument();
    expect(bloque()).toHaveAccessibleName(/^10:00 Rosa Mamani/);
    expect(screen.getByText("Curso")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cola de espera" })).toBeInTheDocument();
  });

  it("sin la feature de cola no hay panel de cola", async () => {
    sesion.features = ["agenda"];
    await montar();
    expect(screen.queryByRole("region", { name: "Cola de espera" })).not.toBeInTheDocument();
  });

  it("con dos, la fila de nombres está", async () => {
    conDosProfesionales();
    await montar();
    expect(screen.getByText("Carla R.")).toBeInTheDocument();
    expect(screen.getByText("Sofía")).toBeInTheDocument();
  });

  it("tocar un hueco abre la nueva cita con el profesional y la hora", async () => {
    conDosProfesionales();
    await montar();
    // La grilla arranca a las 9:00 (el primer tramo) y son 1,6 px por minuto:
    // 192 px más abajo son las 11:00.
    await act(async () => {
      fireEvent.click(screen.getByTestId("columna-1"), { clientY: 192 });
    });
    expect(screen.getByRole("dialog", { name: "Nueva cita" })).toBeInTheDocument();
    expect(screen.getByLabelText("Con")).toHaveValue("1");
  });

  it("arrastrar mueve la cita; con 409 vuelve a su lugar y avisa", async () => {
    vi.mocked(apiAgenda.moverCita).mockRejectedValue(
      new ApiError("Ocupado", 409, { codigo: "HUECO_OCUPADO", huecos: [] }),
    );
    await montar();

    fireEvent.pointerDown(bloque(), { pointerType: "mouse", button: 0, clientX: 10, clientY: 100 });
    // 48 px = 30 minutos más tarde.
    fireEvent.pointerMove(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    expect(bloque()).toHaveAccessibleName(/^10:00/);
    await act(async () => {
      fireEvent.pointerUp(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    });

    expect(apiAgenda.moverCita).toHaveBeenCalledWith(1, {
      lineas: [{ servicioId: 100, recursoId: 1, inicio: "2026-10-21T14:30:00.000Z" }],
    });
    expect(screen.getByText("Ese horario se acaba de ocupar: la cita volvió a su lugar.")).toBeInTheDocument();
    expect(bloque()).toHaveAccessibleName(/^10:00 Rosa Mamani/);
  });

  it("arrastrar y que el backend acepte la deja en la hora nueva", async () => {
    vi.mocked(apiAgenda.moverCita).mockImplementation(async (_id, { lineas }) =>
      cita({
        inicio: lineas![0].inicio,
        fin: "2026-10-21T15:15:00.000Z",
        lineas: [{ ...cita().lineas[0], inicio: lineas![0].inicio, fin: "2026-10-21T15:15:00.000Z" }],
      }),
    );
    await montar();
    fireEvent.pointerDown(bloque(), { pointerType: "mouse", button: 0, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    await act(async () => {
      fireEvent.pointerUp(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    });
    expect(bloque()).toHaveAccessibleName(/^10:30 Rosa Mamani/);
  });
});

describe("vistas y barra (pedido del 12-oct)", () => {
  it("calendario por defecto; Lista muestra las tarjetas y se recuerda", async () => {
    await montar();
    expect(screen.getByRole("button", { name: "Calendario" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("columna-1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.queryByTestId("columna-1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver la cita de Rosa Mamani" })).toBeInTheDocument();
    expect(window.localStorage.getItem("bamar.agenda.vista.1")).toBe("lista");
  });

  it("vuelve a abrir en la vista que eligió ese usuario", async () => {
    window.localStorage.setItem("bamar.agenda.vista.1", "lista");
    await montar();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sin almacenamiento (modo privado) arranca en calendario igual", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    await montar();
    expect(screen.getByRole("button", { name: "Calendario" })).toHaveAttribute("aria-pressed", "true");
    vi.mocked(Storage.prototype.getItem).mockRestore();
  });

  it("modo simple (el defecto): la tarjeta ofrece Cobrar y no los pasos de recepción", async () => {
    vi.setSystemTime(new Date("2026-10-21T14:20:00.000Z"));
    window.localStorage.setItem("bamar.agenda.vista.1", "lista");
    await montar();
    const tarjeta = screen.getByRole("button", { name: "Ver la cita de Rosa Mamani" }).closest("article")!;
    expect(within(tarjeta).getByRole("button", { name: /^Cobrar/ })).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "No vino" })).toBeInTheDocument();
    expect(within(tarjeta).queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(within(tarjeta).queryByRole("button", { name: "Llegó" })).not.toBeInTheDocument();
  });

  it("modo completo: la tarjeta sigue con Confirmar y Llegó", async () => {
    vi.mocked(apiAgenda.reglas).mockResolvedValue({ granularidadMin: 15, bufferGeneralMin: 0, modoAgenda: "COMPLETO" });
    window.localStorage.setItem("bamar.agenda.vista.1", "lista");
    await montar();
    const tarjeta = screen.getByRole("button", { name: "Ver la cita de Rosa Mamani" }).closest("article")!;
    expect(within(tarjeta).getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "Llegó" })).toBeInTheDocument();
  });

  it("con más profesionales de los que entran a lo ancho, se ven de a N sin scroll de costado", async () => {
    // 600 px de grilla: entran (600 - 48) / 120 = 4 columnas.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe() {
          this.cb([{ contentRect: { width: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
        unobserve() {}
      },
    );
    const siete = Array.from({ length: 7 }, (_, i) => recursoDelDia({ id: i + 1, nombre: `Pro ${i + 1}`, orden: i + 1 }));
    vi.mocked(apiAgenda.dia).mockResolvedValue({ fecha: FECHA, sucursalId: 1, recursos: siete, citas: [], bloqueos: [], cola: [] });
    await montar();

    expect(screen.getAllByTestId(/^columna-/)).toHaveLength(4);
    expect(screen.getByText("1–4 de 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguientes" }));
    // La última página se completa con los anteriores: siempre 4 a la vista.
    expect(screen.getAllByTestId(/^columna-/).map((c) => c.dataset.testid)).toEqual([
      "columna-4",
      "columna-5",
      "columna-6",
      "columna-7",
    ]);
    fireEvent.change(screen.getByLabelText(/^Ver /), { target: { value: "2" } });
    expect(screen.getAllByTestId(/^columna-/)[0].dataset.testid).toBe("columna-2");
    // La grilla nunca scrollea de costado.
    expect(screen.getByTestId("grilla-scroll").className).toContain("overflow-x-hidden");
  });

  it("los filtros van en un solo desplegable, con los colores adentro", async () => {
    await montar();
    expect(screen.queryByText("Qué significa cada color")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Colores" }));
    expect(screen.getByText("Qué significa cada color")).toBeInTheDocument();
  });
});
