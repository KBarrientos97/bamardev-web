import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpcionTv, TelevisorLocal } from "../../lib/apiTelevisores";

/**
 * Las TVs del local conectadas con código (Kevin, 4-nov): en la TV se abre
 * `/tv`, muestra un código, y acá se escribe eligiendo qué va a mostrar.
 * Después se le cambia lo que muestra o se la desconecta sin subirse a ella.
 */

const api = vi.hoisted(() => ({
  listar: vi.fn(),
  conectar: vi.fn(),
  cambiar: vi.fn(),
  desconectar: vi.fn(),
}));
vi.mock("../../lib/apiTelevisores", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/apiTelevisores")>();
  return { ...real, apiTelevisores: api };
});

import TelevisoresDelLocal from "./TelevisoresDelLocal";

const TICKETS: OpcionTv = { muestra: "TICKETS", menu: null, nombre: "Tickets: los números de los pedidos" };
const MENU_1: OpcionTv = { muestra: "MENU", menu: 1, nombre: "Menú: TV 1 · Pollos" };

const tv = (datos: Partial<TelevisorLocal> = {}): TelevisorLocal => ({
  id: 7,
  nombre: "TV de la entrada",
  muestra: "TICKETS",
  menu: null,
  menuNombre: null,
  sucursalId: 1,
  conectadaEn: "2026-11-04T15:00:00Z",
  prendida: true,
  ...datos,
});

beforeEach(() => vi.clearAllMocks());

describe("TVs del local", () => {
  it("dice qué abrir en la TV y la conecta con el código, escrito como venga", async () => {
    api.listar.mockResolvedValue({ televisores: [], opciones: [TICKETS, MENU_1] });
    api.conectar.mockResolvedValue(tv({ nombre: "TV 1", muestra: "MENU", menu: 1 }));
    render(<TelevisoresDelLocal />);
    expect(screen.getByText(`${window.location.host}/tv`)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Conectar una TV" }));
    const campo = screen.getByPlaceholderText("K7P 4QX");
    fireEvent.change(campo, { target: { value: "k7p-4qx" } });
    expect(campo).toHaveValue("K7P 4QX");
    fireEvent.click(screen.getByRole("radio", { name: /TV 1 · Pollos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));

    await waitFor(() =>
      expect(api.conectar).toHaveBeenCalledWith({ codigo: "K7P4QX", muestra: "MENU", menu: 1 }),
    );
    expect(await screen.findByText(/"TV 1" conectada: en unos segundos cambia sola/)).toBeInTheDocument();
  });

  it("con dos cosas para mostrar, no adivina cuál: hay que elegir", async () => {
    api.listar.mockResolvedValue({ televisores: [], opciones: [TICKETS, MENU_1] });
    render(<TelevisoresDelLocal />);
    fireEvent.click(await screen.findByRole("button", { name: "Conectar una TV" }));
    fireEvent.change(screen.getByPlaceholderText("K7P 4QX"), { target: { value: "K7P4QX" } });
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));

    expect(await screen.findByText("Elegí qué va a mostrar la TV.")).toBeInTheDocument();
    expect(api.conectar).not.toHaveBeenCalled();
  });

  it("un código incompleto no se manda", async () => {
    api.listar.mockResolvedValue({ televisores: [], opciones: [TICKETS] });
    render(<TelevisoresDelLocal />);
    fireEvent.click(await screen.findByRole("button", { name: "Conectar una TV" }));
    fireEvent.change(screen.getByPlaceholderText("K7P 4QX"), { target: { value: "K7P" } });
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));

    expect(await screen.findByText(/El código son 6 letras y números/)).toBeInTheDocument();
    expect(api.conectar).not.toHaveBeenCalled();
  });

  it("una TV conectada se pasa al menú sin tocarla", async () => {
    api.listar.mockResolvedValue({ televisores: [tv()], opciones: [TICKETS, MENU_1] });
    api.cambiar.mockResolvedValue(tv({ muestra: "MENU", menu: 1, menuNombre: "TV 1 · Pollos" }));
    render(<TelevisoresDelLocal />);
    expect(await screen.findByText("TV de la entrada")).toBeInTheDocument();
    expect(screen.getByText("Tickets · prendida")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    // Lo que muestra hoy viene marcado.
    expect(screen.getByRole("radio", { name: /Tickets/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /TV 1 · Pollos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(api.cambiar).toHaveBeenCalledWith(7, { muestra: "MENU", menu: 1, nombre: "TV de la entrada" }),
    );
  });

  it("desconectarla pide confirmación y la saca de la lista", async () => {
    api.listar.mockResolvedValueOnce({ televisores: [tv()], opciones: [TICKETS] }).mockResolvedValue({
      televisores: [],
      opciones: [TICKETS],
    });
    api.desconectar.mockResolvedValue({ ok: true });
    render(<TelevisoresDelLocal />);
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar" }));
    fireEvent.click(screen.getByRole("button", { name: "Desconectar esta TV" }));
    expect(api.desconectar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(api.desconectar).toHaveBeenCalledWith(7));
    expect(await screen.findByText(/quedó desconectada/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("TV de la entrada")).not.toBeInTheDocument());
  });

  it("sin nada que poner en una TV, dice qué falta", async () => {
    api.listar.mockResolvedValue({ televisores: [], opciones: [] });
    render(<TelevisoresDelLocal />);
    fireEvent.click(await screen.findByRole("button", { name: "Conectar una TV" }));
    expect(screen.getByText(/armá primero una pantalla del Menú digital/)).toBeInTheDocument();
  });
});
