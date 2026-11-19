import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NEGOCIO_KEY, USER_KEY, api } from "../api";
import { almacenEnMemoria } from "../offline/almacen";
import {
  cargarCola,
  descartarPedido,
  encolar,
  hayPorSubir,
  hayRespuesta,
  pendientesDeHoy,
  porSubir,
  sincronizar,
  usarAlmacenCola,
  type CuerpoEncolado,
} from "../offline/cola";
import { fijarVentaSinInternet } from "../offline/modo";
import { manifiestoDelTurno, olvidarTurno, usarAlmacenTurno } from "../offline/turno";
import type { Venta } from "../../types";
import {
  plataformaPrendida,
  plataformasPrendidas,
  plataformasQueRegistra,
  plataformasQueVe,
  puedeAnularPedidos,
} from "./acceso";
import {
  clavePreciosPlataforma,
  guardarPrecios,
  leerPreciosGuardados,
  preciosConLoRecordado,
  usePreciosPlataforma,
} from "./precios";
import { etiquetaReferenciaStock } from "./referencia";
import { cuerpoEncoladoDePedido, registrarPedidoOEncolar } from "./registro";
import type { PedidoPlataforma, PedidoPlataformaInput, PrecioDePlataforma } from "./tipos";

/**
 * Pedidos de Yango y PedidosYa en el equipo (PLAN-PEDIDOS-PLATAFORMA §5): quién
 * ve los botones, cómo se registra con y sin señal y cómo viaja por la cola
 * junto con las ventas sin mezclarse con ellas.
 */

function sesion(negocio = 7, usuario = 3) {
  localStorage.setItem(USER_KEY, JSON.stringify({ id: usuario, username: "caja" }));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify({ id: negocio, nombre: "Pollos" }));
}
const sinRed = () => new ApiError("Sin internet. Revisá la conexión del local.", 0);

const pedidoDelServidor = { id: 12, plataforma: "YANGO", total: 70 } as PedidoPlataforma;

function cuerpo(extra: Partial<PedidoPlataformaInput> = {}): PedidoPlataformaInput {
  return {
    clienteRequestId: `req-${Math.random().toString(36).slice(2)}`,
    plataforma: "YANGO",
    detalles: [
      { productoId: 5, cantidad: 2 },
      { productoId: 6, cantidad: 1 },
    ],
    ...extra,
  };
}
const precios = new Map([
  [5, 35],
  [6, 10],
]);

beforeEach(() => {
  usarAlmacenCola(almacenEnMemoria());
  usarAlmacenTurno(almacenEnMemoria());
  sesion();
  hayRespuesta();
});

afterEach(() => {
  fijarVentaSinInternet(null);
  localStorage.clear();
});

describe("quién ve los botones y el reporte (features estrictas + permisos)", () => {
  const permisos = ["plataformas.registrar", "plataformas.ver", "plataformas.anular"];

  it("la feature no falla abierta: con la lista vacía no hay plataformas", () => {
    expect(plataformasPrendidas([])).toEqual([]);
    expect(plataformasPrendidas(undefined)).toEqual([]);
    expect(plataformaPrendida(["pos"], "YANGO")).toBe(false);
  });

  it("una por una, en el orden de siempre", () => {
    expect(plataformasPrendidas(["pedidos_pedidosya"])).toEqual(["PEDIDOS_YA"]);
    expect(plataformasPrendidas(["pedidos_pedidosya", "pedidos_yango"])).toEqual(["YANGO", "PEDIDOS_YA"]);
  });

  it("registrar pide el permiso además de la feature", () => {
    const features = ["pedidos_yango", "pedidos_pedidosya"];
    expect(plataformasQueRegistra(features, { permisos: ["plataformas.registrar"] })).toEqual(["YANGO", "PEDIDOS_YA"]);
    expect(plataformasQueRegistra(features, { permisos: ["plataformas.ver"] })).toEqual([]);
    expect(plataformasQueRegistra([], { permisos: permisos })).toEqual([]);
  });

  it("ver el reporte y anular piden sus propios permisos", () => {
    expect(plataformasQueVe(["pedidos_yango"], { permisos: ["plataformas.ver"] })).toEqual(["YANGO"]);
    expect(plataformasQueVe(["pedidos_yango"], { permisos: ["plataformas.registrar"] })).toEqual([]);
    expect(puedeAnularPedidos({ permisos: ["plataformas.anular"] })).toBe(true);
    expect(puedeAnularPedidos({ permisos: ["plataformas.ver"] })).toBe(false);
    expect(puedeAnularPedidos(null)).toBe(false);
  });
});

