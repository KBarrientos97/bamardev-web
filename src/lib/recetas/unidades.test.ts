import { describe, expect, it } from "vitest";
import { fmtMoney, fmtNum } from "../format";
import type { Insumo, UnidadMedida } from "../../types";
import {
  FORMAS_COMPRA,
  baseDeNombre,
  baseDeUnidad,
  cantidadConUnidad,
  cuentaCompra,
  formaCompra,
  pluralPorcion,
  resumenInsumo,
  textoCompra,
  textoCompraQueEntra,
  textoPorciones,
  textoRinde,
  unBulto,
  unidadDeBase,
} from "./unidades";

/**
 * Cómo se compra un insumo y para cuánto alcanza (recetas del plato, 27-nov).
 * Los ejemplos son los del contrato: el arroz se compra por quintal (46 kg), con
 * un kilo se sirven 12 porciones, y dos quintales a Bs 580 dan 92 kg a Bs 6,30.
 */

const KG = { id: 1, nombre: "Kilogramo", abreviatura: "kg", activo: true };
const LITRO = { id: 2, nombre: "Litro", abreviatura: "l", activo: true };
const UNIDAD = { id: 3, nombre: "Unidad", abreviatura: "und", activo: true };
const PORCION = { id: 4, nombre: "Porción", abreviatura: "porc", activo: true };
const UNIDADES: UnidadMedida[] = [UNIDAD, KG, LITRO, PORCION];

describe("la unidad base", () => {
  it("reconoce las unidades del negocio por nombre o abreviatura, sin tildes ni mayúsculas", () => {
    expect(baseDeNombre("Kilogramo")).toBe("KILO");
    expect(baseDeNombre("kg")).toBe("KILO");
    expect(baseDeNombre("Kilos")).toBe("KILO");
    expect(baseDeNombre("LITROS")).toBe("LITRO");
    expect(baseDeNombre("Unidades")).toBe("UNIDAD");
    expect(baseDeNombre("Porción")).toBeNull();
    expect(baseDeNombre("")).toBeNull();
    expect(baseDeUnidad({ nombre: "Kilo de carne", abreviatura: "kg" })).toBe("KILO");
  });

  it("busca en las del negocio la que corresponde, y si no la tiene no inventa", () => {
    expect(unidadDeBase(UNIDADES, "KILO")).toBe(KG);
    expect(unidadDeBase(UNIDADES, "LITRO")).toBe(LITRO);
    expect(unidadDeBase(UNIDADES, "UNIDAD")).toBe(UNIDAD);
    expect(unidadDeBase([UNIDAD, PORCION], "KILO")).toBeNull();
    // Una dada de baja no cuenta.
    expect(unidadDeBase([{ ...KG, activo: false }], "KILO")).toBeNull();
  });

  it("dice la cantidad con su unidad corta", () => {
    expect(cantidadConUnidad(92, "KILO")).toBe("92 kg");
    expect(cantidadConUnidad(20, "LITRO")).toBe("20 L");
    expect(cantidadConUnidad(1, "UNIDAD")).toBe("1 unidad");
    expect(cantidadConUnidad(30, "UNIDAD")).toBe("30 unidades");
    expect(cantidadConUnidad(11.5, "KILO")).toBe("11,5 kg");
    expect(cantidadConUnidad(3, null, "Porción")).toBe("3 Porción");
  });
});

describe("cómo lo comprás", () => {
  it("los ocho chips, en el orden del formulario", () => {
    expect(FORMAS_COMPRA.map((f) => f.nombre)).toEqual([
      "Kilo",
      "Quintal",
      "Arroba",
      "Bolsa",
      "Litro",
      "Bidón",
      "Unidad",
      "Paquete",
    ]);
  });

  it("quintal 46 kg y arroba 11,5 kg; bolsa, bidón y paquete preguntan cuánto traen", () => {
    expect(formaCompra("Quintal")).toMatchObject({ base: "KILO", contenido: 46 });
    expect(formaCompra("arroba")).toMatchObject({ base: "KILO", contenido: 11.5 });
    for (const n of ["Bolsa", "Bidon", "Paquete"]) expect(formaCompra(n)).toMatchObject({ base: null, contenido: null });
    for (const n of ["Kilo", "Litro", "Unidad"]) expect(formaCompra(n)).toMatchObject({ contenido: 1, esLaBase: true });
    expect(formaCompra("Garrafa")).toBeNull();
  });

  it("con su artículo", () => {
    expect(unBulto(formaCompra("Quintal")!)).toBe("Un quintal");
    expect(unBulto(formaCompra("Arroba")!)).toBe("Una arroba");
    expect(unBulto(formaCompra("Bolsa")!)).toBe("Una bolsa");
  });

  it("lo que dice la tarjeta", () => {
    expect(textoCompra("Quintal", 46, KG)).toBe("Quintal de 46 kg");
    expect(textoCompra("Bidón", 20, LITRO)).toBe("Bidón de 20 L");
    expect(textoCompra("Paquete", 30, UNIDAD)).toBe("Paquete de 30 unidades");
    expect(textoCompra("Kilo", 1, KG)).toBe("Por kilo");
    expect(textoCompra(null, null, KG)).toBeNull();
  });
});

