import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Agotado hoy" es de cada local: la caja pide los agotados del local de su
 * turno, y al cambiar de local no se queda con lo del anterior.
 */

const auth = vi.hoisted(() => ({ features: ["menu_digital"] as string[] }));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { features: auth.features } }),
}));

const api = vi.hoisted(() => ({ agotadosHoy: vi.fn() }));
vi.mock("../apiMenuDigital", () => ({ apiMenuDigital: api }));

import { useAgotadosHoy } from "./useAgotadosHoy";

beforeEach(() => {
  vi.clearAllMocks();
  auth.features = ["menu_digital"];
  api.agotadosHoy.mockImplementation(async (sucursalId?: number | null) => ({
    productoIds: sucursalId === 2 ? [20] : [10],
  }));
});

describe("useAgotadosHoy", () => {
  it("pide los agotados del local que se le pasa", async () => {
    const { result } = renderHook(() => useAgotadosHoy(2));
    await waitFor(() => expect(result.current.has(20)).toBe(true));
    expect(api.agotadosHoy).toHaveBeenCalledWith(2);
    expect(result.current.has(10)).toBe(false);
  });

  it("sin local (un local, o atado a uno) pide sin sucursal, como siempre", async () => {
    const { result } = renderHook(() => useAgotadosHoy());
    await waitFor(() => expect(result.current.has(10)).toBe(true));
    expect(api.agotadosHoy).toHaveBeenCalledWith(undefined);
  });

  it("al cambiar de local deja de mostrar lo del anterior y trae lo del nuevo", async () => {
    const { result, rerender } = renderHook(({ s }: { s: number }) => useAgotadosHoy(s), {
      initialProps: { s: 1 },
    });
    await waitFor(() => expect(result.current.has(10)).toBe(true));
    rerender({ s: 2 });
    await waitFor(() => expect(result.current.has(20)).toBe(true));
    expect(result.current.has(10)).toBe(false);
  });

  it("sin el extra no pide nada", async () => {
    auth.features = [];
    const { result } = renderHook(() => useAgotadosHoy(2));
    expect(result.current.size).toBe(0);
    expect(api.agotadosHoy).not.toHaveBeenCalled();
  });
});