describe("registrar un pedido: con señal, sin señal y en la web normal", () => {
  it("en la web normal es el POST de siempre, y un corte es un error que se ve", async () => {
    fijarVentaSinInternet(false);
    const enviar = vi.fn().mockRejectedValue(sinRed());
    await expect(registrarPedidoOEncolar(cuerpo(), enviar, precios)).rejects.toThrow("Sin internet");
    expect(await cargarCola()).toHaveLength(0);
    expect(hayPorSubir()).toBe(false);
  });

  it("en la app instalada con señal va al servidor, sin precio (lo pone el servidor)", async () => {
    fijarVentaSinInternet(true);
    const enviar = vi.fn().mockResolvedValue(pedidoDelServidor);
    const c = cuerpo();
    const r = await registrarPedidoOEncolar(c, enviar, precios);
    expect(r).toEqual({ pedido: pedidoDelServidor, encolado: false });
    expect(enviar).toHaveBeenCalledWith(c);
    expect(enviar.mock.calls[0][0].detalles[0]).not.toHaveProperty("precio");
    expect(hayPorSubir()).toBe(false);
  });

  it("sin red se encola con el MISMO clienteRequestId, la hora del equipo, `encolado` y los precios que vio el cajero", async () => {
    fijarVentaSinInternet(true);
    const c = cuerpo({ codigoExterno: "A-123" });
    const r = await registrarPedidoOEncolar(c, vi.fn().mockRejectedValue(sinRed()), precios);
    expect(r).toEqual({ pedido: null, encolado: true });
    expect(hayPorSubir()).toBe(true);
    // La lista de VENTAS no se entera: no es una venta (cupo, cierre, historial).
    expect(await cargarCola()).toHaveLength(0);
    expect(pendientesDeHoy([])).toBe(0);
    const rec = await leerEncolados();
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({
      tipo: "PEDIDO_PLATAFORMA",
      id: c.clienteRequestId,
      estado: "PENDIENTE",
      resumen: { plataforma: "YANGO", total: 80, lineas: 2 },
    });
    expect(rec[0].cuerpo).toMatchObject({
      clienteRequestId: c.clienteRequestId,
      codigoExterno: "A-123",
      encolado: true,
      detalles: [
        { productoId: 5, cantidad: 2, precio: 35 },
        { productoId: 6, cantidad: 1, precio: 10 },
      ],
    });
    expect(new Date(rec[0].cuerpo.fechaCliente).getTime()).not.toBeNaN();
  });

  it("la caja abierta viaja en vivo y también queda en la cola (§10.1)", async () => {
    const vivo = vi.fn().mockResolvedValue(pedidoDelServidor);
    fijarVentaSinInternet(true);
    await registrarPedidoOEncolar(cuerpo({ cajaId: 41 }), vivo, precios);
    expect(vivo.mock.calls[0][0]).toMatchObject({ cajaId: 41 });

    const c = cuerpo({ cajaId: 41 });
    await registrarPedidoOEncolar(c, vi.fn().mockRejectedValue(sinRed()), precios);
    const rec = await leerEncolados();
    expect(rec[0].cuerpo.cajaId).toBe(41);
  });

  it("después de un corte, el siguiente pedido va directo a la cola (3 min)", async () => {
    fijarVentaSinInternet(true);
    const enviar = vi.fn().mockRejectedValue(sinRed());
    await registrarPedidoOEncolar(cuerpo(), enviar, precios);
    await registrarPedidoOEncolar(cuerpo(), enviar, precios);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await leerEncolados()).toHaveLength(2);
  });

  it("un 4xx del servidor (feature apagada, producto ajeno) NO se encola: el cajero lo ve ahora", async () => {
    fijarVentaSinInternet(true);
    for (const e of [
      new ApiError("Los pedidos de Yango no están activados", 403),
      new ApiError("El producto no existe", 404),
      new ApiError("Datos inválidos", 400),
      new ApiError("Error", 500),
    ]) {
      await expect(registrarPedidoOEncolar(cuerpo(), vi.fn().mockRejectedValue(e), precios)).rejects.toBe(e);
    }
    expect(hayPorSubir()).toBe(false);
  });

  it("reintentar el mismo pedido sin señal no lo encola dos veces", async () => {
    fijarVentaSinInternet(true);
    const c = cuerpo();
    await registrarPedidoOEncolar(c, vi.fn().mockRejectedValue(sinRed()), precios);
    await registrarPedidoOEncolar(c, vi.fn(), precios);
    expect(await leerEncolados()).toHaveLength(1);
  });

  it("sin red, la cola guarda el precio de la app, el descuento, la nota y «recordar», y lista el total del diálogo (19-nov)", async () => {
    fijarVentaSinInternet(true);
    const c = cuerpo({
      plataforma: "PEDIDOS_YA",
      descuento: 1,
      observaciones: "sin ají",
      recordarPrecios: true,
      detalles: [
        { productoId: 5, cantidad: 2, precioApp: 40 },
        { productoId: 6, cantidad: 1, precioApp: 12 },
      ],
    });
    // (40 × 2 + 12) − 1: lo que el cajero vio en el diálogo, no los precios del local (80).
    await registrarPedidoOEncolar(c, vi.fn().mockRejectedValue(sinRed()), precios, 91);
    const [rec] = await leerEncolados();
    expect(rec.resumen).toEqual({ plataforma: "PEDIDOS_YA", total: 91, lineas: 2 });
    expect(rec.cuerpo).toMatchObject({
      descuento: 1,
      observaciones: "sin ají",
      recordarPrecios: true,
      encolado: true,
      // `precio` sigue siendo el del local, como siempre en la cola; el de la app va aparte.
      detalles: [
        { productoId: 5, cantidad: 2, precio: 35, precioApp: 40 },
        { productoId: 6, cantidad: 1, precio: 10, precioApp: 12 },
      ],
    });
  });

  it("un precio ya puesto en el cuerpo no se pisa con el del catálogo", () => {
    const c = cuerpoEncoladoDePedido(
      cuerpo({ detalles: [{ productoId: 5, cantidad: 1, precio: 30 }] }),
      precios,
      new Date("2026-11-15T18:20:00.000Z"),
    );
    expect(c.detalles).toEqual([{ productoId: 5, cantidad: 1, precio: 30 }]);
    expect(c.fechaCliente).toBe("2026-11-15T18:20:00.000Z");
  });
});