describe("para cuánto alcanza", () => {
  it("el plural de lo que se sirve", () => {
    expect(pluralPorcion("porción")).toBe("porciones");
    expect(pluralPorcion("presa")).toBe("presas");
    expect(pluralPorcion("unidad")).toBe("unidades");
    expect(pluralPorcion("taza")).toBe("tazas");
    expect(pluralPorcion("ración")).toBe("raciones");
  });

  it("las porciones: justas, en singular, o para abajo cuando no dan justo", () => {
    expect(textoPorciones(552, "porción")).toBe("552 porciones");
    expect(textoPorciones(1, "presa")).toBe("1 presa");
    expect(textoPorciones(1104, "porción")).toBe(`${fmtNum(1104)} porciones`);
    expect(textoPorciones(107.33, "porción")).toBe("unas 107 porciones");
    expect(textoPorciones(0.5, "plato")).toBe("0,5 platos");
  });

  it("el rinde, completo o nada", () => {
    expect(textoRinde({ rindeCantidad: 1, rindePorciones: 12, porcionNombre: "porción" }, KG)).toBe("1 kg rinde 12 porciones");
    expect(textoRinde({ rindeCantidad: 1, rindePorciones: 8, porcionNombre: "presa" }, UNIDAD)).toBe("1 unidad rinde 8 presas");
    expect(textoRinde({ rindeCantidad: 1, rindePorciones: null, porcionNombre: "porción" }, KG)).toBeNull();
    expect(textoRinde({ rindeCantidad: 1, rindePorciones: 12, porcionNombre: "" }, KG)).toBeNull();
  });
});

describe("resumenInsumo: lo que muestra la tarjeta", () => {
  const ARROZ: Insumo = {
    id: 5,
    nombre: "Arroz",
    codigo: "MP005",
    categoria: null,
    categoriaId: 1,
    unidad: KG,
    unidadMedidaId: 1,
    stock: 46,
    costoCompra: 6.3,
    puntoReorden: 0,
    proveedor: null,
    vencimiento: null,
    almacen: null,
    habilitado: true,
    compraUnidad: "Quintal",
    compraContenido: 46,
    rindeCantidad: 1,
    rindePorciones: 12,
    porcionNombre: "porción",
    seCuenta: false,
  };

  it("lo que manda el backend gana", () => {
    const r = resumenInsumo({ ...ARROZ, configurado: true, porciones: 552, costoPorcion: 0.525 });
    expect(r).toMatchObject({
      configurado: true,
      sinCosto: false,
      compra: "Quintal de 46 kg",
      rinde: "1 kg rinde 12 porciones",
      porciones: 552,
      porcion: "porción",
      costoPorcion: 0.525,
    });
  });

  it("sin esos campos (un backend que no los calcula) sale de las mismas cuentas", () => {
    const r = resumenInsumo(ARROZ);
    expect(r.configurado).toBe(true);
    expect(r.porciones).toBe(552);
    expect(r.costoPorcion).toBeCloseTo(0.525, 6);
  });

  it("sin rinde: falta completar; sin compras: sin costo", () => {
    const r = resumenInsumo({ ...ARROZ, rindePorciones: null, costoCompra: 0, configurado: false, porciones: null, costoPorcion: null });
    expect(r.configurado).toBe(false);
    expect(r.sinCosto).toBe(true);
    expect(r.rinde).toBeNull();
    expect(r.costoPorcion).toBeNull();
  });
});

describe("la compra por bulto (Movimientos)", () => {
  const RINDE = { rindeCantidad: 1, rindePorciones: 12, porcionNombre: "porción" };

  it("2 quintales a Bs 580: entran 92 kg a Bs 6,30 el kilo, unas 1.104 porciones de Bs 0,53", () => {
    const c = cuentaCompra({ cantidad: 2, contenido: 46, total: 580, ...RINDE });
    expect(c.cantidadBase).toBe(92);
    // 580 ÷ 92 = 6,3043…: a centavos, como el servidor.
    expect(c.costoUnitario).toBe(6.3);
    expect(c.porciones).toBe(1104);
    expect(c.costoPorcion).toBeCloseTo(0.525, 6);
    expect(textoCompraQueEntra(c, "KILO", "Kilogramo", "porción")).toBe(
      `Entran 92 kg, unas ${fmtNum(1104)} porciones. Cada porción te sale ${fmtMoney(0.525)}.`,
    );
  });

  it("en la unidad del insumo, la cantidad no se multiplica", () => {
    const c = cuentaCompra({ cantidad: 10, contenido: 1, total: 63, ...RINDE });
    expect(c.cantidadBase).toBe(10);
    expect(c.costoUnitario).toBe(6.3);
  });

  it("sin total todavía: dice lo que entra y nada de plata", () => {
    const c = cuentaCompra({ cantidad: 1, contenido: 46, total: null, ...RINDE });
    expect(c.costoUnitario).toBeNull();
    expect(c.costoPorcion).toBeNull();
    expect(textoCompraQueEntra(c, "KILO", "Kilogramo", "porción")).toBe("Entran 46 kg, unas 552 porciones.");
  });

  it("sin rinde: sólo lo que entra", () => {
    const c = cuentaCompra({ cantidad: 1, contenido: 46, total: 290 });
    expect(c.porciones).toBeNull();
    expect(textoCompraQueEntra(c, "KILO", "Kilogramo", null)).toBe("Entran 46 kg.");
  });

  it("una cantidad que no es un número no da nada", () => {
    const c = cuentaCompra({ cantidad: null, contenido: 46, total: 580, ...RINDE });
    expect(c).toEqual({ cantidadBase: null, costoUnitario: null, porciones: null, costoPorcion: null });
    expect(textoCompraQueEntra(c, "KILO", "Kilogramo", "porción")).toBe("");
  });

  it("a los 3 decimales del stock: 1,5 arrobas son 17,25 kg y 0,1 × 3 no da 0,30000000000000004", () => {
    expect(cuentaCompra({ cantidad: 1.5, contenido: 11.5, total: null }).cantidadBase).toBe(17.25);
    expect(cuentaCompra({ cantidad: 3, contenido: 0.1, total: null }).cantidadBase).toBe(0.3);
  });
});
