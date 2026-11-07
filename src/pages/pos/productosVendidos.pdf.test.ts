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
