import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { crearXlsx, type HojaNueva } from "../../lib/planilla";
import { hojasConSucursal, nombreDeArchivo, paraArchivo } from "./contexto";

/**
 * Lo que se baja a Excel dice de qué sucursal es (PLAN-SUCURSAL-TOTAL §3
 * etapa 6) y, con UN solo local, queda idéntico al de siempre.
 */

const HOJA: HojaNueva = { nombre: "Ventas", filas: [["Producto", "Total"], ["Pollo", 40]], anchos: [12, 12] };
const CENTRO = { nombre: "Centro", rotulo: "Sucursal" };

describe("nombre del archivo", () => {
  it("sin sucursal es el de toda la vida: nombre y fecha", () => {
    expect(nombreDeArchivo("estado-de-resultado", "2026-11-13", "xlsx")).toBe("estado-de-resultado-2026-11-13.xlsx");
    expect(nombreDeArchivo("estado-de-resultado", "2026-11-13", "xlsx", null)).toBe("estado-de-resultado-2026-11-13.xlsx");
  });

  it("con sucursal la lleva antes de la fecha, sin acentos ni espacios", () => {
    expect(nombreDeArchivo("ventas", "2026-11-13", "xlsx", CENTRO)).toBe("ventas-centro-2026-11-13.xlsx");
    expect(nombreDeArchivo("ventas", "2026-11-13", "pdf", { nombre: "Sede Año Nuevo", rotulo: "Sede" })).toBe("ventas-sede-ano-nuevo-2026-11-13.pdf");
  });

  it("el consolidado se llama «todas las sucursales»", () => {
    expect(nombreDeArchivo("cierres", "2026-11-13", "xlsx", { nombre: "Todas las sucursales", rotulo: "Sucursal" })).toBe(
      "cierres-todas-las-sucursales-2026-11-13.xlsx",
    );
  });

  it("un nombre que no deja letras no ensucia el archivo", () => {
    expect(paraArchivo("¿¡?!")).toBe("");
    expect(nombreDeArchivo("ventas", "2026-11-13", "xlsx", { nombre: "¡!", rotulo: "Sucursal" })).toBe("ventas-2026-11-13.xlsx");
  });
});

describe("fila de encabezado del Excel", () => {
  it("sin sucursal devuelve las mismas hojas, sin tocar nada", () => {
    expect(hojasConSucursal([HOJA], null)).toEqual([HOJA]);
    expect(hojasConSucursal([HOJA])[0]).toBe(HOJA);
  });

  it("con sucursal pone «Sucursal: X» arriba y baja los títulos una fila", () => {
    const [h] = hojasConSucursal([HOJA], CENTRO);
    expect(h.filas).toEqual([["Sucursal: Centro"], ["Producto", "Total"], ["Pollo", 40]]);
    expect(h.encabezadoEn).toBe(1);
    // El original no se toca (las hojas se rearman en cada bajada).
    expect(HOJA.filas).toHaveLength(2);
    expect(HOJA.encabezadoEn).toBeUndefined();
  });

  it("usa la palabra del rubro (Sede en la academia)", () => {
    const [h] = hojasConSucursal([HOJA], { nombre: "Norte", rotulo: "Sede" });
    expect(h.filas[0]).toEqual(["Sede: Norte"]);
  });

  it("los títulos de verdad quedan en negrita y fijos, no la línea de contexto", () => {
    const libro = unzipSync(crearXlsx(hojasConSucursal([HOJA], CENTRO)));
    const xml = strFromU8(libro["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain('ySplit="2"');
    expect(xml).toContain('topLeftCell="A3"');
    // Fila 1 (contexto) sin estilo; fila 2 (títulos) en negrita.
    expect(xml).toMatch(/<c r="A1" t="inlineStr"><is>/);
    expect(xml).toMatch(/<c r="A2" t="inlineStr" s="2">/);
    expect(xml).toMatch(/<c r="A3" t="inlineStr"><is>/);
  });

  it("sin sucursal el libro es el de siempre: títulos en la fila 1 y panel fijo en la 2", () => {
    const libro = unzipSync(crearXlsx(hojasConSucursal([HOJA], null)));
    const xml = strFromU8(libro["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain('ySplit="1"');
    expect(xml).toContain('topLeftCell="A2"');
    expect(xml).toMatch(/<c r="A1" t="inlineStr" s="2">/);
  });
});