describe("la cola con pedidos de plataforma junto a las ventas", () => {
  const venta = (id: string, fecha: string): CuerpoEncolado => ({
    clienteRequestId: id,
    detalles: [{ productoId: 1, cantidad: 1, precio: 80 }],
    pagos: [{ formaPagoId: 1, monto: 80 }],
    tipoPedido: "LOCAL",
    fechaCliente: fecha,
    encolada: true,
  });
  const recibo = { total: 80 } as Venta;

  async function pedidoEncolado(id: string, fecha: string) {
    const { encolarPedidoPlataforma } = await import("../offline/cola");
    await encolarPedidoPlataforma(
      { ...cuerpo({ clienteRequestId: id }), fechaCliente: fecha, encolado: true },
      70,
    );
  }

  it("sube todo en el orden en que se tomó, cada cosa por su camino", async () => {
    await encolar(venta("v2", "2026-11-15T15:05:00.000Z"), recibo);
    await pedidoEncolado("p1", "2026-11-15T15:00:00.000Z");
    await encolar(venta("v1", "2026-11-15T14:00:00.000Z"), recibo);
    const orden: string[] = [];
    const r = await sincronizar(
      async (c) => {
        orden.push(`venta:${c.clienteRequestId}`);
        return { id: 1 } as Venta;
      },
      undefined,
      async (c) => {
        orden.push(`pedido:${c.clienteRequestId}`);
        return pedidoDelServidor;
      },
    );
    expect(orden).toEqual(["venta:v1", "pedido:p1", "venta:v2"]);
    expect(r).toEqual({ subidas: 3, rechazadas: 0, quedan: 0 });
    expect(hayPorSubir()).toBe(false);
  });

  it("sube el pedido con `encolado` y el mismo clienteRequestId (un reintento no duplica)", async () => {
    await pedidoEncolado("p1", "2026-11-15T15:00:00.000Z");
    const enviarPedido = vi.fn().mockResolvedValue(pedidoDelServidor);
    await sincronizar(vi.fn(), undefined, enviarPedido);
    expect(enviarPedido).toHaveBeenCalledWith(
      expect.objectContaining({ clienteRequestId: "p1", encolado: true, plataforma: "YANGO" }),
    );
  });

  it("quien sólo sincroniza ventas no toca los pedidos", async () => {
    await pedidoEncolado("p1", "2026-11-15T15:00:00.000Z");
    const r = await sincronizar(vi.fn());
    expect(r).toEqual({ subidas: 0, rechazadas: 0, quedan: 1 });
    expect(await leerEncolados()).toHaveLength(1);
  });

  it("un 4xx definitivo lo marca RECHAZADO (con el mensaje) y se puede sacar de la lista; la venta de al lado sigue", async () => {
    await pedidoEncolado("p1", "2026-11-15T15:00:00.000Z");
    await encolar(venta("v1", "2026-11-15T15:10:00.000Z"), recibo);
    const r = await sincronizar(
      vi.fn().mockResolvedValue({ id: 1 } as Venta),
      undefined,
      vi.fn().mockRejectedValue(new ApiError("El producto no existe", 404)),
    );
    expect(r).toEqual({ subidas: 1, rechazadas: 1, quedan: 0 });
    const [p] = await leerEncolados();
    expect(p).toMatchObject({ estado: "RECHAZADA", ultimoError: "El producto no existe", intentos: 1 });
    expect(porSubir([p])).toHaveLength(0);
    // Sólo las rechazadas se sacan.
    await descartarPedido("no-existe");
    expect(await leerEncolados()).toHaveLength(1);
    await descartarPedido("p1");
    expect(await leerEncolados()).toHaveLength(0);
  });

  it("sin red o con un 5xx queda para después y se corta la vuelta", async () => {
    await pedidoEncolado("p1", "2026-11-15T15:00:00.000Z");
    await encolar(venta("v1", "2026-11-15T15:10:00.000Z"), recibo);
    const enviarVenta = vi.fn();
    const r = await sincronizar(enviarVenta, undefined, vi.fn().mockRejectedValue(sinRed()));
    expect(r).toEqual({ subidas: 0, rechazadas: 0, quedan: 2 });
    expect(enviarVenta).not.toHaveBeenCalled();
    expect((await leerEncolados())[0].estado).toBe("ERROR");
  });

  it("un pedido rechazado no toca el manifiesto del turno (no es una venta)", async () => {
    sesion();
    await pedidoEncolado("p1", "2026-11-15T15:00:00.000Z");
    await sincronizar(vi.fn(), undefined, vi.fn().mockRejectedValue(new ApiError("No", 400)));
    expect(await manifiestoDelTurno(1)).toBeNull();
    await olvidarTurno(1);
  });

  it("la cola es de quien tomó el pedido: otro usuario del equipo no lo ve ni lo sube", async () => {
    await pedidoEncolado("p1", "2026-11-15T15:00:00.000Z");
    sesion(7, 99);
    const enviarPedido = vi.fn();
    await sincronizar(vi.fn(), undefined, enviarPedido);
    expect(enviarPedido).not.toHaveBeenCalled();
    expect(hayPorSubir()).toBe(false);
  });
});

