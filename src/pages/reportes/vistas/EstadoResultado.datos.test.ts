import { describe, expect, it } from "vitest";
import { fmtMoney } from "../../../lib/format";
import { mesEnCurso } from "../../../lib/mesEnCurso";
import { estadoResultado } from "../../../lib/resultado";
import type { CodigoMotivoEfectivo, Gasto } from "../../../types";
import { CODIGOS_GASTO, MOTIVOS_BILLAR } from "../../pos/motivosMovimiento";
import type { EfectivoBillarApi } from "../api";
import {
  conceptosDeCaja,
  explicarResultado,
  gananciaPorParte,
  gastosDeCaja,
  horasJugadas,
  listaSinCosto,
  MOTIVOS_SIN_EFECTO,
  movimientosSinEfecto,
  notaMeta,
  partirVentas,
  perfilResultado,
  textoCompras,
  TOPE_SIN_COSTO,
} from "./EstadoResultado.datos";

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

  it("nombra los gastos pagados de la caja entre lo que restó, después de las cenas", () => {
    const er = estadoResultado(FIN_BILLAR, [gasto(200), gasto(50, "LUZ")], { cenas: 40, gastos: 30 });
    expect(explicarResultado(er, billar, PARTES_BILLAR)).toBe(
      `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando los gastos del local (${fmtMoney(250)}), las cenas del personal (${fmtMoney(40)}) y los gastos pagados de la caja (${fmtMoney(30)}), te quedan ${fmtMoney(60)}: es tu ganancia líquida.`,
    );
  });

  it("con cenas y sin gastos cargados no lo llama ganancia líquida, y avisa sin negar las cenas", () => {
    // El bug del 25-oct: el aviso miraba si había alguna resta, y con las
    // cenas decía "es tu ganancia líquida" sin el alquiler ni los sueldos.
    const er = estadoResultado(FIN_BILLAR, [], { cenas: 40, gastos: 0 });
    const texto = explicarResultado(er, billar, PARTES_BILLAR)!;
    expect(texto).toBe(
      `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando las cenas del personal (${fmtMoney(40)}), te quedan ${fmtMoney(340)}. Todavía no cargaste los gastos del local (alquiler, sueldos, servicios): cuando los cargués, este resultado va a bajar.`,
    );
    expect(texto).not.toMatch(/ganancia líquida/);
  });

  it("el aviso de los gastos del local mira los gastos del local, también con una pérdida", () => {
    const er = estadoResultado({ ventas: 100, costoVentas: 90, utilidadBruta: 10 }, [], { cenas: 0, gastos: 30 });
    expect(explicarResultado(er, billar, null)).toContain(`quedás ${fmtMoney(20)} en contra. Todavía no cargaste los gastos del local`);
  });

  it("sin nada que reste dice lo de siempre", () => {
    const er = estadoResultado(FIN_BILLAR, [], { cenas: 0, gastos: 0 });
    expect(explicarResultado(er, billar, PARTES_BILLAR)).toMatch(/Todavía no cargaste gastos en este período: sin el alquiler/);
  });
});

/** El efectivo del billar como lo manda `GET /billar/reportes/efectivo`. */
function efectivo(montos: Partial<Record<CodigoMotivoEfectivo, number>>, gastos: EfectivoBillarApi["gastos"] = []): EfectivoBillarApi {
  const porMotivo = Object.fromEntries(
    MOTIVOS_BILLAR.map((m) => [m.origen, { monto: montos[m.origen!] ?? 0, cantidad: montos[m.origen!] ? 1 : 0 }]),
  ) as EfectivoBillarApi["porMotivo"];
  return { desde: "2026-10-01", hasta: "2026-10-31", porMotivo, gastos };
}

describe("lo que el billar paga de la caja (25-oct)", () => {
  it("resta las cenas y los gastos; sin el reporte la cuenta es la de siempre", () => {
    expect(gastosDeCaja(efectivo({ CENA: 40, GASTO: 30, PROVEEDOR: 800, RETIRO: 300, SENCILLO: 200 }))).toEqual({ cenas: 40, gastos: 30 });
    expect(gastosDeCaja(null)).toBeUndefined();
    // Un pago a proveedor, un retiro o el sencillo no tocan la ganancia.
    const er = estadoResultado(FIN_BILLAR, [gasto(250)], gastosDeCaja(efectivo({ PROVEEDOR: 800, RETIRO: 300, SENCILLO: 200 })));
    expect(er.utilidadNeta).toBe(130);
  });

  it("cada motivo del billar o resta de la ganancia o va en lo informativo", () => {
    // Un motivo nuevo que no esté en ninguna de las dos listas no se vería en
    // ningún lado del Estado de resultado.
    const informativos = MOTIVOS_SIN_EFECTO.map((m) => m.codigo);
    for (const m of MOTIVOS_BILLAR) {
      const codigo = m.origen!;
      expect(CODIGOS_GASTO.has(codigo) !== informativos.includes(codigo)).toBe(true);
    }
  });

  it("lo que no cambia la ganancia sale sólo si hubo, con su signo y su porqué", () => {
    const filas = movimientosSinEfecto(efectivo({ CENA: 40, GASTO: 30, PROVEEDOR: 800, SENCILLO: 200 }).porMotivo);
    expect(filas.map((f) => [f.titulo, f.monto])).toEqual([
      ["Pagos a proveedores", -800],
      ["Sencillo", 200],
    ]);
    // El pago a proveedor dice por qué no resta: su costo ya entra con cada venta.
    expect(filas[0].porQue).toMatch(/costo de los productos/);
    expect(movimientosSinEfecto(efectivo({ CENA: 40 }).porMotivo)).toEqual([]);
    expect(movimientosSinEfecto(null)).toEqual([]);
  });

  it("los conceptos de la línea van sin repetir, de lo que más costó a lo que menos", () => {
    const g = (descripcion: string, monto: number) => ({ id: monto, fecha: "2026-10-20T23:00:00Z", descripcion, monto, quien: "Kevin", cajera: "Pepe" });
    expect(conceptosDeCaja([g("Tiza", 10), g("Hielo", 15), g("hielo ", 15), g("Arreglo de la mesa 3", 25)])).toEqual(["Hielo", "Arreglo de la mesa 3", "Tiza"]);
  });
});

