import { describe, expect, it } from "vitest";
import {
  alcanzaPlato,
  anchoDelCosto,
  basePorPorcion,
  costoPlato,
  costoPorcion,
  costoRenglon,
  estaConfigurado,
  loQueDeja,
  margenDe,
  ordenarPorLoQueDeja,
  porcionesEnStock,
  promedioQueQueda,
  rangoCosto,
  round2,
  sinCosto,
  type RenglonCosto,
} from "./calculo";

/**
 * Las cuentas de la receta del plato (CONTRATO-recetas-plato §1.2 y §2.3). El
 * backend hace las mismas: si una cambia acá, cambia allá, o el costo que se ve
 * al armar la receta no es el que queda guardado en la ficha.
 */

describe("round2: medio hacia arriba, sobre el decimal que se lee", () => {
  it("el ejemplo del contrato: dos presas de Bs 4,6125 son Bs 9,23", () => {
    expect(round2(4.6125 * 2)).toBe(9.23);
  });

  it("los medios que el punto flotante esconde: 1,005 es 1,00499999…", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.255)).toBe(1.26);
    // Multiplicando por 100 se perdía el medio centavo.
    expect(Math.round(1.005 * 100) / 100).toBe(1);
    expect(Math.round(1.255 * 100) / 100).toBe(1.25);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.125)).toBe(0.13);
    expect(round2(6.3 / 12)).toBe(0.53);
  });

  it("lo que ya está en centavos queda igual, y una suma con ruido se limpia", () => {
    expect(round2(14.81)).toBe(14.81);
    expect(round2(0.62 + 9.23 + 0.53 + 0.8 + 1.25)).toBe(12.43);
    expect(round2(10)).toBe(10);
  });

  it("nunca devuelve -0 ni NaN", () => {
    expect(Object.is(round2(-0.001), 0)).toBe(true);
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("el rinde de un insumo", () => {
  const ARROZ = { rindeCantidad: 1, rindePorciones: 12, porcionNombre: "porción" };

  it("configurado: con cuánto, sirvo cuántas y cómo se llama lo que sirve", () => {
    expect(estaConfigurado(ARROZ)).toBe(true);
    expect(estaConfigurado({ ...ARROZ, rindeCantidad: 0 })).toBe(false);
    expect(estaConfigurado({ ...ARROZ, rindePorciones: null })).toBe(false);
    expect(estaConfigurado({ ...ARROZ, porcionNombre: "  " })).toBe(false);
    expect(estaConfigurado({})).toBe(false);
  });

  it("cuánto de la unidad base gasta una porción", () => {
    expect(basePorPorcion(ARROZ)).toBeCloseTo(1 / 12, 12);
    expect(basePorPorcion({ ...ARROZ, porcionNombre: null })).toBeNull();
  });

  it("para cuántas porciones alcanza el stock: un quintal de arroz, 552", () => {
    expect(porcionesEnStock(46, ARROZ)).toBe(552);
    expect(porcionesEnStock(46, {})).toBeNull();
  });

  it("lo que cuesta una porción, sin redondear: costo × con cuánto ÷ sirvo cuántas", () => {
    const POLLO = { costo: 36.9, rindeCantidad: 1, rindePorciones: 8, porcionNombre: "presa" };
    expect(costoPorcion(POLLO)).toBe(4.6125);
    expect(costoPorcion({ costo: 15.5, rindeCantidad: 20, rindePorciones: 500, porcionNombre: "porción" })).toBeCloseTo(0.62, 12);
  });

  it("sin costo o sin rinde no hay costo por porción (no es cero: es que falta)", () => {
    expect(costoPorcion({ ...ARROZ, costo: 0 })).toBeNull();
    expect(costoPorcion({ ...ARROZ, costo: null })).toBeNull();
    expect(costoPorcion({ costo: 6.3 })).toBeNull();
  });
});

describe("el costo del plato", () => {
  // Una porción de cada insumo, a lo que sale de sus compras.
  const POLLO = 36.9 / 8; // 4,6125 la presa
  const ACEITE = (15.5 * 20) / 500; // 0,62
  const ARROZ = 6.3 / 12; // 0,525
  const PAPA = 4 / 5; // 0,80
  const PLATANO = 2.5 / 2; // 1,25

  const RECETA: RenglonCosto[] = [
    { grupo: "FIJO", porciones: 1, costoPorcion: ACEITE },
    { grupo: "GUARNICION", porciones: 1, puro: true, costoPorcion: ARROZ },
    { grupo: "GUARNICION", porciones: 1, puro: true, costoPorcion: PAPA },
    { grupo: "GUARNICION", porciones: 1, puro: false, costoPorcion: PLATANO },
    { grupo: "PRESA", porciones: 2, costoPorcion: POLLO },
  ];

  it("cada renglón se redondea solo; sin costo, null", () => {
    expect(costoRenglon(POLLO, 2)).toBe(9.23);
    expect(costoRenglon(ARROZ, 1)).toBe(0.53);
    expect(costoRenglon(null, 3)).toBeNull();
  });

  it("es la suma de los renglones YA redondeados, para que cuadre con lo que se ve", () => {
    // 0,62 + 0,53 + 0,80 + 1,25 + 9,23
    expect(costoPlato(RECETA)).toBe(12.43);
    // Dos renglones de 0,525: se ven 0,53 y 0,53, y el plato dice 1,06 (no 1,05).
    expect(costoPlato([
      { porciones: 1, costoPorcion: ARROZ },
      { porciones: 1, costoPorcion: ARROZ },
    ])).toBe(1.06);
  });

  it("lo que no tiene costo suma cero y se lista aparte", () => {
    const conYuca = [...RECETA, { grupo: "GUARNICION" as const, porciones: 1, puro: true, costoPorcion: null }];
    expect(costoPlato(conYuca)).toBe(12.43);
    expect(sinCosto([
      { nombre: "Yuca", costoPorcion: null },
      { nombre: "Arroz", costoPorcion: ARROZ },
      { nombre: "Yuca", costoPorcion: null },
    ])).toEqual(["Yuca"]);
  });

  it("el rango: quitando una guarnición o pidiendo una «puro» (doble)", () => {
    // Lo fijo y las presas: 0,62 + 9,23 = 9,85. La guarnición puede salir:
    // completa 2,58 · sin arroz 2,05 · sin papa 1,78 · sin plátano 1,33 ·
    // puro arroz (doble 1,05 + plátano 1,25) 2,30 · pura papa (1,60 + 1,25) 2,85.
    expect(rangoCosto(RECETA, true)).toEqual({ minimo: 11.18, maximo: 12.7 });
  });

  it("«puro» con la misma porción: la elegida va una vez", () => {
    // puro arroz 0,53 + 1,25 = 1,78 · pura papa 0,80 + 1,25 = 2,05: el más caro es la completa.
    expect(rangoCosto(RECETA, false)).toEqual({ minimo: 11.18, maximo: 12.43 });
  });

  it("la porción doble se redondea como un renglón de dos porciones", () => {
    // round2(0,525 × 2) = 1,05, no 2 × 0,53 = 1,06.
    const soloArroz: RenglonCosto[] = [{ grupo: "GUARNICION", porciones: 1, puro: true, costoPorcion: ARROZ }];
    expect(rangoCosto(soloArroz, true)).toEqual({ minimo: 0, maximo: 1.05 });
  });

  it("sin guarnición, mínimo y máximo son el costo del plato", () => {
    const sinGuarnicion = RECETA.filter((r) => r.grupo !== "GUARNICION");
    expect(rangoCosto(sinGuarnicion, true)).toEqual({ minimo: 9.85, maximo: 9.85 });
    expect(rangoCosto([], true)).toEqual({ minimo: 0, maximo: 0 });
  });
});

describe("para cuántos platos alcanza", () => {
  it("el mínimo entre lo que se cuenta, y quién limita", () => {
    expect(alcanzaPlato([
      { nombre: "Pollo para broaster", porciones: 2, seCuenta: true, porcionesEnStock: 240 },
      { nombre: "Bandeja", porciones: 1, seCuenta: true, porcionesEnStock: 50 },
      // Lo que se estima no frena la cuenta.
      { nombre: "Arroz", porciones: 1, seCuenta: false, porcionesEnStock: 3 },
    ])).toEqual({ alcanza: 50, limite: "Bandeja" });
  });

  it("sin nada que se cuente, no hay tope", () => {
    expect(alcanzaPlato([{ nombre: "Arroz", porciones: 1, seCuenta: false, porcionesEnStock: 552 }])).toEqual({
      alcanza: null,
      limite: null,
    });
  });

  it("puede dar cero o menos: el stock del insumo queda negativo y la venta sigue", () => {
    expect(alcanzaPlato([{ nombre: "Pollo", porciones: 2, seCuenta: true, porcionesEnStock: -24 }])).toEqual({
      alcanza: -12,
      limite: "Pollo",
    });
    expect(alcanzaPlato([{ nombre: "Pollo", porciones: 2, seCuenta: true, porcionesEnStock: 1 }]).alcanza).toBe(0);
  });
});

describe("lo que deja cada plato", () => {
  it("el ejemplo del contrato: costo Bs 14,81 y precio Bs 28 → Bs 53 son costo y Bs 47 quedan", () => {
    expect(loQueDeja(28, 14.81)).toEqual({ ganancia: 13.19, costoDe100: 53, quedaDe100: 47 });
    expect(margenDe(28, 14.81)).toBeCloseTo(0.471, 3);
    expect(anchoDelCosto(28, 14.81)).toBeCloseTo(52.89, 2);
  });

  it("si cuesta más de lo que se cobra, la ganancia es negativa y la barra no pasa de 100", () => {
    expect(loQueDeja(20, 25).ganancia).toBe(-5);
    expect(anchoDelCosto(20, 25)).toBe(100);
  });

  it("sin precio no hay porcentaje", () => {
    expect(loQueDeja(null, 10)).toEqual({ ganancia: null, costoDe100: null, quedaDe100: null });
    expect(loQueDeja(0, 10)).toEqual({ ganancia: -10, costoDe100: null, quedaDe100: null });
    expect(margenDe(null, 10)).toBeNull();
    expect(margenDe(28, null)).toBeNull();
    expect(anchoDelCosto(0, 10)).toBeNull();
  });

  const A = { nombre: "Broaster cuarto", precio: 28, costo: 14.81 }; // deja 47 %
  const B = { nombre: "Alitas", precio: 30, costo: 20 }; // deja 33 %
  const C = { nombre: "Sin precio", precio: null, costo: 5 };
  const D = { nombre: "Porción de papa", precio: 10, costo: 4 }; // deja 60 %

  it("se ordena del que menos deja al que más, por la parte del precio que queda", () => {
    expect(ordenarPorLoQueDeja([A, B, C, D]).map((p) => p.nombre)).toEqual([
      "Alitas",
      "Broaster cuarto",
      "Porción de papa",
      "Sin precio",
    ]);
  });

  it("el promedio de lo que queda de cada Bs 100 (sin contar los que no tienen precio)", () => {
    // (47,1 + 33,3 + 60) ÷ 3 = 46,8
    expect(promedioQueQueda([A, B, C, D])).toBe(47);
    expect(promedioQueQueda([C])).toBeNull();
    expect(promedioQueQueda([])).toBeNull();
  });
});
