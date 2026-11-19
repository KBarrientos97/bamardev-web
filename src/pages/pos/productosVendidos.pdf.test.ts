import { describe, expect, it, vi } from "vitest";
import type { ReporteCierreProductos } from "../../types";
import { documentoProductosVendidos } from "./productosVendidos";

/**
 * El PDF de Productos vendidos (6-nov, como la app desde el 5-nov): reemplaza
 * al CSV, que en el celular se abría con la fila entera en una celda.
 */

const TURNO: ReporteCierreProductos = {
  unidades: 12,
  total: 334,
  lineas: 3,
  categorias: [
    {
      nombre: "POLLOS",
      unidades: 10,
      total: 304,
      items: [
        { productoId: 1, nombre: "Brasa medio", cantidad: 4, precio: 56, total: 224 },
        { productoId: 2, nombre: "Brasa cuarto", cantidad: 6, precio: 13.33, total: 80, variosPrecios: true },
      ],
    },
    { nombre: "BEBIDAS", unidades: 2, total: 30, items: [{ productoId: 3, nombre: "Coca Cola 1.5L", cantidad: 2, precio: 15, total: 30 }] },
  ],
};

describe("el PDF de Productos vendidos", () => {
  it("lleva la tabla, el unitario debajo de cada producto y el TOTAL VENDIDO", () => {
    const doc = documentoProductosVendidos(TURNO, { negocio: "Pollos Don Omar", subtitulo: "Turno #12" });
    expect(doc.columnas).toEqual(["PRODUCTO", "CANT.", "TOTAL"]);
    expect(doc.grupos.map((g) => g.titulo)).toEqual(["POLLOS", "BEBIDAS"]);
    expect(doc.grupos[0].filas[0].detalle).toBe("Bs 56,00 c/u");
    // Vendido a dos precios: un promedio no es un precio que existió.
    expect(doc.grupos[0].filas[1].detalle).toBe("varios precios");
    expect(doc.total.etiqueta).toBe("TOTAL VENDIDO");
    expect(doc.total.celdas[1].texto).toBe("Bs 334,00");
    expect(doc.notas?.[0]).toMatch(/no lo que hay en el cajón/);
  });

  it("el renglón de arriba dice los productos y las unidades", () => {
    expect(documentoProductosVendidos(TURNO, { subtitulo: "Turno #12" }).resumen).toBe("3 productos · 12 unidades");
  });
});

describe("lo fiado en el PDF (11-nov)", () => {
  const CON_FIADO: ReporteCierreProductos = {
    ...TURNO,
    categorias: [
      {
        ...TURNO.categorias[0],
        items: [{ ...TURNO.categorias[0].items[0], fiado: 2 }, TURNO.categorias[0].items[1]],
      },
      TURNO.categorias[1],
    ],
    fiado: { ventas: 1, unidades: 2, total: 112, adelantos: 0, porCobrar: 112 },
    cobrosDeFiado: { total: 65 },
  };

  it("el renglón de arriba dice cuántas salieron fiadas y el producto lo dice en el suyo", () => {
    const doc = documentoProductosVendidos(CON_FIADO, { subtitulo: "Turno #12" });
    expect(doc.resumen).toBe("3 productos · 12 unidades · 2 al fiado");
    expect(doc.grupos[0].filas[0].detalle).toBe("Bs 56,00 c/u · 2 al fiado");
    expect(doc.grupos[0].filas[1].detalle).toBe("varios precios");
    // El TOTAL sigue siendo lo vendido, fiado incluido: es el del arqueo.
    expect(doc.total.celdas[1].texto).toBe("Bs 334,00");
  });

  it("las notas explican lo que salió sin plata y la plata que entró sin producto", () => {
    const doc = documentoProductosVendidos(CON_FIADO, { subtitulo: "Turno #12" });
    expect(doc.notas?.[0]).toBe("2 unidades en 1 venta al fiado: Bs 112,00 que no entraron al cajón.");
    expect(doc.notas?.[1]).toBe(
      "Además entraron Bs 65,00 de cobros de fiado, sin producto: esos salieron el día que se fiaron.",
    );
    expect(doc.notas?.[2]).toMatch(/no lo que hay en el cajón/);
  });

  it("con adelanto dice qué parte sí entró", () => {
    const doc = documentoProductosVendidos(
      { ...CON_FIADO, fiado: { ventas: 2, unidades: 3, total: 120, adelantos: 20, porCobrar: 100 }, cobrosDeFiado: undefined },
      { subtitulo: "Turno #12" },
    );
    expect(doc.notas?.[0]).toBe(
      "3 unidades en 2 ventas al fiado: Bs 120,00. Entraron Bs 20,00 de adelanto; quedan Bs 100,00 por cobrar.",
    );
    expect(doc.notas).toHaveLength(2);
  });

  it("sin fiado, el PDF de siempre", () => {
    const doc = documentoProductosVendidos(TURNO, { subtitulo: "Turno #12" });
    expect(doc.resumen).toBe("3 productos · 12 unidades");
    expect(doc.notas).toHaveLength(1);
  });
});

