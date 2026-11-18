import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoConteoSucursal, Venta } from "../../types";

/**
 * El saldo del conteo por categoría en el POS (vasos por tamaño, 18-nov): cómo
 * se pide, cuándo se vuelve a pedir y, sobre todo, cuándo NO (contrato §3.8):
 * mientras la cola sin señal tenga ventas sin subir, el servidor todavía no
 * las conoce y su número «devolvería» vasos ya vendidos.
 */

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(mensaje: string, status = 500) {
      super(mensaje);
      this.status = status;
    }
  },
  USER_KEY: "usuario",
  NEGOCIO_KEY: "negocio",
  api: { estadoConteo: vi.fn() },
}));

import { ApiError, api } from "../../lib/api";
import { almacenEnMemoria } from "../../lib/offline/almacen";
import { encolar, sincronizar, usarAlmacenCola, type CuerpoEncolado } from "../../lib/offline/cola";
import { claveConteo, leerCopia, usarAlmacenCopias } from "../../lib/offline/copias";
import { fijarVentaSinInternet } from "../../lib/offline/modo";
import { CONTEO_CADA_MS, useConteoPos } from "./useConteoPos";

const L = { id: 30, nombre: "L" };

/** Lo que responde `GET /conteo`: L con lo que quede y XL sin contar en este local. */
function estado(quedanL: number, sucursalId = 3): EstadoConteoSucursal {
  return {
    activo: true,
    nombre: "Vasos",
    sucursalId,
    items: [
      { categoriaId: L.id, nombre: "L", contado: 100, contadoEn: 0, repuesto: 0, vendido: 100 - quedanL, quedan: quedanL },
      { categoriaId: 40, nombre: "XL", contado: null, contadoEn: null, repuesto: 0, vendido: 0, quedan: null },
    ],
  };
}

/** Una línea del carrito: tantos «Nutella L». */
const nutellaL = (cantidad: number) => ({ producto: { id: 7, categoria: L }, cantidad });

/** Deja correr lo pendiente: el pedido, la copia, la cola. */
async function esperar() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** Una venta cobrada sin señal, esperando subir. */
async function encolarVenta(id = "venta-1") {
  await act(async () => {
    await encolar(
      {
        clienteRequestId: id,
        fechaCliente: new Date().toISOString(),
        encolada: true,
        tipoPedido: "LOCAL",
        detalles: [{ productoId: 7, cantidad: 2, precio: 35 }],
      } as unknown as CuerpoEncolado,
      { id: -1 } as Venta,
    );
  });
}

/** Volvió la señal y la cola subió todo. */
async function vaciarCola() {
  await act(async () => {
    await sincronizar(async () => ({ id: 1 }) as Venta);
  });
}

function ocultarPestana(oculta: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => oculta });
}

beforeEach(() => {
  vi.clearAllMocks();
  usarAlmacenCola(almacenEnMemoria());
  usarAlmacenCopias(almacenEnMemoria());
  localStorage.setItem("usuario", JSON.stringify({ id: 1, username: "caja" }));
  localStorage.setItem("negocio", JSON.stringify({ id: 1, nombre: "Prueba" }));
  // El navegador común: no guarda copias ni encola (cada test que lo necesite lo prende).
  fijarVentaSinInternet(false);
  vi.mocked(api.estadoConteo).mockResolvedValue(estado(40));
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, "hidden");
  fijarVentaSinInternet(null);
  localStorage.clear();
});

