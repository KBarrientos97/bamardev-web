import { describe, expect, it } from "vitest";
import { esTiempoFijoValido, precioTiempoFijo } from "./calculo";
import { opcionesTiempo } from "./ModalTiempo.datos";
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

describe("opcionesTiempo: el tiempo fijo que se ofrece", () => {
  it("sin paquetes igual están 30 min, 1, 2 y 3 h, a tarifa", () => {
    // QA del 13-oct: un tipo sin paquetes sólo mostraba "Otra cantidad", y
    // "Abrir mesa" quedaba en 2 h sin ningún botón marcado. Los 30 min, desde
    // el 27-oct: Miguel vende media hora y lo mínimo era una hora.
    expect(opcionesTiempo(tipo())).toEqual([
      { min: 30, precio: 10, paquete: false, ahorro: 0, especial: false },
      { min: 60, precio: 20, paquete: false, ahorro: 0, especial: false },
      { min: 120, precio: 40, paquete: false, ahorro: 0, especial: false },
      { min: 180, precio: 60, paquete: false, ahorro: 0, especial: false },
    ]);
  });

  it("sin paquete de 2 h, las 2 h siguen estando", () => {
    const t = tipo({ paquetes: [{ min: 180, precio: 50 }] });
    expect(opcionesTiempo(t).map((o) => o.min)).toEqual([30, 60, 120, 180]);
    expect(opcionesTiempo(t).find((o) => o.min === 120)).toMatchObject({ precio: 40, paquete: false });
  });

  it("los paquetes con precio especial se marcan, y los más largos se suman a la lista", () => {
    const t = tipo({ paquetes: [{ min: 180, precio: 50 }, { min: 300, precio: 80 }] });
    expect(opcionesTiempo(t).map((o) => [o.min, o.especial, o.ahorro])).toEqual([
      [30, false, 0],
      [60, false, 0],
      [120, false, 0],
      [180, true, 10],
      [300, true, 20],
    ]);
  });

  it("un paquete de 30 min con precio especial se marca, y uno de 1 h 30 se suma a la lista", () => {
    const t = tipo({ paquetes: [{ min: 30, precio: 8 }, { min: 90, precio: 25 }] });
    expect(opcionesTiempo(t).map((o) => [o.min, o.paquete, o.especial, o.precio])).toEqual([
      [30, true, true, 8],
      // Dos paquetes de 30 min salen menos que la hora a tarifa.
      [60, false, false, 16],
      [90, true, true, 24],
      [120, false, false, 32],
      [180, false, false, 48],
    ]);
  });

  it("un paquete al mismo precio que la tarifa no se marca", () => {
    // El billar de prueba tenía 1 h a 20 y 2 h a 40 con Bs 20/h: los tres
    // botones decían "Paquete" y la marca no ayudaba a elegir.
    const t = tipo({ paquetes: [{ min: 120, precio: 40 }, { min: 180, precio: 55 }] });
    expect(opcionesTiempo(t).map((o) => [o.min, o.paquete, o.especial])).toEqual([
      [30, false, false],
      [60, false, false],
      [120, true, false],
      [180, true, true],
    ]);
  });

  it("el precio es el que cobra el servidor: la combinación de paquetes si conviene", () => {
    // Con un paquete de 1 h más barato que la tarifa, 2 h son dos paquetes.
    const t = tipo({ paquetes: [{ min: 60, precio: 18 }] });
    const dos = opcionesTiempo(t).find((o) => o.min === 120)!;
    expect(dos).toMatchObject({ precio: 36, paquete: false, ahorro: 4, especial: false });
    expect(dos.precio).toBe(precioTiempoFijo(t, 120).precio);
  });

  it("la promo de tiempo fijo baja el precio pero no cuenta como ahorro del paquete (se avisa aparte)", () => {
    const t = tipo({
      paquetes: [{ min: 120, precio: 35 }],
      promos: [{ id: "x", nombre: "Hora feliz", desde: 2, pct: 10, activa: true, fijo: true }],
    });
    expect(opcionesTiempo(t).find((o) => o.min === 120)).toMatchObject({ precio: 31.5, paquete: true, ahorro: 5 });
  });

  it("un paquete fuera de paso (de un backend raro) no se ofrece", () => {
    const t = tipo({ paquetes: [{ min: 45, precio: 12 }] });
    expect(opcionesTiempo(t).map((o) => o.min)).toEqual([30, 60, 120, 180]);
  });
});

describe("esTiempoFijoValido: de media en media hora, de 30 min a 24 h", () => {
  it("acepta 30 min, 1 h 30 y 24 h", () => {
    expect([30, 90, 1440].map(esTiempoFijoValido)).toEqual([true, true, true]);
  });

  it("rechaza menos de 30 min, más de 24 h y lo que no cae en media hora", () => {
    expect([0, 15, 45, 1470].map(esTiempoFijoValido)).toEqual([false, false, false, false]);
  });
});
