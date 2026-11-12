import { describe, expect, it } from "vitest";
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
