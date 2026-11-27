import { describe, expect, it } from "vitest";
import { normalizar } from "../texto";
import { INSUMOS_SUGERIDOS, sugeridosQueFaltan } from "./sugeridos";
import { formaCompra } from "./unidades";

/** «Lista sugerida» de Insumos (recetas del plato, 27-nov): la tabla de fábrica. */

describe("la tabla de fábrica", () => {
  it("trae los insumos típicos que pide el contrato, sin repetir", () => {
    const nombres = INSUMOS_SUGERIDOS.map((s) => s.nombre);
    for (const n of ["Pollo", "Arroz", "Fideo", "Papa", "Plátano", "Yuca", "Aceite", "Gas", "Sal", "Comino", "Ajo"]) {
      expect(nombres).toContain(n);
    }
    for (const n of ["Cebolla", "Tomate", "Huevo", "Harina", "Carne molida", "Queso", "Pan", "Bandeja", "Bolsa"]) {
      expect(nombres).toContain(n);
    }
    expect(new Set(nombres.map(normalizar)).size).toBe(nombres.length);
  });

  it("cada uno se compra con un chip del formulario, con rinde completo, y el que pide cuánto trae lo trae", () => {
    for (const s of INSUMOS_SUGERIDOS) {
      const f = formaCompra(s.compra);
      expect(f, s.nombre).not.toBeNull();
      expect(s.rindeCantidad, s.nombre).toBeGreaterThan(0);
      expect(s.rindePorciones, s.nombre).toBeGreaterThan(0);
      expect(s.porcion.trim(), s.nombre).not.toBe("");
      if (f!.contenido == null) expect(s.contenido, s.nombre).toBeGreaterThan(0);
    }
  });

  it("los del contrato: arroz por quintal, 1 kg → 12, lo estimo; pollo entero que se cuenta; aceite por bidón de 20 L", () => {
    const de = (n: string) => INSUMOS_SUGERIDOS.find((s) => s.nombre === n)!;
    expect(de("Arroz")).toMatchObject({ compra: "Quintal", rindeCantidad: 1, rindePorciones: 12, porcion: "porción", seCuenta: false });
    expect(de("Pollo")).toMatchObject({ compra: "Unidad", rindeCantidad: 1, rindePorciones: 8, porcion: "presa", seCuenta: true, partes: "POLLO_8" });
    expect(de("Aceite")).toMatchObject({ compra: "Bidón", contenido: 20, base: "LITRO", rindeCantidad: 20, rindePorciones: 500 });
  });
});

describe("sugeridosQueFaltan: sólo lo que el negocio todavía no tiene", () => {
  const faltan = (existentes: string[]) => sugeridosQueFaltan(existentes).map((s) => s.nombre);

  it("sin insumos, la lista entera en su orden", () => {
    expect(faltan([])).toEqual(INSUMOS_SUGERIDOS.map((s) => s.nombre));
  });

  it("el mismo nombre sin tildes ni mayúsculas, en plural o con apellido ya está", () => {
    const quedan = faltan(["ARROZ", "platano", "Huevos", "Pollo para broaster", "Papas fritas", "Panes"]);
    for (const n of ["Arroz", "Plátano", "Huevo", "Pollo", "Papa", "Pan"]) expect(quedan).not.toContain(n);
  });

  it("lo que sólo empieza igual no es lo mismo", () => {
    const quedan = faltan(["Papaya", "Gaseosa", "Salsa", "Ajonjolí", "Pancita"]);
    for (const n of ["Papa", "Gas", "Sal", "Ajo", "Pan"]) expect(quedan).toContain(n);
  });
});
