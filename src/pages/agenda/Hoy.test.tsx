import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { cita } from "../../test/agendaFixtures";

/**
 * A3 · Hoy y A6 · Cola: los botones del momento, los filtros, "Cobrar" a la
 * vista pero apagado, y la cola sólo con la feature `cola_walkin`.
 */

const sesion = vi.hoisted(() => ({ features: ["agenda", "cola_walkin"] as string[], conPos: false }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 3, username: "recepcion", rol: "CAJERO", sucursalId: 1, sucursal: "Centro", modulos: [] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA", features: sesion.features },
    puede: (s: string) => s === "pos" && sesion.conPos,
  }),
}));

function Ubicacion() {
  const l = useLocation();
  return <span data-testid="ubicacion">{`${l.pathname}${l.search}`}</span>;
}

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: { hoy: vi.fn(), cambiarEstado: vi.fn(), atenderAhora: vi.fn(), cita: vi.fn() },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import Hoy from "./Hoy";

const confirmada = cita({ id: 1, estado: "CONFIRMADA" });
const porCobrar = cita({
  id: 2,
  estado: "POR_COBRAR",
  inicio: "2026-10-21T13:15:00.000Z",
  cliente: { ...cita().cliente, nombre: "Jorge Rojas" },
});
const reservada = cita({
  id: 3,
  estado: "RESERVADA",
  inicio: "2026-10-21T15:30:00.000Z",
  cliente: { ...cita().cliente, nombre: "Valeria Arce" },
});
const enCola = cita({
  id: 4,
  estado: "EN_COLA",
  inicio: null,
  fin: null,
  lineas: [],
  cliente: { ...cita().cliente, nombre: "Carlos Vaca" },
});

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["agenda", "cola_walkin"];
  sesion.conPos = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T13:00:00.000Z"));
  vi.mocked(apiAgenda.hoy).mockResolvedValue({
    citas: [confirmada, porCobrar, reservada],
    cola: [enCola],
    contadores: { porConfirmar: 1, enEspera: 1, enAtencion: 0, porCobrar: 1, noShowSugeridos: 0 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  render(
    <MemoryRouter>
      <Hoy />
      <Ubicacion />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const tarjeta = (nombre: string) => screen.getByRole("button", { name: `Ver la cita de ${nombre}` }).closest("article")!;

describe("A3 · Hoy", () => {
  it("lista en orden con el botón que corresponde a cada una", async () => {
    await montar();
    expect(apiAgenda.hoy).toHaveBeenCalledWith(1);
    const nombres = screen.getAllByRole("button", { name: /^Ver la cita de/ }).map((b) => b.getAttribute("aria-label"));
    expect(nombres).toEqual(["Ver la cita de Jorge Rojas", "Ver la cita de Rosa Mamani", "Ver la cita de Valeria Arce"]);

    expect(within(tarjeta("Rosa Mamani")).getByRole("button", { name: "Llegó" })).toBeEnabled();
    // Son las 09:00 y su cita es a las 10:00: "No vino" todavía no (QA M-08).
    expect(within(tarjeta("Rosa Mamani")).queryByRole("button", { name: "No vino" })).not.toBeInTheDocument();
    expect(within(tarjeta("Valeria Arce")).getByRole("button", { name: "Confirmar" })).toBeEnabled();
    // Sin punto de venta en el rol, "Cobrar" se ve pero lo hace la caja.
    expect(within(tarjeta("Jorge Rojas")).getByRole("button", { name: "Cobrar en caja" })).toBeDisabled();
  });

  it("con punto de venta, Cobrar abre el POS con la cita cargada", async () => {
    sesion.conPos = true;
    await montar();
    fireEvent.click(within(tarjeta("Jorge Rojas")).getByRole("button", { name: "Cobrar" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/pos?cita=2");
  });

  it("Llegó va directo; No vino pregunta antes", async () => {
    vi.mocked(apiAgenda.cambiarEstado).mockImplementation(async (id, accion) =>
      cita({ id, estado: accion === "LLEGO" ? "EN_ESPERA" : "NO_ASISTIO" }),
    );
    await montar();

    await act(async () => {
      fireEvent.click(within(tarjeta("Rosa Mamani")).getByRole("button", { name: "Llegó" }));
    });
    expect(apiAgenda.cambiarEstado).toHaveBeenCalledWith(1, "LLEGO");
    // Ahora está "Llegó" (en espera): el botón del momento es Atender.
    expect(within(tarjeta("Rosa Mamani")).getByRole("button", { name: "Atender" })).toBeInTheDocument();

    fireEvent.click(within(tarjeta("Valeria Arce")).getByRole("button", { name: "Llegó" }));
    expect(apiAgenda.cambiarEstado).toHaveBeenCalledTimes(2);
  });

  it("pasada la hora de inicio ofrece «No vino»", async () => {
    vi.setSystemTime(new Date("2026-10-21T14:20:00.000Z"));
    await montar();
    expect(within(tarjeta("Rosa Mamani")).getByRole("button", { name: "No vino" })).toBeEnabled();
  });

  it("M-10: después de una acción las tarjetas de arriba se ponen al día", async () => {
    vi.mocked(apiAgenda.cambiarEstado).mockResolvedValue({ ...reservada, estado: "EN_ESPERA" });
    await montar();
    const valor = (etiqueta: string) => screen.getByText(etiqueta, { selector: "dt" }).nextElementSibling?.textContent;
    // 1 en la cola cuenta como llegada.
    expect(valor("Llegaron")).toBe("1");
    expect(valor("Por confirmar")).toBe("1");
    await act(async () => {
      fireEvent.click(within(tarjeta("Valeria Arce")).getByRole("button", { name: "Llegó" }));
    });
    expect(valor("Llegaron")).toBe("2");
    expect(valor("Por confirmar")).toBe("0");
    expect(valor("Por cobrar")).toBe("1");
  });

  it("los filtros cuentan y filtran", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Por cobrar · 1" }));
    expect(screen.getAllByRole("button", { name: /^Ver la cita de/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Ver la cita de Jorge Rojas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Por confirmar · 1" }));
    expect(screen.getByRole("button", { name: "Ver la cita de Valeria Arce" })).toBeInTheDocument();
  });

  it("sin la feature de cola no hay pestaña de cola", async () => {
    sesion.features = ["agenda"];
    await montar();
    expect(screen.queryByRole("tab", { name: /Cola/ })).not.toBeInTheDocument();
  });
});

describe("A6 · Cola de espera", () => {
  it("atender ahora sin nadie libre muestra la espera estimada", async () => {
    vi.mocked(apiAgenda.atenderAhora).mockRejectedValue(
      new ApiError("Sin nadie libre", 409, { codigo: "SIN_RECURSO_LIBRE", esperaEstimadaMin: 25 }),
    );
    await montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cola · 1" }));
    expect(screen.getByText("Carlos Vaca")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Atender ahora" }));
    });
    expect(apiAgenda.atenderAhora).toHaveBeenCalledWith(4);
    expect(screen.getByRole("status")).toHaveTextContent("Espera estimada: ~25 min");
  });

  it("se fue la marca como abandonada", async () => {
    vi.mocked(apiAgenda.cambiarEstado).mockResolvedValue({ ...enCola, estado: "ABANDONADA" });
    await montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cola · 1" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Se fue" }));
    });
    expect(apiAgenda.cambiarEstado).toHaveBeenCalledWith(4, "ABANDONO");
  });
});
