import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/promociones/apiPromociones", () => ({
  apiPromociones: { cotizar: vi.fn() },
}));

import { apiPromociones } from "../../lib/promociones/apiPromociones";
import { useDescuentos } from "./useDescuentos";

const cotizar = vi.mocked(apiPromociones.cotizar);
const detalles = [{ productoId: 1, cantidad: 2, precio: 50, consumo: "LLEVAR" as const }];

describe("useDescuentos (POS)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cotizar.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("apagado: no pregunta nada y la venta sale sin campos nuevos", async () => {
    const { result } = renderHook(() =>
      useDescuentos({ activo: false, conCupones: false, detalles }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(cotizar).not.toHaveBeenCalled();
    expect(result.current.total(100)).toBe(100);
    expect(result.current.extraVenta()).toEqual({});
  });

  it("prendido: cobra el neto y manda lo que vio, sin los cupones descartados", async () => {
    cotizar.mockResolvedValue({
      subtotal: 100,
      descuentoTotal: 15,
      total: 85,
      aplicadas: [
        {
          promocionId: 9,
          version: 1,
          nombre: "Bs 15",
          origen: "CUPON",
          codigo: "VERANO15",
          alcance: "TICKET",
          monto: 15,
        },
      ],
      descartadas: [{ promocionId: null, nombre: null, codigo: "VIEJO", motivo: "Ese cupón ya venció" }],
      descuentosEsperados: [{ promocionId: 9, monto: 15 }],
    });
    const { result } = renderHook(() =>
      useDescuentos({ activo: true, conCupones: true, detalles, almacenId: 3 }),
    );
    act(() => {
      result.current.agregarCupon("verano 15");
      result.current.agregarCupon("viejo");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(cotizar).toHaveBeenLastCalledWith({
      detalles: [{ productoId: 1, cantidad: 2 }],
      almacenId: 3,
      cupones: ["VERANO15", "VIEJO"],
    });
    expect(result.current.vigente).toBe(true);
    expect(result.current.total(100)).toBe(85);
    expect(result.current.extraVenta()).toEqual({
      descuentosEsperados: [{ promocionId: 9, monto: 15 }],
      cupones: ["VERANO15"],
    });
  });

  it("si la cotización falla, la venta sale como siempre (sin descuento)", async () => {
    cotizar.mockRejectedValue(new Error("Sin internet"));
    const { result } = renderHook(() =>
      useDescuentos({ activo: true, conCupones: false, detalles }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.error).toBe("Sin internet");
    expect(result.current.total(100)).toBe(100);
    expect(result.current.extraVenta()).toEqual({});
  });
});