describe("el precio de cada producto en la app: la copia de este equipo (19-nov)", () => {
  const PY = (productoId: number, precio: number): PrecioDePlataforma => ({ productoId, plataforma: "PEDIDOS_YA", precio });

  it("la copia es por negocio: otro negocio no la ve", () => {
    guardarPrecios(7, [PY(12, 21)]);
    expect(leerPreciosGuardados(7)).toEqual([PY(12, 21)]);
    expect(leerPreciosGuardados(8)).toEqual([]);
    expect(localStorage.getItem(clavePreciosPlataforma(7))).toBe(JSON.stringify([PY(12, 21)]));
  });

  it("una copia rota o sin almacenamiento no rompe nada: vale el precio del local", () => {
    localStorage.setItem(clavePreciosPlataforma(7), "{no es json");
    expect(leerPreciosGuardados(7)).toEqual([]);
    localStorage.setItem(
      clavePreciosPlataforma(7),
      JSON.stringify([PY(12, 21), { productoId: 13, plataforma: "OTRA", precio: 5 }, { productoId: 14, plataforma: "YANGO", precio: "x" }]),
    );
    expect(leerPreciosGuardados(7)).toEqual([PY(12, 21)]);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("privado");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("lleno");
    });
    expect(leerPreciosGuardados(7)).toEqual([]);
    expect(() => guardarPrecios(7, [PY(12, 22)])).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("recordar, con la regla del backend: distinto del local pisa, igual al local borra, vale el último y la otra app no se toca", () => {
    const antes = [PY(12, 21), PY(13, 25), { productoId: 12, plataforma: "YANGO", precio: 19 } as PrecioDePlataforma];
    const despues = preciosConLoRecordado(antes, "PEDIDOS_YA", [
      { productoId: 12, precioApp: 22, precioLocal: 18 },
      { productoId: 13, precioApp: 18, precioLocal: 18 },
      { productoId: 14, precioApp: 30, precioLocal: 20 },
      { productoId: 14, precioApp: 31, precioLocal: 20 },
    ]);
    expect(despues).toEqual(expect.arrayContaining([PY(12, 22), PY(14, 31), { productoId: 12, plataforma: "YANGO", precio: 19 }]));
    expect(despues).toHaveLength(3);
  });

  describe("el hook del POS", () => {
    afterEach(() => vi.restoreAllMocks());

    it("pide los precios al entrar, los usa y guarda la copia", async () => {
      vi.spyOn(api, "preciosPlataforma").mockResolvedValue({ precios: [PY(12, 21)] });
      const { result } = renderHook(() => usePreciosPlataforma(7, true));
      await act(async () => {});
      expect(result.current.de("PEDIDOS_YA", 12)).toBe(21);
      expect(result.current.de("YANGO", 12)).toBeUndefined();
      expect(leerPreciosGuardados(7)).toEqual([PY(12, 21)]);
    });

    it("si el pedido falla (backend viejo, sin señal) usa la copia; sin copia, el precio del local", async () => {
      const pedir = vi.spyOn(api, "preciosPlataforma").mockRejectedValue(new ApiError("Not Found", 404));
      guardarPrecios(7, [PY(12, 21)]);
      const conCopia = renderHook(() => usePreciosPlataforma(7, true));
      await act(async () => {});
      expect(conCopia.result.current.de("PEDIDOS_YA", 12)).toBe(21);
      pedir.mockRejectedValue(sinRed());
      const sinCopia = renderHook(() => usePreciosPlataforma(8, true));
      await act(async () => {});
      // `undefined` = el diálogo arranca con el precio del local.
      expect(sinCopia.result.current.de("PEDIDOS_YA", 12)).toBeUndefined();
    });

    it("sin plataformas no pide nada, y «recordar» cambia la copia en el momento", async () => {
      const pedir = vi.spyOn(api, "preciosPlataforma");
      const { result } = renderHook(() => usePreciosPlataforma(7, false));
      await act(async () => {});
      expect(pedir).not.toHaveBeenCalled();
      act(() => result.current.recordar("PEDIDOS_YA", [{ productoId: 12, precioApp: 21, precioLocal: 18 }]));
      expect(result.current.de("PEDIDOS_YA", 12)).toBe(21);
      expect(leerPreciosGuardados(7)).toEqual([PY(12, 21)]);
    });

    it("refrescar() vuelve a pedirlos y pisa la copia; si falla no pasa nada; con uno en vuelo no sale otro", async () => {
      const pedir = vi.spyOn(api, "preciosPlataforma").mockResolvedValue({ precios: [PY(12, 21)] });
      const { result } = renderHook(() => usePreciosPlataforma(7, true));
      await act(async () => {});
      expect(pedir).toHaveBeenCalledTimes(1);
      // Otro equipo aprendió 23 a media mañana.
      pedir.mockResolvedValue({ precios: [PY(12, 23)] });
      await act(async () => {
        await result.current.refrescar();
      });
      expect(result.current.de("PEDIDOS_YA", 12)).toBe(23);
      expect(leerPreciosGuardados(7)).toEqual([PY(12, 23)]);
      // Sin señal: queda lo que había, sin romper nada.
      pedir.mockRejectedValue(sinRed());
      await act(async () => {
        await result.current.refrescar();
      });
      expect(result.current.de("PEDIDOS_YA", 12)).toBe(23);
      expect(leerPreciosGuardados(7)).toEqual([PY(12, 23)]);
      // Dos aperturas seguidas del diálogo: un solo pedido al servidor.
      pedir.mockClear();
      pedir.mockResolvedValue({ precios: [PY(12, 24)] });
      await act(async () => {
        await Promise.all([result.current.refrescar(), result.current.refrescar()]);
      });
      expect(pedir).toHaveBeenCalledTimes(1);
      expect(result.current.de("PEDIDOS_YA", 12)).toBe(24);
    });

    it("una respuesta que salió antes de un «Recordar» no pisa el precio recién aprendido", async () => {
      const pedir = vi.spyOn(api, "preciosPlataforma").mockResolvedValue({ precios: [] });
      const { result } = renderHook(() => usePreciosPlataforma(7, true));
      await act(async () => {});
      let responder: ((r: { precios: PrecioDePlataforma[] }) => void) | undefined;
      pedir.mockImplementation(
        () =>
          new Promise((ok) => {
            responder = ok;
          }),
      );
      let enCamino!: Promise<void>;
      await act(async () => {
        enCamino = result.current.refrescar();
        await Promise.resolve();
      });
      expect(responder).toBeDefined();
      act(() => result.current.recordar("PEDIDOS_YA", [{ productoId: 12, precioApp: 22, precioLocal: 18 }]));
      await act(async () => {
        responder!({ precios: [] });
        await enCamino;
      });
      expect(result.current.de("PEDIDOS_YA", 12)).toBe(22);
      expect(leerPreciosGuardados(7)).toEqual([PY(12, 22)]);
    });

    it("lo que espera en la cola con «Recordar» se vuelve a aplicar encima de lo que manda el servidor", async () => {
      fijarVentaSinInternet(true);
      // Tomado sin señal con «Recordar»: el 5 a 40 en la app (35 en el local) y el 6 igual al local.
      await registrarPedidoOEncolar(
        cuerpo({
          plataforma: "PEDIDOS_YA",
          recordarPrecios: true,
          detalles: [
            { productoId: 5, cantidad: 1, precioApp: 40 },
            { productoId: 6, cantidad: 1, precioApp: 10 },
          ],
        }),
        vi.fn().mockRejectedValue(sinRed()),
        precios,
        50,
      );
      // Uno sin «Recordar» no cuenta.
      await registrarPedidoOEncolar(
        cuerpo({ plataforma: "PEDIDOS_YA", detalles: [{ productoId: 7, cantidad: 1, precioApp: 99 }] }),
        vi.fn(),
        precios,
        99,
      );
      // El servidor todavía no conoce el pedido de la cola.
      vi.spyOn(api, "preciosPlataforma").mockResolvedValue({ precios: [PY(6, 12), PY(7, 50)] });
      const { result } = renderHook(() => usePreciosPlataforma(7, true));
      await act(async () => {});
      expect(result.current.de("PEDIDOS_YA", 5)).toBe(40);
      // Igual al local: vuelve a seguir al local, como lo va a dejar el servidor al subirlo.
      expect(result.current.de("PEDIDOS_YA", 6)).toBeUndefined();
      expect(result.current.de("PEDIDOS_YA", 7)).toBe(50);
      expect(leerPreciosGuardados(7)).toEqual(expect.arrayContaining([PY(5, 40), PY(7, 50)]));
      expect(leerPreciosGuardados(7)).toHaveLength(2);
    });
  });
});

