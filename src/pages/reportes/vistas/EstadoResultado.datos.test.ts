import { describe, expect, it } from "vitest";
import { fmtMoney } from "../../../lib/format";
import { estadoResultado } from "../../../lib/resultado";
import type { Gasto } from "../../../types";
import { explicarResultado, gananciaPorParte, horasJugadas, partirVentas, perfilResultado } from "./EstadoResultado.datos";

function gasto(monto: number, categoria = "ALQUILER"): Gasto {
  return { id: monto, concepto: categoria, categoria, categoriaNombre: categoria, monto, pagado: 0 } as Gasto;
}

/** El billar de la prueba local del 14-oct: Bs 280 de mesas, Bs 240 de bebidas que costaron Bs 140. */
const FIN_BILLAR = { ventas: 520, costoVentas: 140, utilidadBruta: 380 };
const PARTES_BILLAR = { servicios: 280, productos: 240 };

describe("perfil del estado de resultado por rubro", () => {
  it("el billar parte la venta en mesas y productos, y el tiempo no tiene costo", () => {
    // Pedido de Kevin: "no es un restaurante, es un billar". Con "Ganancia de
    // lo vendido" el dueño no veía lo que le dejaban las mesas.
    const p = perfilResultado("BILLAR");
    expect(p.partir).toBe("billar");
    expect(p.gananciaTitulo).toBe("Ganancia de mesas y productos");
    expect(p.costoDetalle).toMatch(/tiempo de mesa no tiene costo/);
    expect(p.queVaLocal).toMatch(/paños, tacos, bolas/);
  });

  it("el restaurante sigue diciendo platos y comida, como en la app", () => {
    const p = perfilResultado("RESTAURANTE");
    expect(p.partir).toBeNull();
    expect(p.gananciaTitulo).toBe("Ganancia de la comida");
    expect(p.costoDetalle).toBe("Costo cargado en cada plato");
  });

  it("la farmacia habla de medicamentos y belleza parte servicios y productos", () => {
    expect(perfilResultado("FARMACIA").costoDetalle).toBe("Costo cargado en cada medicamento");
    expect(perfilResultado("PELUQUERIA").partir).toBe("servicios");
    expect(perfilResultado("BARBERIA").gananciaTitulo).toBe("Ganancia de servicios y productos");
  });

  it("una tienda o un negocio sin rubro cae en productos", () => {
    for (const rubro of ["MINIMARKET", "FERRETERIA", undefined]) {
      const p = perfilResultado(rubro);
      expect(p.partir).toBeNull();
      expect(p.gananciaTitulo).toBe("Ganancia de lo vendido");
      expect(p.cosas).toBe("productos");
    }
  });
});

describe("partir las ventas", () => {
  it("las dos partes suman las ventas exactas aunque la composición venga corrida", () => {
    // El resumen suma línea por línea y el financiero la venta entera: si una
    // promo de la venta entera los separa, "tiempo + bebidas" igual tiene que
    // dar la línea de Ventas que va justo debajo.
    expect(partirVentas(520, { servicios: 280 })).toEqual({ servicios: 280, productos: 240 });
    expect(partirVentas(515.5, { servicios: 280 })).toEqual({ servicios: 280, productos: 235.5 });
  });

  it("si una parte es cero, la línea va entera: repetir el mismo número no dice nada", () => {
    expect(partirVentas(98, { servicios: 98 })).toBeNull();
    expect(partirVentas(98, { servicios: 0 })).toBeNull();
  });

  it("sin composición (backend viejo o el resumen falló) no se parte", () => {
    expect(partirVentas(520, null)).toBeNull();
    expect(partirVentas(520, undefined)).toBeNull();
    expect(partirVentas(520, {})).toBeNull();
  });

  it("un tiempo mayor que las ventas no deja los productos en negativo", () => {
    expect(partirVentas(100, { servicios: 130 })).toBeNull();
  });
});

