import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El número de «Inscripciones online» en el menú: las preinscripciones por
 * atender y, desde el 08-nov, los comprobantes por revisar para quien tiene
 * `academia.pagos_en_linea` (la bandeja está en la misma pantalla).
 */

vi.mock("./apiAcademia", () => ({
  apiAcademia: { preinscripciones: vi.fn(), pagosPorRevisar: vi.fn() },
}));

import { apiAcademia } from "./apiAcademia";
import { EVENTO_PREINSCRIPCIONES, useContadorPreinscripciones } from "./contadorPreinscripciones";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.preinscripciones).mockResolvedValue({ items: [], total: 2, page: 1, pageSize: 1 });
  vi.mocked(apiAcademia.pagosPorRevisar).mockResolvedValue({ total: 3 });
});

describe("08-nov · el número del menú suma los comprobantes", () => {
  it("sin el permiso cuenta sólo las preinscripciones y no pregunta por los pagos", async () => {
    const h = renderHook(() => useContadorPreinscripciones(true, false));
    await act(async () => {});
    expect(h.result.current).toBe(2);
    expect(apiAcademia.pagosPorRevisar).not.toHaveBeenCalled();
    h.unmount();
  });

  it("con el permiso suma los que esperan revisión, y baja cuando la bandeja avisa", async () => {
    const h = renderHook(() => useContadorPreinscripciones(true, true));
    await act(async () => {});
    expect(h.result.current).toBe(5);
    vi.mocked(apiAcademia.pagosPorRevisar).mockResolvedValue({ total: 2 });
    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_PREINSCRIPCIONES));
    });
    expect(h.result.current).toBe(4);
    h.unmount();
  });

  it("si la sección no se ve, 0 y sin consultar", async () => {
    const h = renderHook(() => useContadorPreinscripciones(false, true));
    await act(async () => {});
    expect(h.result.current).toBe(0);
    expect(apiAcademia.preinscripciones).not.toHaveBeenCalled();
    expect(apiAcademia.pagosPorRevisar).not.toHaveBeenCalled();
    h.unmount();
  });
});