describe("la bitácora de stock dice de qué pedido salió", () => {
  it("«Pedido Yango» / «Pedido PedidosYa» cuando el apunte trae la plataforma", () => {
    expect(etiquetaReferenciaStock({ referenciaTipo: "PEDIDO_PLATAFORMA", plataforma: "YANGO" })).toBe("Pedido Yango");
    expect(etiquetaReferenciaStock({ referenciaTipo: "PEDIDO_PLATAFORMA", plataforma: "PEDIDOS_YA" })).toBe(
      "Pedido PedidosYa",
    );
  });

  it("sin la plataforma no inventa una: «Pedido de plataforma»", () => {
    expect(etiquetaReferenciaStock({ referenciaTipo: "PEDIDO_PLATAFORMA" })).toBe("Pedido de plataforma");
  });

  it("una venta común o un movimiento a mano no llevan etiqueta", () => {
    expect(etiquetaReferenciaStock({ referenciaTipo: "VENTA" })).toBeNull();
    expect(etiquetaReferenciaStock({ referenciaTipo: null })).toBeNull();
  });
});

/** Los pedidos de la cola de esta sesión, leídos del almacén. */
async function leerEncolados() {
  const { usePedidosEncolados } = await import("../offline/cola");
  // `usePedidosEncolados` es un hook: se lee el mismo estado por la vía de los
  // tests, renderizándolo.
  const { renderHook } = await import("@testing-library/react");
  await cargarCola();
  const { result } = renderHook(() => usePedidosEncolados());
  return result.current;
}

