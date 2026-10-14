import { describe, expect, it } from "vitest";
import { precioFijo } from "./calculo";
import { opcionesHoras } from "./ModalTiempo.datos";
import type { TipoMesa } from "./tipos";

const tipo = (extra: Partial<TipoMesa> = {}): TipoMesa => ({
  id: "pool",
  nombre: "Pool",
  tarifa: 20,
  fraccion: 15,
  tolerancia: 3,
  minimo: 30,
  paquetes: [],
  promos: [],
  ...extra,
});

describe("opcionesHoras: el tiempo fijo que se ofrece", () => {
  it("sin paquetes igual están 1, 2 y 3 h, a tarifa", () => {
    // QA del 13-oct: un tipo sin paquetes sólo mostraba "Otra cantidad", y
    // "Abrir mesa" quedaba en 2 h sin ningún botón marcado.
    expect(opcionesHoras(tipo())).toEqual([
      { h: 1, precio: 20, paquete: false, ahorro: 0, especial: false },
      { h: 2, precio: 40, paquete: false, ahorro: 0, especial: false },
      { h: 3, precio: 60, paquete: false, ahorro: 0, especial: false },
    ]);
  });

  it("sin paquete de 2 h, las 2 h siguen estando", () => {
    const t = tipo({ paquetes: [{ h: 3, precio: 50 }] });
    expect(opcionesHoras(t).map((o) => o.h)).toEqual([1, 2, 3]);
    expect(opcionesHoras(t).find((o) => o.h === 2)).toMatchObject({ precio: 40, paquete: false });
  });

  it("los paquetes con precio especial se marcan, y los de más horas se suman a la lista", () => {
    const t = tipo({ paquetes: [{ h: 3, precio: 50 }, { h: 5, precio: 80 }] });
    expect(opcionesHoras(t).map((o) => [o.h, o.especial, o.ahorro])).toEqual([
      [1, false, 0],
      [2, false, 0],
      [3, true, 10],
      [5, true, 20],
    ]);
  });

  it("un paquete al mismo precio que la tarifa no se marca", () => {
    // El billar de prueba tenía 1 h a 20 y 2 h a 40 con Bs 20/h: los tres
    // botones decían "Paquete" y la marca no ayudaba a elegir.
    const t = tipo({ paquetes: [{ h: 2, precio: 40 }, { h: 3, precio: 55 }] });
    expect(opcionesHoras(t).map((o) => [o.h, o.paquete, o.especial])).toEqual([
      [1, false, false],
      [2, true, false],
      [3, true, true],
    ]);
  });

  it("el precio es el que cobra el servidor: la combinación de paquetes si conviene", () => {
    // Con un paquete de 1 h más barato que la tarifa, 2 h son dos paquetes.
    const t = tipo({ paquetes: [{ h: 1, precio: 18 }] });
    const dos = opcionesHoras(t).find((o) => o.h === 2)!;
    expect(dos).toMatchObject({ precio: 36, paquete: false, ahorro: 4, especial: false });
    expect(dos.precio).toBe(precioFijo(t, 2).precio);
  });

  it("la promo de tiempo fijo baja el precio pero no cuenta como ahorro del paquete (se avisa aparte)", () => {
    const t = tipo({
      paquetes: [{ h: 2, precio: 35 }],
      promos: [{ id: "x", nombre: "Hora feliz", desde: 2, pct: 10, activa: true, fijo: true }],
    });
    expect(opcionesHoras(t).find((o) => o.h === 2)).toMatchObject({ precio: 31.5, paquete: true, ahorro: 5 });
  });
});
