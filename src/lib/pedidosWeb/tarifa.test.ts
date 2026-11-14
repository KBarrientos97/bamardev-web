import { describe, expect, it } from "vitest";
import { calcularEnvio, dentroDeZona, distanciaEntregaKm, haversineKm, TARIFA_POR_DEFECTO } from "./tarifa";

/**
 * La cuenta del §3 del contrato. Los mismos casos viven en el spec del
 * backend (`src/pedidos-web/tarifa.spec.ts`): si uno cambia, cambian los dos.
 */
describe("tarifa de envío", () => {
  it.each([
    [0.5, 7],
    [1.5, 7],
    [2, 7],
    [3, 9],
    [5, 13],
    [8, 18],
  ])("%s km = Bs %s", (km, bs) => {
    expect(calcularEnvio(km)).toBe(bs);
  });

  it("12 km son 22,50 y «hacia arriba al boliviano» da 23", () => {
    expect(calcularEnvio(12)).toBe(23);
  });

  it("12,01 km queda fuera de la zona", () => {
    expect(dentroDeZona(12, TARIFA_POR_DEFECTO)).toBe(true);
    expect(dentroDeZona(12.01, TARIFA_POR_DEFECTO)).toBe(false);
    expect(calcularEnvio(12.01)).toBeNull();
  });

  it("usa la tarifa propia del negocio: otros tramos y otro máximo", () => {
    const tarifa = { tramos: [{ hastaKm: 1, base: 5 }, { hastaKm: null, porKm: 3 }], maxKm: 4 };
    expect(calcularEnvio(1, tarifa)).toBe(5);
    expect(calcularEnvio(2.5, tarifa)).toBe(10); // 5 + 1,5 × 3 = 9,5 → 10
    expect(calcularEnvio(4.1, tarifa)).toBeNull();
  });

  it("no se sube un boliviano por un error de coma flotante", () => {
    // 7 + 3 × 2 = 13 justo.
    expect(calcularEnvio(5)).toBe(13);
    expect(calcularEnvio(5.0000000001)).toBe(13);
  });

  it("una distancia inválida no da precio", () => {
    expect(calcularEnvio(NaN)).toBeNull();
    expect(calcularEnvio(-1)).toBeNull();
  });
});

describe("distancia", () => {
  const plaza = { latitud: -17.7834, longitud: -63.1821 };

  it("la misma posición está a 0", () => {
    expect(haversineKm(plaza, plaza)).toBe(0);
  });

  it("un grado de latitud son ~111,19 km", () => {
    const d = haversineKm(plaza, { latitud: plaza.latitud + 1, longitud: plaza.longitud });
    expect(d).toBeGreaterThan(111.1);
    expect(d).toBeLessThan(111.3);
  });

  it("la distancia de entrega es la recta por 1,3, a 2 decimales", () => {
    const pin = { latitud: plaza.latitud + 0.01, longitud: plaza.longitud };
    const recta = haversineKm(plaza, pin);
    expect(distanciaEntregaKm(plaza, pin)).toBe(Math.round(recta * 1.3 * 100) / 100);
    expect(distanciaEntregaKm(plaza, pin)).toBeCloseTo(1.45, 1);
  });
});