describe("los pedidos de Yango y PedidosYa en el PDF (§11)", () => {
  const CON_PLATAFORMAS: ReporteCierreProductos = {
    ...TURNO,
    plataformas: [
      {
        plataforma: "YANGO",
        pedidos: 3,
        unidades: 5,
        total: 85,
        categorias: [
          {
            nombre: "POLLOS",
            unidades: 5,
            total: 85,
            items: [
              { productoId: 1, nombre: "Brasa medio", cantidad: 1, precio: 56, total: 56 },
              { productoId: 4, nombre: "Brasa cuarto", cantidad: 4, precio: 7.25, total: 29, variosPrecios: true },
            ],
          },
        ],
      },
      {
        plataforma: "PEDIDOS_YA",
        pedidos: 1,
        unidades: 1,
        total: 15,
        categorias: [{ nombre: "BEBIDAS", unidades: 1, total: 15, items: [{ productoId: 3, nombre: "Coca Cola 1.5L", cantidad: 1, precio: 15, total: 15 }] }],
      },
    ],
  };

  it("cada plataforma va después del TOTAL VENDIDO, con su encabezado, la leyenda y sus categorías", () => {
    const doc = documentoProductosVendidos(CON_PLATAFORMAS, { subtitulo: "Turno #12" });
    const despues = doc.despuesDelTotal ?? [];
    expect(despues.map((g) => g.titulo)).toEqual([
      "Yango · 3 pedidos · 5 unidades · Bs 85,00",
      "POLLOS",
      "PedidosYa · 1 pedido · 1 unidad · Bs 15,00",
      "BEBIDAS",
    ]);
    expect(despues[0].aclaracion).toBe("");
    expect(despues[2].aclaracion).toBe("");
    // El producto con el mismo formato que las ventas.
    expect(despues[1].filas[0].detalle).toBe("Bs 56,00 c/u");
    expect(despues[1].filas[1].detalle).toBe("varios precios");
    expect(despues[1].filas[0].celdas.map((c) => c.texto)).toEqual(["1", "Bs 56,00"]);
  });

  it("no toca el total vendido ni las categorías de las ventas", () => {
    const sin = documentoProductosVendidos(TURNO, { subtitulo: "Turno #12" });
    const con = documentoProductosVendidos(CON_PLATAFORMAS, { subtitulo: "Turno #12" });
    expect(con.total).toEqual(sin.total);
    expect(con.total.celdas[1].texto).toBe("Bs 334,00");
    expect(con.grupos).toEqual(sin.grupos);
  });

  it("el resumen suma la línea corta de pedidos y las notas dicen que van aparte", () => {
    const doc = documentoProductosVendidos(CON_PLATAFORMAS, { subtitulo: "Turno #12" });
    expect(doc.resumen).toBe("3 productos · 12 unidades · + Yango 3 · PedidosYa 1 pedidos");
    expect(doc.notas?.[0]).toMatch(/los paga la app de delivery y no suman al total vendido/);
  });

  it("con descuentos de la app (19-nov): el encabezado dice lo que paga la app y la tabla termina con «Descuentos»", () => {
    const conDescuento: ReporteCierreProductos = {
      ...CON_PLATAFORMAS,
      plataformas: [{ ...CON_PLATAFORMAS.plataformas![0], descuentos: 6 }, CON_PLATAFORMAS.plataformas![1]],
    };
    const despues = documentoProductosVendidos(conDescuento, { subtitulo: "Turno #12" }).despuesDelTotal ?? [];
    expect(despues.map((g) => g.titulo)).toEqual([
      // 85 de renglones − 6 de descuentos.
      "Yango · 3 pedidos · 5 unidades · Bs 79,00",
      "POLLOS",
      "Descuentos",
      "PedidosYa · 1 pedido · 1 unidad · Bs 15,00",
      "BEBIDAS",
    ]);
    // Los renglones siguen al precio de la app; el descuento cierra la cuenta (guion común: Helvetica no tiene «−»).
    expect(despues[1].celdas.map((c) => c.texto)).toEqual(["5", "Bs 85,00"]);
    expect(despues[2]).toEqual({ titulo: "Descuentos", celdas: [{ texto: "" }, { texto: "-Bs 6,00" }], filas: [] });
    // Sin `descuentos` (o en 0): el mismo PDF de hoy.
    const cero = { ...CON_PLATAFORMAS, plataformas: CON_PLATAFORMAS.plataformas!.map((p) => ({ ...p, descuentos: 0 })) };
    expect(documentoProductosVendidos(cero, { subtitulo: "Turno #12" })).toEqual(
      documentoProductosVendidos(CON_PLATAFORMAS, { subtitulo: "Turno #12" }),
    );
  });

  it("sin el campo, o vacío, el PDF de siempre", () => {
    const base = documentoProductosVendidos(TURNO, { subtitulo: "Turno #12" });
    const vacio = documentoProductosVendidos({ ...TURNO, plataformas: [] }, { subtitulo: "Turno #12" });
    expect(base.despuesDelTotal).toEqual([]);
    expect(vacio).toEqual(base);
    expect(base.resumen).toBe("3 productos · 12 unidades");
    expect(base.notas).toHaveLength(1);
  });
});