describe("la sección del reporte en Permisos (puedeVer)", () => {
  const ctx = (features: string[], permisos: string[]) => ({ rubro: "RESTAURANTE", features, permisos });

  it("pide plataformas.ver y alguna de las dos features, sin fallar abierta", async () => {
    const { puedeVer, veReportes } = await import("../permisos");
    expect(puedeVer(ctx(["pedidos_yango"], ["plataformas.ver"]), "pedidos_plataforma")).toBe(true);
    expect(puedeVer(ctx(["pedidos_pedidosya"], ["plataformas.ver"]), "pedidos_plataforma")).toBe(true);
    // Lista vacía: las demás features fallan abiertas, ésta no.
    expect(puedeVer(ctx([], ["plataformas.ver"]), "pedidos_plataforma")).toBe(false);
    expect(puedeVer(ctx(["pos", "reportes"], ["plataformas.ver"]), "pedidos_plataforma")).toBe(false);
    // Con la feature pero sin el permiso del rol tampoco.
    expect(puedeVer(ctx(["pedidos_yango"], ["plataformas.registrar"]), "pedidos_plataforma")).toBe(false);
    // Quien sólo tiene este reporte igual entra a Reportes.
    expect(veReportes((s) => puedeVer(ctx(["pedidos_yango"], ["plataformas.ver"]), s))).toBe(true);
  });
});

