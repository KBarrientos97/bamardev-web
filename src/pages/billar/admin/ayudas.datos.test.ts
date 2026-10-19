import { describe, expect, it } from "vitest";
import type { TipoMesa } from "../tipos";
import {
  bloque,
  ejemploCobro,
  ejemploConCentavos,
  ejemploExcedente,
  ejemploMinimo,
  ejemploPaquete,
  ejemploPromo,
  ejemplosFraccion,
  ejemplosTolerancia,
  minimoEfectivo,
} from "./ayudas.datos";

const POOL: TipoMesa = {
  id: "pool",
  nombre: "Pool",
  tarifa: 20,
  fraccion: 15,
  tolerancia: 3,
  minimo: 30,
  paquetes: [
    { h: 1, precio: 20 },
    { h: 2, precio: 40 },
    { h: 3, precio: 55 },
  ],
  promos: [],
};

const POR_MINUTO: TipoMesa = { ...POOL, fraccion: 1, tolerancia: 0 };

describe("ayudas de Tarifas y paquetes", () => {
  it("la fracción se explica con la tolerancia cargada: en la tolerancia no sube, un minuto después sí", () => {
    expect(ejemplosFraccion(POOL)).toEqual([
      { juegan: "1:03", cobra: "1:00", bs: "Bs 20,00" },
      { juegan: "1:04", cobra: "1:15", bs: "Bs 25,00" },
      { juegan: "1:19", cobra: "1:30", bs: "Bs 30,00" },
    ]);
  });

  it("por minuto el ejemplo muestra los centavos que después aparecen en el simulador", () => {
    expect(ejemplosFraccion(POR_MINUTO)).toEqual([
      { juegan: "1:00", cobra: "1:00", bs: "Bs 20,00" },
      { juegan: "1:34", cobra: "1:34", bs: "Bs 31,33" },
    ]);
  });

  it("un mínimo más largo que la hora corre los ejemplos para que no tape el redondeo", () => {
    const largo = { ...POOL, minimo: 90 };
    expect(ejemplosFraccion(largo)[1]).toEqual({ juegan: "1:34", cobra: "1:45", bs: "Bs 35,00" });
  });

  it("el ejemplo del redondeo no suma la promo: la promo tiene su propia ayuda", () => {
    const conPromo = { ...POOL, promos: [{ id: "p", nombre: "Promo 1 h", desde: 1, pct: 50, activa: true, fijo: false }] };
    expect(ejemploCobro(conPromo, 64).bs).toBe("Bs 25,00");
  });

  it("avisa cuando cada bloque tiene centavos que no se pueden dar en monedas, y sugiere la fracción redonda", () => {
    // Bs 20 la hora por minuto: el minuto vale Bs 0,333… y 1:34 sale Bs 31,33.
    expect(bloque(POR_MINUTO)).toEqual({ bs: 0.33, conCentavos: true, redonda: { fraccion: 15, bs: 5 } });
    expect(bloque(POOL)).toEqual({ bs: 5, conCentavos: false, redonda: null });
    expect(bloque({ ...POOL, tarifa: 25 })).toEqual({ bs: 6.25, conCentavos: true, redonda: { fraccion: 30, bs: 12.5 } });
    // Bs 24 la hora: el minuto vale Bs 0,40, que sí se paga justo.
    expect(bloque({ ...POR_MINUTO, tarifa: 24 }).conCentavos).toBe(false);
  });

  it("el ejemplo del aviso de centavos es uno que de verdad no se paga justo", () => {
    // A Bs 25 de a 15 min, 1:30 sale Bs 37,50 (se paga justo); 1:15, Bs 31,25 (no).
    expect(ejemploConCentavos({ ...POOL, tarifa: 25 })).toBe("Bs 31,25");
    expect(ejemploConCentavos(POR_MINUTO)).toBe("Bs 31,33");
    expect(ejemploConCentavos(POOL)).toBeNull();
  });

  it("la tolerancia no tiene ejemplo cobrando por minuto, porque no existe", () => {
    expect(ejemplosTolerancia(POR_MINUTO)).toBeNull();
    expect(ejemplosTolerancia(POOL)).toEqual({
      dentro: { juegan: "1:03", cobra: "1:00", bs: "Bs 20,00" },
      pasado: { juegan: "1:04", cobra: "1:15", bs: "Bs 25,00" },
    });
  });

  it("un mínimo que no es justo de bloques se cobra completando el bloque", () => {
    expect(minimoEfectivo({ minimo: 20, fraccion: 15 })).toBe(30);
    expect(minimoEfectivo({ minimo: 30, fraccion: 15 })).toBe(30);
    expect(minimoEfectivo({ minimo: 0, fraccion: 15 })).toBe(0);
    expect(minimoEfectivo({ minimo: 7, fraccion: 1 })).toBe(7);
    // Es lo que cobra la mesa: 10 min con mínimo 20 y fracción 15 salen 30 min.
    expect(ejemploMinimo({ ...POOL, minimo: 20 })).toEqual({ juegan: "0:10", cobra: "0:30", bs: "Bs 10,00" });
  });

  it("una partida corta muestra el mínimo", () => {
    expect(ejemploMinimo(POOL)).toEqual({ juegan: "0:10", cobra: "0:30", bs: "Bs 10,00" });
    expect(ejemploMinimo({ ...POOL, minimo: 0 })).toEqual({ juegan: "0:10", cobra: "0:15", bs: "Bs 5,00" });
  });

  it("los paquetes se explican con una cantidad que arma la combinación más barata", () => {
    expect(ejemploPaquete(POOL)).toEqual({ horas: 4, partes: "3 h + 1 h", bs: "Bs 75,00", promo: null });
    expect(ejemploPaquete({ ...POOL, paquetes: [] })).toEqual({ horas: 2, partes: "2 h sueltas", bs: "Bs 40,00", promo: null });
  });

  it("lo que se pasa del tiempo fijo se cobra por fracción y sin mínimo", () => {
    expect(ejemploExcedente(POOL)).toEqual({ juegan: "0:10", cobra: "0:15", bs: "Bs 5,00" });
  });

  it("la promo se explica con la primera que se alcanza, y sin promos activas no hay ejemplo", () => {
    const promo = { id: "p", nombre: "Promo 3 h o más", desde: 3, pct: 10, activa: true, fijo: false };
    expect(ejemploPromo({ ...POOL, promos: [promo] })).toEqual({
      nombre: "Promo 3 h o más",
      pct: "10",
      juegan: "3:30",
      cobra: "3:30",
      bruto: "Bs 70,00",
      total: "Bs 63,00",
    });
    expect(ejemploPromo({ ...POOL, promos: [{ ...promo, activa: false }] })).toBeNull();
  });
});
