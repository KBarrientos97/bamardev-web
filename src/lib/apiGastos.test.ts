import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

/**
 * Gastos operativos del mes (pantalla Gastos). La pantalla manda días
 * (`2026-10-01` a `2026-11-01`, `hasta` exclusivo) y el backend hace
 * `new Date(desde)`: con el día pelado era la medianoche UTC (las 20:00 del
 * día anterior en Bolivia), y "Sobre las ventas" sumaba las ventas de la
 * noche del 30-sep y dejaba afuera las del 31-oct a la noche. Como en los
 * reportes, el corte es la medianoche LOCAL. Sin suponer zona horaria: se
 * compara contra la medianoche local que arma `Date` (el CI corre en UTC).
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

const parametros = (f: ReturnType<typeof fetchQueDevuelve>, i = 0) =>
  new URL(String(f.mock.calls[i][0]), "https://x").searchParams;

describe("el mes de gastos se corta en el reloj del negocio", () => {
  it("resumen: desde y hasta son la medianoche local, sin correr el hasta exclusivo", async () => {
    const f = fetchQueDevuelve({});
    await api.getResumenGastos({ desde: "2026-10-01", hasta: "2026-11-01" });
    const q = parametros(f);
    expect(q.get("desde")).toMatch(/^2026-10-01T00:00:00[+-]\d{2}:\d{2}$/);
    expect(q.get("hasta")).toMatch(/^2026-11-01T00:00:00[+-]\d{2}:\d{2}$/);
    expect(new Date(q.get("desde")!).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(q.get("hasta")!).getTime()).toBe(new Date(2026, 10, 1).getTime());
  });

  it("lista: igual, con el resto de los filtros intactos", async () => {
    const f = fetchQueDevuelve([]);
    await api.getGastos({ desde: "2026-10-01", hasta: "2026-11-01", filtro: "VENCIDOS", sucursalId: 3 });
    const q = parametros(f);
    expect(new Date(q.get("desde")!).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(q.get("hasta")!).getTime()).toBe(new Date(2026, 10, 1).getTime());
    expect(q.get("filtro")).toBe("VENCIDOS");
    expect(q.get("sucursalId")).toBe("3");
  });

  it("lo que ya viene con hora (el Estado de resultado) pasa tal cual", async () => {
    const f = fetchQueDevuelve([]);
    await api.getGastos({ desde: "2026-10-01T00:00:00-04:00", hasta: "2026-10-08T00:00:00-04:00" });
    const q = parametros(f);
    expect(q.get("desde")).toBe("2026-10-01T00:00:00-04:00");
    expect(q.get("hasta")).toBe("2026-10-08T00:00:00-04:00");
  });
});
