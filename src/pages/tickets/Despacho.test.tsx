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

// El local del despacho (PLAN-SUCURSAL-TOTAL, etapa 5): por defecto un solo
// local, como todos los casos de arriba; los de abajo lo cambian.
const local = vi.hoisted(() => ({
  elegir: false,
  locales: [] as { id: number; nombre: string }[],
  sucursalId: null as number | null,
  miSede: null as string | null,
  setLocal: vi.fn(),
}));
vi.mock("./useLocalDeTickets", async (importOriginal) => {
  const real = await importOriginal<typeof import("./useLocalDeTickets")>();
  return { ...real, useLocalDeTickets: () => ({ ...local, nombre: "" }) };
});

import Despacho from "./Despacho";

const tablero = (tickets: TicketPedido[]): TableroTickets => ({ ahora, sucursalId: 1, siguiente: 80, tickets });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(local, { elegir: false, locales: [], sucursalId: null, miSede: null });
  api.tablero.mockResolvedValue(
    tablero([ticket({}), ticket({ id: 2, numero: 69, estado: "LISTO", listoEn: new Date(ahora).toISOString(), llamadoEn: new Date(ahora).toISOString(), llamados: 1 })]),
  );
});

describe("Despacho", () => {
  it("muestra cada pedido con su número, lo de mesa y llevar por separado y la nota", async () => {
    render(<Despacho />);
    const tarjeta = (await screen.findByText("072")).closest("article")!;
    expect(within(tarjeta).getByText("EN MESA")).toBeInTheDocument();
    expect(within(tarjeta).getByText("PARA LLEVAR")).toBeInTheDocument();
    expect(within(tarjeta).getByText("sin ensalada")).toBeInTheDocument();
    expect(screen.getByText(/1 en preparación · 1 listos por entregar/)).toBeInTheDocument();
  });

  it("«Listo · llamar» lo marca listo y avisa que suena en la pantalla", async () => {
    api.listo.mockResolvedValue(ticket({ estado: "LISTO", llamados: 1 }));
    render(<Despacho />);
    const tarjeta = (await screen.findByText("072")).closest("article")!;
    fireEvent.click(within(tarjeta).getByRole("button", { name: /LISTO · LLAMAR/ }));
    await waitFor(() => expect(api.listo).toHaveBeenCalledWith(1));
    expect(await screen.findByText("072 llamado en la pantalla")).toBeInTheDocument();
  });

  it("entregado se puede deshacer al toque", async () => {
    api.entregar.mockResolvedValue(ticket({ id: 2, numero: 69, estado: "ENTREGADO" }));
    api.reabrir.mockResolvedValue(ticket({ id: 2, numero: 69, estado: "LISTO" }));
    render(<Despacho />);
    const tarjeta = (await screen.findByText("069")).closest("article")!;
    fireEvent.click(within(tarjeta).getByRole("button", { name: /Entregado/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(api.reabrir).toHaveBeenCalledWith(2));
  });

  it("el teclado de la compu escribe el número y Enter lo llama", async () => {
    api.llamarNumero.mockResolvedValue(ticket({ estado: "LISTO" }));
    render(<Despacho />);
    await screen.findByText("072");
    act(() => {
      for (const k of ["7", "2", "Enter"]) window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
    });
    await waitFor(() => expect(api.llamarNumero).toHaveBeenCalledWith(72));
  });

  it("si el número ya se entregó, lo dice", async () => {
    api.llamarNumero.mockRejectedValue(new Error("El pedido 0070 ya se entregó."));
    render(<Despacho />);
    await screen.findByText("072");
    for (const k of ["7", "0"]) fireEvent.click(screen.getByRole("button", { name: k }));
    fireEvent.click(screen.getByRole("button", { name: /Llamar en pantalla/ }));
    expect(await screen.findByText("El pedido 0070 ya se entregó.")).toBeInTheDocument();
  });

  it("el acceso de despacho sale desde acá, confirmando: volver a entrar es tipear la contraseña", async () => {
    api.tablero.mockResolvedValue(tablero([ticket({ estado: "ENTREGADO", entregadoEn: new Date(ahora).toISOString() })]));
    const onSalir = vi.fn();
    render(<Despacho onSalir={onSalir} />);
    await screen.findByText(/0 en preparación · 0 listos por entregar/);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(onSalir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, salir" }));
    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  it("con pedidos en el tablero el acceso de despacho no sale (Kevin, 1-nov)", async () => {
    // El cliente se quedaría con su número y nadie para llamarlo.
    const onSalir = vi.fn();
    render(<Despacho onSalir={onSalir} />);
    await screen.findByText("072");
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(screen.queryByRole("button", { name: "Sí, salir" })).not.toBeInTheDocument();
    expect(await screen.findByText("Quedan 2 pedidos sin entregar: entregalos antes de salir.")).toBeInTheDocument();
    expect(onSalir).not.toHaveBeenCalled();
  });

  it("quien despacha desde el menú (la cajera) no tiene el botón de salir", async () => {
    render(<Despacho />);
    await screen.findByText("072");
    expect(screen.queryByRole("button", { name: "Salir" })).not.toBeInTheDocument();
  });

  it("con el despacho apagado lo dice, sin tablero ni teclado (10-nov)", async () => {
    // Lo dice el tablero y no la sesión: la tablet de la cocina no vuelve a
    // entrar nunca y su sesión sería de antes del cambio.
    api.tablero.mockResolvedValue({ ...tablero([]), usaDespacho: false });
    const onSalir = vi.fn();
    render(<Despacho onSalir={onSalir} />);
    expect(await screen.findByText("El despacho está apagado")).toBeInTheDocument();
    expect(screen.queryByText("Sin pedidos por despachar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Llamar un número/ })).not.toBeInTheDocument();
    // La tecla de la PC tampoco llama a nadie.
    fireEvent.keyDown(window, { key: "7" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(api.llamarNumero).not.toHaveBeenCalled();
    // El acceso de la tablet igual puede salir.
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, salir" }));
    expect(onSalir).toHaveBeenCalledTimes(1);
  });
});

describe("Despacho con varios locales (PLAN-SUCURSAL-TOTAL, etapa 5)", () => {
  it("la organización elige el local: el tablero y el teclado van con su id", async () => {
    Object.assign(local, {
      elegir: true,
      locales: [
        { id: 1, nombre: "Centro" },
        { id: 2, nombre: "Sur" },
      ],
      sucursalId: 2,
    });
    api.llamarNumero.mockResolvedValue(ticket({ estado: "LISTO" }));
    render(<Despacho />);
    await screen.findByText("072");
    expect(api.tablero).toHaveBeenCalledWith(2);
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("2");
    fireEvent.change(screen.getByRole("combobox", { name: "Sucursal" }), { target: { value: "1" } });
    expect(local.setLocal).toHaveBeenCalledWith(1);
    act(() => {
      for (const k of ["7", "2", "Enter"]) window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
    });
    await waitFor(() => expect(api.llamarNumero).toHaveBeenCalledWith(72, 2));
  });

  it("el usuario de un local no ve selector, sólo el nombre de su sede", async () => {
    local.miSede = "Sucursal Sur";
    render(<Despacho />);
    await screen.findByText("072");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/Sucursal Sur ·/)).toBeInTheDocument();
  });

  it("con un solo local no aparece nada nuevo", async () => {
    render(<Despacho />);
    await screen.findByText("072");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(api.tablero).toHaveBeenCalledWith(null);
  });
});
