import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginaProductos, Producto } from "../../types";

/**
 * La mecánica delicada del buscador del mostrador: lo que llega tarde no
 * puede pisar lo que la persona está mirando ahora.
 */

vi.mock("../../lib/api", () => ({
  api: { buscarProductos: vi.fn() },
}));

import { api } from "../../lib/api";
import { useBusquedaProductos } from "./useBusquedaProductos";

const buscar = vi.mocked(api.buscarProductos);

function productos(prefijo: string, desde: number, cuantos: number): Producto[] {
  return Array.from(
    { length: cuantos },
    (_, i) => ({ id: desde + i, nombre: `${prefijo} ${desde + i}` }) as Producto,
  );
}

function pagina(items: Producto[], total: number, offset = 0): PaginaProductos {
  return { items, total, limite: 20, offset };
}

/** Una respuesta que el test suelta cuando quiere. */
function diferida<T>() {
  let soltar!: (v: T) => void;
  const promesa = new Promise<T>((r) => (soltar = r));
  return { promesa, soltar };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Ver más", () => {
  it("un «Ver más» que vuelve tarde no se suma ni pisa la búsqueda nueva", async () => {
    // El caso de QA (M3): "Ver más" y escribir "ome" enseguida → se veían 2
    // resultados y después 24 del catálogo sin filtrar con "ome" escrito.
    const tarde = diferida<PaginaProductos>();
    buscar.mockImplementation(async ({ q, offset }) => {
      if (offset) return tarde.promesa;
      return q === "ome"
        ? pagina(productos("Omeprazol", 500, 2), 2)
        : pagina(productos("Catálogo", 1, 20), 44);
    });

    const { result, rerender } = renderHook(({ q }) => useBusquedaProductos({ q }), {
      initialProps: { q: "" },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(20));

    act(() => result.current.traerMas());
    rerender({ q: "ome" });
    await waitFor(() => expect(result.current.consulta).toBe("ome"));
    expect(result.current.items).toHaveLength(2);

    await act(async () => {
      tarde.soltar(pagina(productos("Catálogo", 21, 4), 44, 20));
    });
    expect(result.current.items.map((p) => p.nombre)).toEqual(["Omeprazol 500", "Omeprazol 501"]);
    expect(result.current.total).toBe(2);
    expect(result.current.trayendoMas).toBe(false);
  });

  it("pide la tanda siguiente del texto del que salió la lista", async () => {
    buscar.mockImplementation(async ({ offset }) =>
      offset ? pagina(productos("Ome", 21, 4), 24, 20) : pagina(productos("Ome", 1, 20), 24),
    );
    const { result } = renderHook(() => useBusquedaProductos({ q: "ome" }));
    await waitFor(() => expect(result.current.items).toHaveLength(20));

    await act(async () => result.current.traerMas());
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ q: "ome", offset: 20 }));
    expect(result.current.items).toHaveLength(24);
    expect(result.current.hayMas).toBe(false);
  });

  it("dos clics en el mismo tick traen la tanda una sola vez", async () => {
    buscar.mockImplementation(async ({ offset }) =>
      offset ? pagina(productos("Ome", 21, 4), 24, 20) : pagina(productos("Ome", 1, 20), 24),
    );
    const { result } = renderHook(() => useBusquedaProductos({ q: "ome" }));
    await waitFor(() => expect(result.current.items).toHaveLength(20));

    await act(async () => {
      result.current.traerMas();
      result.current.traerMas();
    });
    expect(buscar.mock.calls.filter(([p]) => p.offset === 20)).toHaveLength(1);
    expect(result.current.items).toHaveLength(24);
  });
});

describe("Antes de la primera respuesta", () => {
  it("al encenderse ya está cargando, no «vacío» hasta que salga la consulta", async () => {
    // Buscar medicamento la tiene apagada mientras averigua la caja. Al
    // encenderse pasaban 250 ms (la espera del tecleo) con `cargando` en
    // false y sin resultados: la pantalla decía "El catálogo está vacío".
    buscar.mockResolvedValue(pagina(productos("Ome", 1, 3), 3));
    const { result, rerender } = renderHook(
      ({ activo }) => useBusquedaProductos({ q: "", activo }),
      { initialProps: { activo: false } },
    );
    expect(result.current.cargando).toBe(false);

    rerender({ activo: true });
    expect(result.current.cargando).toBe(true);
    expect(buscar).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(result.current.cargando).toBe(false);
  });
});
