import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Configuración › Tickets y despacho (pedido del 10-nov): una pollería con dos
 * cajeras que todavía no usa la pantalla de Despacho no podía cerrar sesión con
 * los pedidos esperando. El encargado apaga Despacho (el número sigue saliendo
 * en el recibo) y elige si el número vuelve a 001 cada día o cada turno.
 */

const fijarUsaDespacho = vi.fn();
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ fijarUsaDespacho }),
}));

const api = vi.hoisted(() => ({ config: vi.fn(), guardarConfig: vi.fn() }));
vi.mock("../../lib/apiTickets", () => ({ apiTickets: api }));

import ConfigTickets from "./ConfigTickets";

async function montar() {
  render(
    <MemoryRouter>
      <ConfigTickets />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const interruptor = () => screen.getByRole("switch", { name: "Usar Despacho" });
const opcion = (texto: string) => screen.getByRole("radio", { name: texto });

beforeEach(() => {
  vi.clearAllMocks();
  api.config.mockResolvedValue({ usaDespacho: true, numeracion: "DIARIA" });
});

describe("Configuración › Tickets y despacho", () => {
  it("de fábrica: despacho prendido y el número vuelve a 001 cada día", async () => {
    await montar();
    expect(interruptor()).toHaveAttribute("aria-checked", "true");
    expect(opcion("Cada día")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/vuelve a 001 a las 6 de la mañana/)).toBeInTheDocument();
  });

  it("apagar el despacho pide confirmar, dice cuántos pedidos se entregaron y lo saca del menú", async () => {
    api.guardarConfig.mockResolvedValue({ usaDespacho: false, numeracion: "DIARIA", entregados: 23 });
    await montar();
    fireEvent.click(interruptor());
    // Sin confirmar no se manda nada: apagarlo da por entregados los pedidos.
    expect(api.guardarConfig).not.toHaveBeenCalled();
    const dialogo = screen.getByRole("dialog", { name: "¿Dejar de usar Despacho?" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Apagar" }));
    });
    expect(api.guardarConfig).toHaveBeenCalledWith({ usaDespacho: false });
    expect(interruptor()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Se dieron por entregados 23 pedidos que esperaban en Despacho/)).toBeInTheDocument();
    expect(screen.getByText(/la cajera cierra sesión sin trabas/)).toBeInTheDocument();
    expect(fijarUsaDespacho).toHaveBeenCalledWith(false);
  });

  it("cancelar la confirmación deja el despacho como estaba", async () => {
    await montar();
    fireEvent.click(interruptor());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(api.guardarConfig).not.toHaveBeenCalled();
    expect(interruptor()).toHaveAttribute("aria-checked", "true");
  });

  it("prenderlo no pide confirmar: no le saca nada a nadie", async () => {
    api.config.mockResolvedValue({ usaDespacho: false, numeracion: "DIARIA" });
    api.guardarConfig.mockResolvedValue({ usaDespacho: true, numeracion: "DIARIA", entregados: 0 });
    await montar();
    await act(async () => {
      fireEvent.click(interruptor());
    });
    expect(api.guardarConfig).toHaveBeenCalledWith({ usaDespacho: true });
    expect(interruptor()).toHaveAttribute("aria-checked", "true");
    expect(fijarUsaDespacho).toHaveBeenCalledWith(true);
  });

  it("elegir cada turno lo guarda y explica cuándo se repiten los números", async () => {
    api.guardarConfig.mockResolvedValue({ usaDespacho: true, numeracion: "POR_TURNO", entregados: 0 });
    await montar();
    await act(async () => {
      fireEvent.click(opcion("Cada turno de caja"));
    });
    expect(api.guardarConfig).toHaveBeenCalledWith({ numeracion: "POR_TURNO" });
    expect(opcion("Cada turno de caja")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Cada caja que se abre empieza en 001/)).toBeInTheDocument();
    expect(screen.getByText(/cobran dos cajas a la vez/)).toBeInTheDocument();
  });

  it("tocar la opción que ya está no manda nada", async () => {
    await montar();
    fireEvent.click(opcion("Cada día"));
    expect(api.guardarConfig).not.toHaveBeenCalled();
  });

  it("si no se pudo guardar, el control queda como estaba y lo dice", async () => {
    api.guardarConfig.mockRejectedValue(new Error("No se pudo conectar con el servidor."));
    await montar();
    await act(async () => {
      fireEvent.click(opcion("Cada turno de caja"));
    });
    expect(opcion("Cada día")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("No se pudo conectar con el servidor.")).toBeInTheDocument();
    expect(fijarUsaDespacho).not.toHaveBeenCalled();
  });

  it("si la carga falla no muestra controles que mientan: ofrece reintentar", async () => {
    api.config.mockRejectedValue(new Error("No se pudo conectar con el servidor."));
    await montar();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("No se pudo conectar con el servidor.")).toBeInTheDocument();
  });

  it("con un solo pedido el aviso va en singular", async () => {
    api.guardarConfig.mockResolvedValue({ usaDespacho: false, numeracion: "DIARIA", entregados: 1 });
    await montar();
    fireEvent.click(interruptor());
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Apagar" }));
    });
    expect(screen.getByText(/Se dio por entregado 1 pedido que esperaba en Despacho/)).toBeInTheDocument();
  });
});
