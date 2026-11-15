import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NEGOCIO_KEY, USER_KEY } from "../api";
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
import { etiquetaReferenciaStock } from "./referencia";
import { cuerpoEncoladoDePedido, registrarPedidoOEncolar } from "./registro";
import type { PedidoPlataforma, PedidoPlataformaInput } from "./tipos";

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

describe("la bitácora de stock dice de qué pedido salió", () => {
  it("«Pedido Yango» / «Pedido PedidosYa» cuando el apunte trae la plataforma", () => {
    expect(etiquetaReferenciaStock({ referenciaTipo: "PEDIDO_PLATAFORMA", referenciaPlataforma: "YANGO" })).toBe("Pedido Yango");
    expect(etiquetaReferenciaStock({ referenciaTipo: "PEDIDO_PLATAFORMA", referenciaPlataforma: "PEDIDOS_YA" })).toBe(
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