describe("por forma de pago en el PDF (§11 bis)", () => {
  const cat = (nombre: string, unidades: number, total: number): ReporteCierreProductos["categorias"][number] => ({
    nombre,
    unidades,
    total,
    items: [{ productoId: 1, nombre: `${nombre} x`, cantidad: unidades, precio: total / unidades, total }],
  });
  const POR_MEDIO: ReporteCierreProductos = {
    unidades: 10,
    total: 170,
    lineas: 2,
    categorias: [cat("M", 7, 140), cat("Topping", 3, 30)],
    porMedio: [
      { medio: "EFECTIVO", nombre: "Efectivo", ventas: 4, unidades: 7, total: 140, categorias: [cat("M", 7, 140)] },
      { medio: "FIADO", nombre: "Al fiado", ventas: 1, unidades: 3, total: 30, categorias: [cat("Topping", 3, 30)] },
    ],
    plataformas: [{ plataforma: "YANGO", pedidos: 1, unidades: 2, total: 40, categorias: [cat("M", 2, 40)] }],
    todo: { unidades: 12, categorias: [{ nombre: "M", unidades: 9 }, { nombre: "Topping", unidades: 3 }] },
  };

  it("por defecto: secciones por medio, las plataformas y al final el total en caja y las unidades por categoría", () => {
    const doc = documentoProductosVendidos(POR_MEDIO, { subtitulo: "Turno #12" });
    expect(doc.grupos.map((g) => g.titulo)).toEqual([
      "Efectivo · 4 ventas · 7 unidades · Bs 140,00",
      "M",
      "Al fiado · 1 venta · 3 unidades · Bs 30,00",
      "Topping",
      "Yango · 1 pedido · 2 unidades · Bs 40,00",
      "M",
    ]);
    expect(doc.grupos[2].aclaracion).toBe("No entró al cajón");
    expect(doc.total.etiqueta).toBe("TOTAL VENDIDO EN CAJA");
    expect(doc.total.celdas[1].texto).toBe("Bs 170,00");
    expect(doc.despuesDelTotal).toHaveLength(1);
    expect(doc.despuesDelTotal?.[0].titulo).toBe("Total de unidades: 12");
    expect(doc.despuesDelTotal?.[0].aclaracion).toBe("M 9 · Topping 3");
  });

  it("«Todo junto»: la lista de siempre, con las plataformas después del total", () => {
    const doc = documentoProductosVendidos(POR_MEDIO, { subtitulo: "Turno #12", vista: "todo" });
    expect(doc.grupos.map((g) => g.titulo)).toEqual(["M", "Topping"]);
    expect(doc.total.etiqueta).toBe("TOTAL VENDIDO");
    expect(doc.despuesDelTotal?.[0].titulo).toBe("Yango · 1 pedido · 2 unidades · Bs 40,00");
  });

  it("sin `porMedio`, el de siempre aunque se pida por medio", () => {
    const { porMedio: _omitido, ...sinMedio } = POR_MEDIO;
    const doc = documentoProductosVendidos(sinMedio, { subtitulo: "Turno #12", vista: "medio" });
    expect(doc.total.etiqueta).toBe("TOTAL VENDIDO");
    expect(doc.grupos.map((g) => g.titulo)).toEqual(["M", "Topping"]);
  });
});

describe("el PDF por forma de pago se dibuja entero", () => {
  it("arma el archivo con secciones, plataformas y resumen sin romperse", async () => {
    const { bajarPdf } = await import("../../lib/pdf/tablaPdf");
    const cat = { nombre: "M", unidades: 2, total: 40, items: [{ productoId: 1, nombre: "Arroz con leche M", cantidad: 2, precio: 20, total: 40 }] };
    const d: ReporteCierreProductos = {
      unidades: 2,
      total: 40,
      lineas: 1,
      categorias: [cat],
      porMedio: [{ medio: "QR", nombre: "QR", ventas: 1, unidades: 2, total: 40, categorias: [cat] }],
      // Con descuentos: el renglón «Descuentos» es un grupo sin productos y también se dibuja (19-nov).
      plataformas: [{ plataforma: "PEDIDOS_YA", pedidos: 1, unidades: 2, total: 40, descuentos: 3, categorias: [cat] }],
      todo: { unidades: 4, categorias: [{ nombre: "M", unidades: 4 }] },
    };
    const crear = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { ...URL, createObjectURL: crear, revokeObjectURL: vi.fn() });
    await expect(bajarPdf("x.pdf", documentoProductosVendidos(d, { subtitulo: "Turno #1" }), "#0F7B5F")).resolves.toBeDefined();
    expect(crear).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
