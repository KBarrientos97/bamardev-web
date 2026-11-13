import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La sede en la que se cobra, para pedir el QR de ESA sede (13-nov-2026). Sólo
 * trabaja para la organización de un negocio con 2+ locales; para los demás es
 * "ninguna" al instante y sin una sola llamada.
 */

const est = vi.hoisted(() => ({
  usuario: { sucursalId: null as number | null },
  negocio: { tipoNegocio: "RESTAURANTE", features: ["multi_almacen"], sucursalesActivas: 2 } as {
    tipoNegocio: string;
    features: string[];
    sucursalesActivas?: number;
  },
  cajaActual: vi.fn(),
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({ usuario: est.usuario, negocio: est.negocio }),
}));
vi.mock("./api", () => ({ api: { cajaActual: () => est.cajaActual() } }));

import { useSedeDeCobro } from "./useSedeDeCobro";

beforeEach(() => {
  est.usuario = { sucursalId: null };
  est.negocio = { tipoNegocio: "RESTAURANTE", features: ["multi_almacen"], sucursalesActivas: 2 };
  est.cajaActual.mockReset();
});

describe("useSedeDeCobro", () => {
  it("la organización con 2+ locales cobra en la sede de su caja abierta", async () => {
    est.cajaActual.mockResolvedValue({ caja: { almacenId: 7 } });
    const { result } = renderHook(() => useSedeDeCobro());
    expect(result.current.listo).toBe(false);
    await waitFor(() => expect(result.current.listo).toBe(true));
    expect(result.current.sedeId).toBe(7);
  });

  it("sin caja abierta, o si la consulta falla, no hay sede (se pide el general)", async () => {
    est.cajaActual.mockRejectedValue(new Error("sin red"));
    const { result } = renderHook(() => useSedeDeCobro());
    await waitFor(() => expect(result.current.listo).toBe(true));
    expect(result.current.sedeId).toBeNull();
  });

  it("un solo local: listo de entrada, sin sede y sin llamar a nada", () => {
    est.negocio = { tipoNegocio: "RESTAURANTE", features: ["multi_almacen"], sucursalesActivas: 1 };
    const { result } = renderHook(() => useSedeDeCobro());
    expect(result.current).toEqual({ sedeId: null, listo: true });
    expect(est.cajaActual).not.toHaveBeenCalled();
  });

  it("quien es de un local no manda sede: el backend ya sabe la suya", () => {
    est.usuario = { sucursalId: 3 };
    const { result } = renderHook(() => useSedeDeCobro());
    expect(result.current).toEqual({ sedeId: null, listo: true });
    expect(est.cajaActual).not.toHaveBeenCalled();
  });

  it("sin multisucursal prendido (regla 4) es de un local aunque haya otros cargados", () => {
    est.negocio = { tipoNegocio: "RESTAURANTE", features: ["pos"], sucursalesActivas: 2 };
    const { result } = renderHook(() => useSedeDeCobro());
    expect(result.current).toEqual({ sedeId: null, listo: true });
    expect(est.cajaActual).not.toHaveBeenCalled();
  });
});
