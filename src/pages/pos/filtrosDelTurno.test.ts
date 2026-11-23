import { describe, expect, it } from "vitest";
import type { PedidoPlataforma } from "../../lib/pedidosPlataforma/tipos";
import type { Venta } from "../../types";
import { filtroVigente, opcionesDeFiltro, pasaElFiltro, type FiltroDelTurno } from "./filtrosDelTurno";
import type { FilaDelTurno } from "./mezclaDelTurno";

const venta = (id: number, extra: Partial<Venta> = {}): FilaDelTurno => ({
  tipo: "venta",
  venta: { id, estado: "APROBADO", tipoPedido: "LOCAL", ...extra } as Venta,
});
const pedido = (id: number, extra: Partial<PedidoPlataforma> = {}): FilaDelTurno => ({
  tipo: "pedido",
  pedido: { id, plataforma: "YANGO", anuladoEn: null, ...extra } as PedidoPlataforma,
});

/** Un turno con de todo: 2 de mostrador, delivery, recojo, un pedido de cada app, anuladas, una modificada y una a revisar. */
const turno: FilaDelTurno[] = [
  venta(1),
  venta(2, { vecesModificada: 1 }),
  venta(3, { tipoPedido: "DELIVERY" }),
  venta(4, { tipoPedido: "RECOGER" }),
  venta(5, { estado: "ANULADO" }),
  venta(6, { requiereRevision: true }),
  pedido(20),
  pedido(21, { plataforma: "PEDIDOS_YA" }),
  pedido(22, { anuladoEn: "2026-11-22T12:00:00Z" }),
];

const ids = (filtro: FiltroDelTurno) =>
  turno.filter((f) => pasaElFiltro(f, filtro)).map((f) => (f.tipo === "venta" ? `v${f.venta.id}` : `p${f.pedido.id}`));

describe("qué deja ver cada pastilla", () => {
  it("«Todo» deja todo, como hoy", () => {
    expect(ids("todo")).toHaveLength(turno.length);
  });

  it("las de tipo muestran todo lo de ese tipo, también lo anulado", () => {
    // La anulada (v5) es de mostrador: sale en «Ventas», tachada.
    expect(ids("ventas")).toEqual(["v1", "v2", "v5", "v6"]);
    expect(ids("delivery")).toEqual(["v3"]);
    expect(ids("recojo")).toEqual(["v4"]);
    // El anulado de Yango sale en «Yango».
    expect(ids("YANGO")).toEqual(["p20", "p22"]);
    expect(ids("PEDIDOS_YA")).toEqual(["p21"]);
  });

  it("«Anuladas» junta las ventas anuladas y los pedidos de plataforma anulados", () => {
    expect(ids("anuladas")).toEqual(["v5", "p22"]);
  });

  it("«Modificadas» es la marca de la fila: viva y con algún cambio", () => {
    expect(ids("modificadas")).toEqual(["v2"]);
    // Anulada después de modificarla ya no lleva la marca: tampoco el filtro.
    expect(pasaElFiltro(venta(9, { estado: "ANULADO", vecesModificada: 2 }), "modificadas")).toBe(false);
    expect(pasaElFiltro(venta(9, { vecesModificada: 0 }), "modificadas")).toBe(false);
  });

  it("«A revisar» son las marcadas; ningún pedido de plataforma lo es", () => {
    expect(ids("revisar")).toEqual(["v6"]);
  });

  it("una venta es de un solo tipo, con la regla de su marca", () => {
    for (const f of turno.filter((x) => x.tipo === "venta")) {
      const tipos = (["ventas", "delivery", "recojo"] as const).filter((t) => pasaElFiltro(f, t));
      expect(tipos).toHaveLength(1);
    }
  });
});

describe("las pastillas que se ofrecen", () => {
  it("todas, en el orden del contrato y con su cantidad, «Todo» primero", () => {
    expect(opcionesDeFiltro(turno)).toEqual([
      ["todo", "Todo (9)"],
      ["ventas", "Ventas (4)"],
      ["delivery", "Delivery (1)"],
      ["recojo", "Recojo (1)"],
      ["YANGO", "Yango (2)"],
      ["PEDIDOS_YA", "PedidosYa (1)"],
      ["modificadas", "Modificadas (1)"],
      ["anuladas", "Anuladas (2)"],
      ["revisar", "A revisar (1)"],
    ]);
  });

  it("sólo ventas de mostrador: no hay nada que distinguir, ninguna pastilla", () => {
    expect(opcionesDeFiltro([venta(1), venta(2), venta(3)])).toEqual([]);
    expect(opcionesDeFiltro([])).toEqual([]);
  });

  it("una pastilla igual al total no sale («Ventas» con todo de mostrador), pero las demás sí", () => {
    expect(opcionesDeFiltro([venta(1), venta(2, { estado: "ANULADO" })])).toEqual([
      ["todo", "Todo (2)"],
      ["anuladas", "Anuladas (1)"],
    ]);
  });

  it("si todo es de una sola cosa no sale ninguna (una sola venta a revisar)", () => {
    expect(opcionesDeFiltro([venta(1, { requiereRevision: true })])).toEqual([]);
  });

  it("sólo pedidos de plataforma: «Ventas» no sale (0) y sí cada plataforma", () => {
    expect(opcionesDeFiltro([pedido(1), pedido(2, { plataforma: "PEDIDOS_YA" })])).toEqual([
      ["todo", "Todo (2)"],
      ["YANGO", "Yango (1)"],
      ["PEDIDOS_YA", "PedidosYa (1)"],
    ]);
  });
});

describe("el filtro que vale", () => {
  const opciones = opcionesDeFiltro(turno);

  it("el elegido, si su pastilla sigue estando", () => {
    expect(filtroVigente("anuladas", opciones)).toBe("anuladas");
    expect(filtroVigente("todo", opciones)).toBe("todo");
  });

  it("si la pastilla dejó de existir, vuelve a «Todo»", () => {
    const sinAnuladas = opcionesDeFiltro([venta(1), venta(2, { tipoPedido: "DELIVERY" })]);
    expect(filtroVigente("anuladas", sinAnuladas)).toBe("todo");
    expect(filtroVigente("YANGO", [])).toBe("todo");
  });
});
