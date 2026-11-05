import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/promociones/apiPromociones", () => ({
  apiPromociones: { cotizar: vi.fn() },
}));

import { apiPromociones } from "../../lib/promociones/apiPromociones";
import type { DetalleVentaInput } from "../../types";
import { olvidarLocalesSinDescuentos, useDescuentos } from "./useDescuentos";

const cotizar = vi.mocked(apiPromociones.cotizar);
const detalles = [{ productoId: 1, cantidad: 2, precio: 50, consumo: "LLEVAR" as const }];
const sinNada = {
  subtotal: 100,
  descuentoTotal: 0,
  total: 100,
  aplicadas: [],
  descartadas: [],
  descuentosEsperados: [],
};

describe("useDescuentos (POS)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cotizar.mockReset();
    olvidarLocalesSinDescuentos();
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

  it("QA PER-12: cobrando una cita, la cotización lleva la cita", async () => {
    cotizar.mockResolvedValue({
      subtotal: 100,
      descuentoTotal: 0,
      total: 100,
      aplicadas: [],
      descartadas: [],
      descuentosEsperados: [],
    });
    renderHook(() => useDescuentos({ activo: true, conCupones: false, detalles, citaId: 13 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(cotizar).toHaveBeenLastCalledWith({
      detalles: [{ productoId: 1, cantidad: 2 }],
      citaId: 13,
    });
  });

  describe("en un local sin descuentos el carrito no espera", () => {
    // Kevin, 3-nov: con cada plato salía "Calculando descuentos…" y "Cobrar"
    // se apagaba, en un negocio sin una sola promoción.
    const otros: DetalleVentaInput[] = [...detalles, { productoId: 2, cantidad: 1, precio: 15, consumo: "MESA" }];

    async function aprendido() {
      cotizar.mockResolvedValue(sinNada);
      const hook = renderHook(
        (p: { detalles: DetalleVentaInput[] }) =>
          useDescuentos({ activo: true, conCupones: true, detalles: p.detalles, almacenId: 3 }),
        { initialProps: { detalles } },
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      return hook;
    }

    it("el plato siguiente se cobra al toque y la venta pide confirmar que no hay descuento", async () => {
      const { result, rerender } = await aprendido();
      rerender({ detalles: otros });

      // Sin avanzar el reloj: la cotización de este carrito todavía no volvió.
      expect(result.current.cargando).toBe(false);
      expect(result.current.vigente).toBe(true);
      expect(result.current.total(115)).toBe(115);
      // Con `[]` el backend corre el motor y frena con 409 si apareció una promo.
      expect(result.current.extraVenta()).toEqual({ descuentosEsperados: [] });
    });

    it("la venta siguiente, ya vacía y con otro carrito, tampoco espera", async () => {
      const { result, rerender } = await aprendido();
      act(() => result.current.reiniciar());
      rerender({ detalles: otros });
      expect(result.current.cargando).toBe(false);
      expect(result.current.vigente).toBe(true);
    });

    it("si la cotización encuentra un descuento, vuelve a esperar", async () => {
      const { result, rerender } = await aprendido();
      cotizar.mockResolvedValue({
        ...sinNada,
        descuentoTotal: 10,
        total: 105,
        aplicadas: [
          { promocionId: 4, version: 1, nombre: "Combo", origen: "PROMOCION", codigo: null, alcance: "TICKET", monto: 10 },
        ],
        descuentosEsperados: [{ promocionId: 4, monto: 10 }],
      });
      rerender({ detalles: otros });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(result.current.total(115)).toBe(105);

      rerender({ detalles });
      expect(result.current.cargando).toBe(true);
      expect(result.current.vigente).toBe(false);
    });

    it("con un cupón escrito espera la cotización", async () => {
      const { result } = await aprendido();
      act(() => result.current.agregarCupon("VERANO"));
      expect(result.current.cargando).toBe(true);
      expect(result.current.vigente).toBe(false);
    });
  });
});
