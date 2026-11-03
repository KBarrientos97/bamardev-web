import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableroTickets, TicketPedido } from "../../types/tickets";

const api = vi.hoisted(() => ({ tablero: vi.fn() }));
vi.mock("../../lib/apiTickets", () => ({ apiTickets: api }));

import { REFRESCO_TABLERO_MS, useTableroTickets } from "./useTableroTickets";

function ticket(estado: TicketPedido["estado"]): TicketPedido {
  return {
    id: 1,
    numero: 72,
    estado,
    creadoEn: "2026-10-31T14:00:00.000Z",
    listoEn: estado === "PREPARANDO" ? null : "2026-10-31T14:05:00.000Z",
    llamadoEn: estado === "PREPARANDO" ? null : "2026-10-31T14:05:00.000Z",
    entregadoEn: null,
    items: [],
  } as unknown as TicketPedido;
}

const tablero = (estado: TicketPedido["estado"]): TableroTickets =>
  ({ ahora: Date.now(), siguiente: 73, tickets: [ticket(estado)] }) as unknown as TableroTickets;

/** Una respuesta que se suelta a mano: la vuelta que sigue en vuelo. */
function enVuelo() {
  let soltar: (t: TableroTickets) => void = () => {};
  const promesa = new Promise<TableroTickets>((ok) => (soltar = ok));
  return { promesa, soltar };
}

describe("useTableroTickets: una vuelta vieja no deshace un toque", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.tablero.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("la lista que salió antes de «Listo · llamar» se tira y se pregunta otra vez", async () => {
    // 31-oct: la respuesta vieja devolvía la 0072 a "en preparación" hasta
    // la vuelta siguiente; el despachador la volvía a tocar y la TV la
    // llamaba dos veces.
    api.tablero.mockResolvedValueOnce(tablero("PREPARANDO"));
    const { result } = renderHook(() => useTableroTickets());
    await act(async () => {});
    expect(result.current.datos?.tickets[0].estado).toBe("PREPARANDO");

    // Sale la vuelta de cada 3 s y queda en vuelo.
    const vieja = enVuelo();
    api.tablero.mockReturnValueOnce(vieja.promesa);
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_TABLERO_MS);
    });

    // El toque vuelve antes que la vuelta: se ve al instante.
    await act(async () => {
      await result.current.aplicar(async () => ticket("LISTO"));
    });
    expect(result.current.datos?.tickets[0].estado).toBe("LISTO");

    // Llega la vuelta vieja (leída antes del toque): no se aplica, y se pregunta de nuevo.
    const nueva = enVuelo();
    api.tablero.mockReturnValueOnce(nueva.promesa);
    await act(async () => {
      vieja.soltar(tablero("PREPARANDO"));
    });
    expect(result.current.datos?.tickets[0].estado).toBe("LISTO");
    expect(api.tablero).toHaveBeenCalledTimes(3);

    await act(async () => {
      nueva.soltar(tablero("LISTO"));
    });
    expect(result.current.datos?.tickets[0].estado).toBe("LISTO");
  });

  it("sin toques en el medio, cada vuelta se aplica como siempre", async () => {
    api.tablero.mockResolvedValueOnce(tablero("PREPARANDO")).mockResolvedValueOnce(tablero("LISTO"));
    const { result } = renderHook(() => useTableroTickets());
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_TABLERO_MS);
    });
    expect(result.current.datos?.tickets[0].estado).toBe("LISTO");
    expect(api.tablero).toHaveBeenCalledTimes(2);
  });
});
