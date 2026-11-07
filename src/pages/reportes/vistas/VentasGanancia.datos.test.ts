import { describe, expect, it } from "vitest";
import type { TopProductoApi } from "../api";
import {
  armarVentasGanancia,
  avisaSinCosto,
  documentoVentasGanancia,
  enPerdida,
  hojaVentasGanancia,
  resumenVentasGanancia,
  sinCosto,
} from "./VentasGanancia.datos";

const prod = (
  nombre: string,
  categoria: string,
  ingresos: number,
  utilidad: number,
  unidades: number,
): TopProductoApi => ({
  nombre,
  categoria,
  ingresos,
  utilidad,
  unidades,
  margenPct: 0,
});

/** La pollería de las fotos de Kevin (6-nov), como la manda `top-productos`. */
const POLLERIA: TopProductoApi[] = [
  prod("Brasa entero", "POLLOS", 560, 185, 5),
  prod("Brasa medio", "POLLOS", 336, 114, 6),
  prod("Brasa cuarto", "POLLOS", 208, 88, 8),
  prod("Brasa económico", "POLLOS", 180, 50, 10),
  prod("Coca Cola 1.5L", "BEBIDAS", 30, 16, 2),
  prod("cerveza paceña 500ml", "CERVEZA", 15, 8, 1),
];

describe("Ventas y ganancia: el cuaderno del dueño", () => {
  it("agrupa por categoría, de la que más vendió a la que menos, y adentro manda lo que más salió", () => {
    const v = armarVentasGanancia(POLLERIA);
    expect(v.categorias.map((c) => c.nombre)).toEqual(["POLLOS", "BEBIDAS", "CERVEZA"]);
    expect(v.categorias[0].productos.map((p) => p.nombre)).toEqual([
      "Brasa económico",
      "Brasa cuarto",
      "Brasa medio",
      "Brasa entero",
    ]);
  });

  it("el costo es lo vendido menos la utilidad, y los totales cierran", () => {
    const v = armarVentasGanancia(POLLERIA);
    const entero = v.categorias[0].productos.find((p) => p.nombre === "Brasa entero")!;
    expect(entero.costo).toBe(375);
    expect(v.total).toBe(1329);
    expect(v.ganancia).toBe(461);
    expect(v.costo).toBe(868);
    expect(v.unidades).toBe(32);
    expect(v.productos).toBe(6);
  });

  it("el PDF y el Excel llevan las cuatro columnas del cuaderno", () => {
    const v = armarVentasGanancia(POLLERIA);
    const doc = documentoVentasGanancia(v, { subtitulo: "Este mes", cajero: "Ana" });
    expect(doc.columnas).toEqual(["PRODUCTO", "CANT.", "TOTAL", "COSTO", "GANANCIA"]);
    const economico = doc.grupos[0].filas.find((f) => f.nombre === "Brasa económico")!;
    expect(economico.celdas.map((c) => c.texto)).toEqual(["10", "Bs 180,00", "Bs 130,00", "Bs 50,00"]);
    // El cajero elegido queda escrito: un PDF de un solo cajero no se lee como el del local.
    expect(doc.resumen).toBe("6 productos · 32 unidades · Ganancia Bs 461,00 · Cajero: Ana");
    expect(hojaVentasGanancia(v).filas[0]).toEqual([
      "Categoría",
      "Producto",
      "Cantidad",
      "Total (Bs)",
      "Costo (Bs)",
      "Ganancia (Bs)",
      "Nota",
    ]);
  });

  it("un producto sin costo cargado dice «Sin costo» y la cuenta no cambia", () => {
    const v = armarVentasGanancia([prod("Ají de fideo", "PLATOS", 100, 100, 5), prod("Brasa cuarto", "POLLOS", 52, 22, 2)]);
    const aji = v.categorias.flatMap((c) => c.productos).find((p) => p.nombre === "Ají de fideo")!;
    expect(sinCosto(aji)).toBe(true);
    expect(v.ventasSinCosto).toBe(100);
    // La ganancia sigue sumando el plato entero, como en Top productos y en Finanzas.
    expect(v.ganancia).toBe(122);
    const doc = documentoVentasGanancia(v, { subtitulo: "Hoy" });
    const fila = doc.grupos.flatMap((g) => g.filas).find((f) => f.nombre === "Ají de fideo")!;
    expect(fila.celdas.find((c) => c.texto === "Sin costo")?.tono).toBe("apagado");
  });

  it("un regalo a precio cero no es «sin costo»: no hay nada que corregir", () => {
    expect(sinCosto({ total: 0, costo: 0 })).toBe(false);
  });

  it("una pérdida cambia la etiqueta y va en rojo", () => {
    const v = armarVentasGanancia([prod("Promo 2x1", "POLLOS", 50, -20, 2)]);
    expect(enPerdida(v)).toBe(true);
    expect(resumenVentasGanancia(v)).toMatch(/Pérdida/);
    const doc = documentoVentasGanancia(v, { subtitulo: "Hoy" });
    expect(doc.total.celdas.at(-1)?.tono).toBe("negativo");
  });

  it("el aviso de sin costo no sale en billar ni en belleza", () => {
    // Ahí el tiempo de mesa o un corte no tienen costo y el aviso no se apagaría nunca.
    expect(avisaSinCosto("RESTAURANTE")).toBe(true);
    expect(avisaSinCosto("BILLAR")).toBe(false);
    expect(avisaSinCosto("PELUQUERIA")).toBe(false);
  });
});
