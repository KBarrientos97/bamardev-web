import { describe, expect, it } from "vitest";
import { bsEntero } from "../formato";
import { bsPorHoraDeMesa, comoVas, lineaGasto, lineaUnidad, sobraOFalta, textoMargen } from "./PuntoEquilibrio.datos";

describe("punto de equilibrio: la meta en la unidad del rubro", () => {
  it("el Bs por hora de mesa suma el tiempo y lo que se consume en la mesa", () => {
    // Con el tiempo solo, las horas necesarias salían de más: la gaseosa de
    // la mesa también paga el alquiler.
    expect(bsPorHoraDeMesa({ tiempoBs: 4_000, consumosBs: 1_000, horas: 200 })).toBe(25);
  });

  it("sin horas jugadas no hay Bs por hora", () => {
    expect(bsPorHoraDeMesa({ tiempoBs: 0, consumosBs: 0, horas: 0 })).toBeNull();
    expect(bsPorHoraDeMesa({ tiempoBs: 100, consumosBs: 0, horas: 0 })).toBeNull();
    expect(bsPorHoraDeMesa(null)).toBeNull();
  });

  it("en un billar la meta diaria se dice en horas de mesa", () => {
    expect(lineaUnidad(626, { tipo: "horas", bsPorHora: 49.3 })).toBe("≈ 12,7 h de mesa por día, con sus consumos");
  });

  it("en el resto, en ventas con el ticket promedio, redondeado para arriba", () => {
    // 10,2 ventas son 11: con 10 no se llega.
    expect(lineaUnidad(510, { tipo: "ventas", ticket: 50 })).toBe(`≈ 11 ventas por día con el ticket promedio de ${bsEntero(50)}`);
    expect(lineaUnidad(500, { tipo: "ventas", ticket: 50 })).toBe(`≈ 10 ventas por día con el ticket promedio de ${bsEntero(50)}`);
  });

  it("sin meta diaria o sin con qué convertir no hay línea", () => {
    expect(lineaUnidad(null, { tipo: "ventas", ticket: 50 })).toBeNull();
    expect(lineaUnidad(0, { tipo: "ventas", ticket: 50 })).toBeNull();
    expect(lineaUnidad(500, null)).toBeNull();
    expect(lineaUnidad(500, { tipo: "ventas", ticket: 0 })).toBeNull();
  });
});

describe("punto de equilibrio: cómo se va", () => {
  it("dice cuánto arriba o abajo de la meta se va", () => {
    expect(comoVas(11_364.75, 4_383.93)).toBe("vas 159 % arriba");
    expect(comoVas(3_000, 4_000)).toBe("vas 25 % abajo");
    expect(comoVas(4_000, 4_000)).toBe("vas justo en el equilibrio");
  });

  it("sin meta no hay comparación: una meta en cero daría un infinito", () => {
    expect(comoVas(5_000, 0)).toBeNull();
    expect(comoVas(5_000, null)).toBeNull();
  });

  it("el último renglón cambia de nombre y de color con el signo", () => {
    expect(sobraOFalta(11_364.75, 4_383.93)).toMatchObject({ etiqueta: "Te sobró", monto: 6_980.82, tono: "marca" });
    expect(sobraOFalta(3_000, 4_000)).toMatchObject({ etiqueta: "Te faltan", monto: 1_000, tono: "rojo" });
  });

  it("una diferencia de centavos es justo el equilibrio, no un faltante", () => {
    expect(sobraOFalta(4_000, 4_000.004)).toMatchObject({ etiqueta: "Justo en el equilibrio", monto: 0, tono: "normal" });
  });
});

describe("punto de equilibrio: los textos", () => {
  it("el margen se explica en Bs de cada Bs 100", () => {
    const t = textoMargen(0.67, false, false)!;
    expect(t).toContain(`De cada ${bsEntero(100)} vendidos te quedan ${bsEntero(67)}`);
    expect(t).not.toContain("tiempo de mesa");
  });

  it("en un billar dice por qué el margen es alto", () => {
    expect(textoMargen(0.67, false, true)).toContain("El tiempo de mesa sube este margen porque no tiene costo.");
  });

  it("con gastos variables dice que también se restan", () => {
    expect(textoMargen(0.5, true, false)).toContain("los gastos que se mueven con cada venta");
  });

  it("sin margen positivo no hay texto: ahí no hay meta y el aviso de arriba dice por qué", () => {
    expect(textoMargen(null, false, false)).toBeNull();
    expect(textoMargen(-0.1, false, false)).toBeNull();
    expect(textoMargen(0, false, false)).toBeNull();
  });

  it("cada categoría del desglose dice cuántos gastos y cuánto pesa sobre las ventas", () => {
    expect(lineaGasto({ cantidad: 3, sobreVentasPct: 0.124 })).toBe("3 gastos · 12 % de las ventas");
    expect(lineaGasto({ cantidad: 1, sobreVentasPct: null })).toBe("1 gasto");
  });
});