describe("la fórmula de la meta del mes", () => {
  const base = { diaActual: 11, diasDelMes: 31, ventas: 9906, utilidadBruta: 3082.08 };

  it("con sólo gastos cargados dice lo de siempre", () => {
    const mes = mesEnCurso({ ...base, gastosDelMes: 7978 })!;
    expect(notaMeta({ cargados: 7978, mermas: 0, cenas: 0, gastosCaja: 0, mes })).toBe(
      "Meta = gastos cargados del mes (Bs 7.978,00) ÷ lo que te deja cada venta (31,1 %).",
    );
  });

  it("con cenas dice qué suma: lo cargado y las cenas del mes entero, con lo que va", () => {
    // Antes decía "gastos cargados del mes" con un número que traía las cenas
    // de hasta hoy: el dueño buscaba ese total en Gastos y no estaba.
    const mes = mesEnCurso({ ...base, gastosDelMes: 7978, gastosDiarios: 220 })!;
    expect(notaMeta({ cargados: 7978, mermas: 0, cenas: 220, gastosCaja: 0, mes })).toBe(
      "Meta = gastos del mes (Bs 8.598,00) ÷ lo que te deja cada venta (31,1 %). Son los gastos cargados (Bs 7.978,00) y las cenas del personal del mes entero, al ritmo de hasta hoy (Bs 620,00: van Bs 220,00 en 11 días).",
    );
  });

  it("nombra las mermas y lo pagado de la caja, que cuenta una vez", () => {
    const mes = mesEnCurso({ ...base, gastosDelMes: 7978 + 300, gastosDeCaja: 110 })!;
    const nota = notaMeta({ cargados: 7978, mermas: 300, cenas: 0, gastosCaja: 110, mes });
    expect(nota).toBe(
      "Meta = gastos del mes (Bs 8.388,00) ÷ lo que te deja cada venta (31,1 %). Son los gastos cargados (Bs 7.978,00), las mermas (Bs 300,00) y los gastos pagados de la caja (Bs 110,00).",
    );
  });

  it("las partes suman el total al centavo", () => {
    // Redondeadas cada una por su lado decían "Bs 101 y Bs 201" bajo "Bs 301".
    const mes = mesEnCurso({ ...base, gastosDelMes: 100.5 + 200.5 })!;
    const nota = notaMeta({ cargados: 100.5, mermas: 200.5, cenas: 0, gastosCaja: 0, mes });
    expect(nota).toMatch(/\(Bs 301,00\)/);
    expect(nota).toMatch(/los gastos cargados \(Bs 100,50\) y las mermas \(Bs 200,50\)/);
  });
});

describe("qué son los gastos del local en el billar", () => {
  it("avisa que la cena y lo pagado de la caja no se cargan también ahí", () => {
    expect(perfilResultado("BILLAR").queVaLocal).toMatch(/restaría dos veces/);
    expect(perfilResultado("RESTAURANTE").queVaLocal).not.toMatch(/Supervisión/);
  });
});

