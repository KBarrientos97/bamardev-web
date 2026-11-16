import { describe, expect, it } from "vitest";
import type { PedidoPlataformaEncolado } from "../../lib/offline/cola";
import type { PedidoPlataforma } from "../../lib/pedidosPlataforma/tipos";
import type { Venta } from "../../types";
import { mezclarPorHora, pendientesDelTurno, resumenDePedidos, textoResumenPedidos } from "./mezclaDelTurno";

const venta = (id: number, fecha: string) => ({ id, fecha }) as unknown as Venta;
const pedido = (id: number, fecha: string, extra: Partial<PedidoPlataforma> = {}) =>
  ({ id, clienteRequestId: `r${id}`, plataforma: "YANGO", total: 40, fecha, anuladoEn: null, ...extra }) as PedidoPlataforma;
const money = (n: number) => `Bs ${n}`;

describe("«Ventas del turno»: los pedidos mezclados con las ventas", () => {
  it("quedan por hora, del más nuevo al más viejo, sin reordenar las ventas", () => {
    const ventas = [venta(3, "2026-11-16T15:00:00Z"), venta(2, "2026-11-16T13:00:00Z"), venta(1, "2026-11-16T12:00:00Z")];
    const pedidos = [pedido(20, "2026-11-16T12:30:00Z"), pedido(21, "2026-11-16T16:00:00Z"), pedido(22, "2026-11-16T11:00:00Z")];
    const filas = mezclarPorHora(ventas, pedidos).map((f) => (f.tipo === "venta" ? `v${f.venta.id}` : `p${f.pedido.id}`));
    expect(filas).toEqual(["p21", "v3", "v2", "p20", "v1", "p22"]);
  });

  it("sin pedidos devuelve las ventas tal cual; sin ventas, sólo los pedidos", () => {
    expect(mezclarPorHora([venta(1, "2026-11-16T12:00:00Z")], []).map((f) => f.tipo)).toEqual(["venta"]);
    expect(mezclarPorHora([], [pedido(1, "2026-11-16T12:00:00Z")]).map((f) => f.tipo)).toEqual(["pedido"]);
  });
});

describe("la línea de resumen de pedidos (aparte, sin sumar a las ventas)", () => {
  it("cuenta por plataforma y NO cuenta los anulados", () => {
    const r = resumenDePedidos([
      pedido(1, "x", { total: 40 }),
      pedido(2, "x", { total: 80 }),
      pedido(3, "x", { total: 99, anuladoEn: "2026-11-16T12:00:00Z" }),
      pedido(4, "x", { plataforma: "PEDIDOS_YA", total: 40 }),
    ]);
    expect(r).toEqual([
      { plataforma: "YANGO", cantidad: 2, total: 120 },
      { plataforma: "PEDIDOS_YA", cantidad: 1, total: 40 },
    ]);
    expect(textoResumenPedidos(r, money)).toBe("Yango: 2 pedidos · Bs 120 · PedidosYa: 1 pedido · Bs 40");
  });

  it("sin pedidos vivos no hay línea", () => {
    expect(textoResumenPedidos(resumenDePedidos([pedido(1, "x", { anuladoEn: "y" })]), money)).toBeNull();
    expect(textoResumenPedidos(resumenDePedidos([]), money)).toBeNull();
  });
});

describe("los pedidos de la cola que van a este turno", () => {
  const enCola = (id: string, cajaId: number | undefined, estado: "PENDIENTE" | "RECHAZADA" = "PENDIENTE") =>
    ({ id, estado, cuerpo: { cajaId } }) as unknown as PedidoPlataformaEncolado;

  it("los de esta caja y los sin caja anotada; no los de otra, ni los rechazados", () => {
    const cola = [enCola("a", 5), enCola("b", 9), enCola("c", undefined), enCola("d", 5, "RECHAZADA")];
    expect(pendientesDelTurno(cola, 5, []).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("uno que ya subió y está en la lista del servidor no se cuenta dos veces", () => {
    const cola = [enCola("r1", 5), enCola("zz", 5)];
    expect(pendientesDelTurno(cola, 5, [pedido(1, "x")]).map((p) => p.id)).toEqual(["zz"]);
  });
});