describe("lo que deja cada parte del billar", () => {
  it("las mesas quedan enteras y los productos son lo vendido menos su costo", () => {
    const g = gananciaPorParte(PARTES_BILLAR, 140);
    expect(g.mesas).toBe(280);
    expect(g.productos).toBe(100);
    expect(g.margenProductos).toBeCloseTo(100 / 240);
  });

  it("si los productos costaron más de lo que se cobraron, su ganancia es negativa", () => {
    expect(gananciaPorParte({ servicios: 50, productos: 30 }, 45).productos).toBe(-15);
  });
});

describe("horas jugadas", () => {
  it("dice las horas y en cuántas mesas, contando sólo las que se jugaron", () => {
    expect(horasJugadas({ horas: 12.7, porMesa: [{ horas: 5 }, { horas: 0 }, { horas: 7.7 }] })).toBe("12,7 h jugadas en 2 mesas");
    expect(horasJugadas({ horas: 3, porMesa: [{ horas: 3 }] })).toBe("3 h jugadas en 1 mesa");
  });

  it("sin juego o sin reporte no dice nada", () => {
    expect(horasJugadas({ horas: 0, porMesa: [] })).toBeNull();
    expect(horasJugadas(null)).toBeNull();
  });
});

describe("el resultado en palabras", () => {
  const billar = perfilResultado("BILLAR");

  it("con ganancia, dice de dónde salió y que es la ganancia líquida", () => {
    const er = estadoResultado(FIN_BILLAR, [gasto(200), gasto(50, "LUZ")]);
    expect(explicarResultado(er, billar, PARTES_BILLAR)).toBe(
      `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando los gastos del local (${fmtMoney(250)}), te quedan ${fmtMoney(130)}: es tu ganancia líquida.`,
    );
  });

  it("con pérdida, dice cuánto quedó en contra y nombra al banco aparte", () => {
    const er = estadoResultado(FIN_BILLAR, [gasto(5745), gasto(800, "GASTOS_FINANCIEROS")]);
    expect(explicarResultado(er, billar, PARTES_BILLAR)).toBe(
      `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando los gastos del local (${fmtMoney(5745)}) y el banco (${fmtMoney(800)}), quedás ${fmtMoney(6165)} en contra.`,
    );
  });

  it("sin gastos cargados avisa que el resultado está de más", () => {
    // Si no, la ganancia bruta se leería como lo que de verdad quedó.
    const er = estadoResultado(FIN_BILLAR, []);
    expect(explicarResultado(er, billar, PARTES_BILLAR)).toMatch(/Todavía no cargaste gastos en este período/);
  });

  it("en el restaurante habla de la comida y sin partes, de lo vendido", () => {
    const er = estadoResultado(FIN_BILLAR, [gasto(100)]);
    expect(explicarResultado(er, perfilResultado("RESTAURANTE"), null)).toMatch(/^La comida dejó/);
    expect(explicarResultado(er, perfilResultado("MINIMARKET"), null)).toMatch(/^Lo vendido dejó/);
    // Un billar sin la composición tampoco inventa cuánto dejaron las mesas.
    expect(explicarResultado(er, billar, null)).toMatch(/^Lo vendido dejó/);
  });

  it("sin ventas lo dice, y la pérdida es lo gastado", () => {
    const er = estadoResultado({ ventas: 0, costoVentas: 0, utilidadBruta: 0 }, [gasto(3500)]);
    expect(explicarResultado(er, perfilResultado("FARMACIA"), null)).toBe(
      `No hubo ventas en este período. Restando los gastos del local (${fmtMoney(3500)}), quedás ${fmtMoney(3500)} en contra.`,
    );
  });

  it("si los gastos se llevan justo lo que dejaron las ventas, queda en cero", () => {
    const er = estadoResultado(FIN_BILLAR, [gasto(380)]);
    expect(explicarResultado(er, billar, PARTES_BILLAR)).toMatch(/quedás justo en cero\.$/);
  });

  it("un período sin nada no se explica", () => {
    const er = estadoResultado({ ventas: 0, costoVentas: 0, utilidadBruta: 0 }, []);
    expect(explicarResultado(er, billar, null)).toBeNull();
  });
});
