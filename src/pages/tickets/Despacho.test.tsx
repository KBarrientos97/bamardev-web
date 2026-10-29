import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableroTickets, TicketPedido } from "../../types/tickets";

/**
 * Despacho (29-oct): lo que se cobra en caja aparece solo con su número, lo
 * que hay que armar separado en mesa y llevar, y un toque lo llama en la TV.
 * El teclado llama por número, también con el teclado de la compu.
 */

const ahora = Date.parse("2026-10-29T20:00:00Z");

const ticket = (p: Partial<TicketPedido>): TicketPedido => ({
  id: 1,
  numero: 72,
  estado: "PREPARANDO",
  creadoEn: new Date(ahora - 3 * 60_000).toISOString(),
  listoEn: null,
  llamadoEn: null,
  llamados: 0,
  entregadoEn: null,
  comprobante: "V-000029",
  items: [
    { producto: "Brasa cuarto", cantidad: 2, nota: "sin ensalada", consumo: "LLEVAR" },
    { producto: "Coca Cola 1.5L", cantidad: 1, nota: null, consumo: "MESA" },
  ],
  ...p,
});

const api = vi.hoisted(() => ({
  tablero: vi.fn(),
  listo: vi.fn(),
  llamar: vi.fn(),
  entregar: vi.fn(),
  reabrir: vi.fn(),
  llamarNumero: vi.fn(),
}));
vi.mock("../../lib/apiTickets", () => ({ apiTickets: api }));

import Despacho from "./Despacho";

const tablero = (tickets: TicketPedido[]): TableroTickets => ({ ahora, sucursalId: 1, siguiente: 80, tickets });

beforeEach(() => {
  vi.clearAllMocks();
  api.tablero.mockResolvedValue(
    tablero([ticket({}), ticket({ id: 2, numero: 69, estado: "LISTO", listoEn: new Date(ahora).toISOString(), llamadoEn: new Date(ahora).toISOString(), llamados: 1 })]),
  );
});

describe("Despacho", () => {
  it("muestra cada pedido con su número, lo de mesa y llevar por separado y la nota", async () => {
    render(<Despacho />);
    const tarjeta = (await screen.findByText("0072")).closest("article")!;
    expect(within(tarjeta).getByText("EN MESA")).toBeInTheDocument();
    expect(within(tarjeta).getByText("PARA LLEVAR")).toBeInTheDocument();
    expect(within(tarjeta).getByText("sin ensalada")).toBeInTheDocument();
    expect(screen.getByText(/1 en preparación · 1 listos por entregar/)).toBeInTheDocument();
  });

  it("«Listo · llamar» lo marca listo y avisa que suena en la pantalla", async () => {
    api.listo.mockResolvedValue(ticket({ estado: "LISTO", llamados: 1 }));
    render(<Despacho />);
    const tarjeta = (await screen.findByText("0072")).closest("article")!;
    fireEvent.click(within(tarjeta).getByRole("button", { name: /LISTO · LLAMAR/ }));
    await waitFor(() => expect(api.listo).toHaveBeenCalledWith(1));
    expect(await screen.findByText("0072 llamado en la pantalla")).toBeInTheDocument();
  });

  it("entregado se puede deshacer al toque", async () => {
    api.entregar.mockResolvedValue(ticket({ id: 2, numero: 69, estado: "ENTREGADO" }));
    api.reabrir.mockResolvedValue(ticket({ id: 2, numero: 69, estado: "LISTO" }));
    render(<Despacho />);
    const tarjeta = (await screen.findByText("0069")).closest("article")!;
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Entregado/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(api.reabrir).toHaveBeenCalledWith(2));
  });

  it("el teclado de la compu escribe el número y Enter lo llama", async () => {
    api.llamarNumero.mockResolvedValue(ticket({ estado: "LISTO" }));
    render(<Despacho />);
    await screen.findByText("0072");
    act(() => {
      for (const k of ["7", "2", "Enter"]) window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
    });
    await waitFor(() => expect(api.llamarNumero).toHaveBeenCalledWith(72));
  });

  it("si el número ya se entregó, lo dice", async () => {
    api.llamarNumero.mockRejectedValue(new Error("El pedido 0070 ya se entregó."));
    render(<Despacho />);
    await screen.findByText("0072");
    for (const k of ["7", "0"]) fireEvent.click(screen.getByRole("button", { name: k }));
    fireEvent.click(screen.getByRole("button", { name: /Llamar en pantalla/ }));
    expect(await screen.findByText("El pedido 0070 ya se entregó.")).toBeInTheDocument();
  });
});
