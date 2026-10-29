import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

/**
 * Lo invertido en insumos (`GET /insumos/compras`, 28-oct). La pantalla manda
 * el mes como días (`2026-10-01` a `2026-11-01`, `hasta` exclusivo) y el
 * backend cuenta las compras con `fecha` en [desde, hasta): con el día pelado
 * sería la medianoche UTC, y una compra registrada sin fecha a las 21:00 del 31
 * (la 01:00 del 1 en UTC) caería en el mes siguiente. Como en Gastos, el corte
 * es la medianoche LOCAL. Sin suponer zona horaria: se compara contra la
 * medianoche local que arma `Date` (el CI corre en UTC).
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function fetchQueDevuelve(cuerpo: unknown) {
  const f = vi.fn(async (_url: RequestInfo | URL) =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}

const url = (f: ReturnType<typeof fetchQueDevuelve>) => new URL(String(f.mock.calls[0][0]), "https://x");

describe("lo invertido en insumos", () => {
  it("pide el mes en el reloj del negocio, sin correr el hasta exclusivo", async () => {
    const f = fetchQueDevuelve({ total: 0, numCompras: 0, porInsumo: [] });
    await api.getComprasInsumos({ desde: "2026-10-01", hasta: "2026-11-01" });
    const u = url(f);
    expect(u.pathname).toMatch(/\/insumos\/compras$/);
    expect(u.searchParams.get("desde")).toMatch(/^2026-10-01T00:00:00[+-]\d{2}:\d{2}$/);
    expect(u.searchParams.get("hasta")).toMatch(/^2026-11-01T00:00:00[+-]\d{2}:\d{2}$/);
    expect(new Date(u.searchParams.get("desde")!).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(u.searchParams.get("hasta")!).getTime()).toBe(new Date(2026, 10, 1).getTime());
    // Sin sucursal elegida no viaja: el backend da el negocio entero (o la del usuario).
    expect(u.searchParams.has("sucursalId")).toBe(false);
  });

  it("con una sucursal elegida, la manda", async () => {
    const f = fetchQueDevuelve({ total: 0, numCompras: 0, porInsumo: [] });
    await api.getComprasInsumos({ desde: "2026-10-01", hasta: "2026-11-01", sucursalId: 3 });
    expect(url(f).searchParams.get("sucursalId")).toBe("3");
  });

  it("devuelve lo que manda el backend, tal cual", async () => {
    const cuerpo = {
      total: 3450.5,
      numCompras: 12,
      porInsumo: [{ insumoId: 1, total: 3000, cantidad: 120, compras: 8, ultimaFecha: "2026-10-25T14:00:00.000Z" }],
    };
    fetchQueDevuelve(cuerpo);
    await expect(api.getComprasInsumos({ desde: "2026-10-01", hasta: "2026-11-01" })).resolves.toEqual(cuerpo);
  });
});