describe("useConteoPos: cuántos vasos quedan en el local de la caja", () => {
  it("apagado (conteo sin prender, la farmacia, sin caja) no pide nada: el POS de siempre", async () => {
    const { result } = renderHook(() => useConteoPos(3, false));
    await esperar();
    expect(api.estadoConteo).not.toHaveBeenCalled();
    expect(result.current.saldos.size).toBe(0);
  });

  it("prendido pide el de la sucursal de la caja: L con su saldo, XL sin contar", async () => {
    const { result } = renderHook(() => useConteoPos(3, true));
    await esperar();
    expect(api.estadoConteo).toHaveBeenCalledWith(3);
    expect([...result.current.saldos]).toEqual([
      [L.id, 40],
      [40, null],
    ]);
    expect(result.current.nombre).toBe("Vasos");
    expect(result.current.enCola).toBe(0);
  });

  it("vuelve a pedir cada 30 s y al volver a la pestaña; con la pestaña oculta, no", async () => {
    vi.useFakeTimers();
    renderHook(() => useConteoPos(3, true));
    await esperar();
    expect(api.estadoConteo).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONTEO_CADA_MS);
    });
    expect(api.estadoConteo).toHaveBeenCalledTimes(2);

    ocultarPestana(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONTEO_CADA_MS);
    });
    expect(api.estadoConteo).toHaveBeenCalledTimes(2);

    ocultarPestana(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await esperar();
    expect(api.estadoConteo).toHaveBeenCalledTimes(3);
  });

  it("recargar vuelve a pedir; si falla (sin internet), se queda con lo último sin molestar", async () => {
    const { result } = renderHook(() => useConteoPos(3, true));
    await esperar();
    vi.mocked(api.estadoConteo).mockRejectedValueOnce(new ApiError("Sin internet. Revisá la conexión del local.", 0));
    act(() => result.current.recargar());
    await esperar();
    expect(api.estadoConteo).toHaveBeenCalledTimes(2);
    expect(result.current.saldos.get(L.id)).toBe(40);

    vi.mocked(api.estadoConteo).mockResolvedValueOnce(estado(35));
    act(() => result.current.recargar());
    await esperar();
    expect(result.current.saldos.get(L.id)).toBe(35);
  });

  it("al cambiar de sucursal lo de la anterior deja de verse mientras llega lo nuevo", async () => {
    let sucursal = 3;
    const { result, rerender } = renderHook(() => useConteoPos(sucursal, true));
    await esperar();
    expect(result.current.saldos.get(L.id)).toBe(40);

    let soltar: (e: EstadoConteoSucursal) => void = () => {};
    vi.mocked(api.estadoConteo).mockImplementationOnce(
      () =>
        new Promise((ok) => {
          soltar = ok;
        }),
    );
    sucursal = 4;
    rerender();
    expect(result.current.saldos.size).toBe(0);
    await esperar();
    expect(api.estadoConteo).toHaveBeenLastCalledWith(4);
    expect(result.current.saldos.size).toBe(0);
    await act(async () => soltar(estado(12, 4)));
    await esperar();
    expect(result.current.saldos.get(L.id)).toBe(12);
  });

  it("descontar baja lo vendido del saldo en memoria (la venta que quedó en la cola)", async () => {
    const { result } = renderHook(() => useConteoPos(3, true));
    await esperar();
    act(() => result.current.descontar([nutellaL(3)]));
    expect(result.current.saldos.get(L.id)).toBe(37);
    // Lo sin contar no se toca.
    expect(result.current.saldos.get(40)).toBeNull();
  });

  it("en la app instalada, sin señal, sigue con el último saldo guardado", async () => {
    fijarVentaSinInternet(true);
    const primero = renderHook(() => useConteoPos(3, true));
    await esperar();
    primero.unmount();

    vi.mocked(api.estadoConteo).mockRejectedValue(new ApiError("Sin internet. Revisá la conexión del local.", 0));
    const segundo = renderHook(() => useConteoPos(3, true));
    await esperar();
    expect(segundo.result.current.saldos.get(L.id)).toBe(40);
  });
});

describe("§3.8: mientras la cola tenga algo sin subir, manda el saldo de acá", () => {
  it("con la cola pendiente el sondeo no pisa el saldo local; cuando se vacía, vuelve a pedir", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useConteoPos(3, true));
    await esperar();

    await encolarVenta();
    act(() => result.current.descontar([nutellaL(2)]));
    expect(result.current.enCola).toBe(1);
    expect(result.current.saldos.get(L.id)).toBe(38);

    // El servidor todavía no conoce esa venta: diría 40. Ni el sondeo ni recargar lo piden.
    vi.mocked(api.estadoConteo).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONTEO_CADA_MS * 2);
    });
    act(() => result.current.recargar());
    await esperar();
    expect(api.estadoConteo).not.toHaveBeenCalled();
    expect(result.current.saldos.get(L.id)).toBe(38);

    // Volvió la señal y la cola subió: ahora sí, el del servidor, que ya la
    // tiene (y lo que vendió otra caja mientras tanto).
    vi.mocked(api.estadoConteo).mockResolvedValue(estado(36));
    await vaciarCola();
    await esperar();
    expect(result.current.enCola).toBe(0);
    expect(api.estadoConteo).toHaveBeenCalledTimes(1);
    expect(result.current.saldos.get(L.id)).toBe(36);
  });

  it("una respuesta que salió antes de un descontar y llega después se descarta", async () => {
    const { result } = renderHook(() => useConteoPos(3, true));
    await esperar();

    let soltar: (e: EstadoConteoSucursal) => void = () => {};
    vi.mocked(api.estadoConteo).mockImplementationOnce(
      () =>
        new Promise((ok) => {
          soltar = ok;
        }),
    );
    act(() => result.current.recargar());
    await esperar();
    // Mientras viajaba, una venta se bajó acá.
    act(() => result.current.descontar([nutellaL(2)]));
    await act(async () => soltar(estado(40)));
    await esperar();
    expect(result.current.saldos.get(L.id)).toBe(38);

    // El pedido siguiente salió después: ése sí vale.
    vi.mocked(api.estadoConteo).mockResolvedValueOnce(estado(37));
    act(() => result.current.recargar());
    await esperar();
    expect(result.current.saldos.get(L.id)).toBe(37);
  });

  it("sin saldo en pantalla y con la cola pendiente (se volvió al POS), toma la copia con lo vendido ya bajado", async () => {
    fijarVentaSinInternet(true);
    const primero = renderHook(() => useConteoPos(3, true));
    await esperar();
    await encolarVenta();
    act(() => primero.result.current.descontar([nutellaL(5)]));
    await esperar();
    primero.unmount();
    expect((await leerCopia<EstadoConteoSucursal>(claveConteo(3)))?.items[0].quedan).toBe(35);

    vi.mocked(api.estadoConteo).mockClear();
    const segundo = renderHook(() => useConteoPos(3, true));
    await esperar();
    expect(api.estadoConteo).not.toHaveBeenCalled();
    expect(segundo.result.current.saldos.get(L.id)).toBe(35);
  });
});