describe("los permisos de fábrica de cada rol (PLAN-PEDIDOS-PLATAFORMA §3)", () => {
  it("registrar: ADMIN, SUPERVISOR y CAJERO; ver y anular: sólo ADMIN y SUPERVISOR", async () => {
    const { permisosDe } = await import("../../test/sesiones");
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO"] as const) {
      expect(permisosDe(rol).permisos, rol).toContain("plataformas.registrar");
    }
    for (const rol of ["ADMIN", "SUPERVISOR"] as const) {
      expect(permisosDe(rol).permisos, rol).toEqual(expect.arrayContaining(["plataformas.ver", "plataformas.anular"]));
    }
    expect(permisosDe("CAJERO").permisos).not.toContain("plataformas.ver");
    expect(permisosDe("CAJERO").permisos).not.toContain("plataformas.anular");
    expect(permisosDe("MESERO").permisos).not.toContain("plataformas.registrar");
  });

  it("atados a cualquiera de las dos features: el plan sin ninguna no los manda", async () => {
    const { permisosDe } = await import("../../test/sesiones");
    expect(permisosDe("CAJERO", { features: ["pos", "pedidos_pedidosya"] }).permisos).toContain("plataformas.registrar");
    expect(permisosDe("CAJERO", { features: ["pos", "pedidos_yango"] }).permisos).toContain("plataformas.registrar");
    expect(permisosDe("CAJERO", { features: ["pos"] }).permisos).not.toContain("plataformas.registrar");
  });
});