describe("las compras del período, por rubro (28-oct)", () => {
  const NO_SE_RESTAN = "No se restan acá: el costo ya entra con cada venta.";

  it("el restaurante dice por qué los insumos no restan y dónde van los descartables", () => {
    // Kevin ve en Insumos cuánto invierte y lo busca restado acá. No resta a
    // propósito: ya está en el costo de cada plato, y restarlo contaría la
    // comida dos veces. Lo que sí resta son los descartables, en Gastos.
    const texto = textoCompras({ insumos: 2400, productos: 600 }, perfilResultado("RESTAURANTE"));
    expect(texto).toMatch(/^Insumos Bs 2\.400,00 y productos de reventa Bs 600,00\. /);
    expect(texto).toMatch(/los insumos ya entran en el costo de cada plato, y las bebidas, cuando se venden/);
    expect(texto).toMatch(/contaría la comida dos veces/);
    expect(texto).toMatch(/Los descartables \(platos y vasos desechables, servilletas, bolsas, envases para llevar\)/);
    expect(texto).toMatch(/van en Gastos → Descartables, y ahí sí restan/);
  });

  it("el restaurante sin insumos comprados igual explica el porqué", () => {
    const texto = textoCompras({ insumos: 0, productos: 600 }, perfilResultado("RESTAURANTE"));
    expect(texto).toMatch(/^No se restan acá: los insumos ya entran en el costo de cada plato/);
    expect(texto).toMatch(/Gastos → Descartables/);
  });

  it("los demás rubros dicen lo de siempre, palabra por palabra", () => {
    expect(textoCompras({ insumos: 2400, productos: 600 }, perfilResultado("MINIMARKET"))).toBe(
      `Insumos ${fmtMoney(2400)} y productos de reventa ${fmtMoney(600)}. ${NO_SE_RESTAN}`,
    );
    expect(textoCompras({ insumos: 0, productos: 600 }, perfilResultado("BILLAR"))).toBe(
      `Lo que compraste para vender: bebidas, snacks. ${NO_SE_RESTAN}`,
    );
    for (const rubro of ["FARMACIA", "PELUQUERIA", "FERRETERIA", undefined]) {
      expect(textoCompras({ insumos: 0, productos: 600 }, perfilResultado(rubro))).toBe(NO_SE_RESTAN);
      expect(textoCompras({ insumos: 0, productos: 600 }, perfilResultado(rubro))).not.toMatch(/escartables/);
    }
  });
});

describe("lo vendido sin costo, con nombre (28-oct)", () => {
  const BROASTER = { nombre: "Broaster medio", ventas: 112 };
  const SALCHIPAPA = { nombre: "Salchipapa", ventas: 34 };

  it("sólo el restaurante nombra lo vendido sin costo", () => {
    // Kevin decidió el cambio para el restaurante solo ("farmacia, billar,
    // minimarket: sin cambios"), y el backend manda la lista en todos los
    // rubros. En belleza la lista además contradecía al aviso: dice
    // "servicios sin costo" y nombraba productos.
    expect(perfilResultado("RESTAURANTE").nombraSinCosto).toBe(true);
    for (const rubro of ["BILLAR", "FARMACIA", "PELUQUERIA", "BARBERIA", "MINIMARKET", "FERRETERIA", undefined]) {
      expect(perfilResultado(rubro).nombraSinCosto).toBe(false);
    }
  });

  it("nombra cada uno con lo que se vendió", () => {
    expect(listaSinCosto([BROASTER, SALCHIPAPA], 146)).toBe(
      `Broaster medio (${fmtMoney(112)}), Salchipapa (${fmtMoney(34)})`,
    );
  });

  it("sin la lista (backend anterior) o vacía, no hay nada que nombrar: el aviso queda como siempre", () => {
    expect(listaSinCosto(undefined, 146)).toBeNull();
    expect(listaSinCosto(null, 146)).toBeNull();
    expect(listaSinCosto([], 146)).toBeNull();
  });

  it("recortada para el renglón corto, dice cuántos quedan", () => {
    const cinco = [BROASTER, SALCHIPAPA, { nombre: "Coca 2L", ventas: 30 }, { nombre: "Té", ventas: 5 }, { nombre: "Pan", ventas: 2 }];
    expect(listaSinCosto(cinco, 183, 3)).toBe(
      `Broaster medio (${fmtMoney(112)}), Salchipapa (${fmtMoney(34)}), Coca 2L (${fmtMoney(30)}) y 2 más`,
    );
  });

  it("si llegó el tope y no suma el total, hubo más: termina en «y otros»", () => {
    // El backend manda como mucho diez. Sin el "y otros", cargarles el costo a
    // esos diez parecía arreglar todo y el aviso volvía al mes siguiente.
    const diez = Array.from({ length: TOPE_SIN_COSTO }, (_, i) => ({ nombre: `Plato ${i + 1}`, ventas: 10 }));
    expect(listaSinCosto(diez, 130)).toMatch(/Plato 10 \(Bs 10,00\) y otros$/);
    expect(listaSinCosto(diez, 100)).not.toMatch(/y otros/);
  });

  it("los centavos de redondeo no inventan «otros»", () => {
    // Cada renglón viene redondeado a centavos por su lado: la suma puede
    // quedar unos centavos debajo del total sin que falte ningún plato.
    const diez = Array.from({ length: TOPE_SIN_COSTO }, (_, i) => ({ nombre: `Plato ${i + 1}`, ventas: 10 }));
    expect(listaSinCosto(diez, 100.03)).not.toMatch(/y otros/);
    // Con menos del tope la lista vino entera: un centavo de diferencia es redondeo.
    expect(listaSinCosto([BROASTER, SALCHIPAPA], 146.01)).toBe(
      `Broaster medio (${fmtMoney(112)}), Salchipapa (${fmtMoney(34)})`,
    );
  });
});
