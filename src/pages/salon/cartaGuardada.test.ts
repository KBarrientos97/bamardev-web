import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * La carta se guarda por local (PLAN-SUCURSAL-TOTAL, etapa 5): el de
 * organización toma pedidos de mesas de distintos locales y cada uno tiene sus
 * precios y su stock.
 */

vi.mock("../../lib/api", () => ({ api: { cartaSalon: vi.fn() } }));

import { api } from "../../lib/api";
import { bajarCarta, cartaGuardada, olvidarCarta, precargarCarta } from "./cartaGuardada";

const carta = (precio: number) => [{ id: 1, nombre: "Brasa", precio } as unknown as Producto];

beforeEach(() => {
  olvidarCarta();
  vi.mocked(api.cartaSalon).mockReset();
});

describe("la carta guardada por local", () => {
  it("guarda una carta por local y no mezcla sus precios", async () => {
    vi.mocked(api.cartaSalon).mockImplementation(async (s) => carta(s === 2 ? 30 : 26));
    await bajarCarta();
    await bajarCarta(2);
    expect(cartaGuardada()?.[0].precio).toBe(26);
    expect(cartaGuardada(2)?.[0].precio).toBe(30);
    expect(cartaGuardada(3)).toBeNull();
  });

  it("sin local pide la de siempre (sin parámetro)", async () => {
    vi.mocked(api.cartaSalon).mockResolvedValue(carta(26));
    precargarCarta();
    expect(api.cartaSalon).toHaveBeenCalledWith(undefined);
  });

  it("olvidarCarta descarta todo, y una descarga en vuelo de la sesión anterior no queda guardada", async () => {
    let soltar!: (c: Producto[]) => void;
    vi.mocked(api.cartaSalon).mockReturnValue(new Promise((r) => (soltar = r)));
    const enVuelo = bajarCarta();
    // Cierra la sesión mientras la carta del usuario anterior todavía baja.
    olvidarCarta();
    soltar(carta(26));
    await enVuelo;
    expect(cartaGuardada()).toBeNull();
    // El que entra después pide la suya de nuevo (no se cuelga de la promesa vieja).
    vi.mocked(api.cartaSalon).mockResolvedValue(carta(30));
    await bajarCarta();
    expect(api.cartaSalon).toHaveBeenCalledTimes(2);
    expect(cartaGuardada()?.[0].precio).toBe(30);
  });

  it("una sola descarga a la vez por local, pero locales distintos no se esperan", () => {
    vi.mocked(api.cartaSalon).mockReturnValue(new Promise(() => {}));
    void bajarCarta(2);
    void bajarCarta(2);
    void bajarCarta(3);
    expect(api.cartaSalon).toHaveBeenCalledTimes(2);
  });
});
