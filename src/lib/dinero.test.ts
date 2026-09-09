import { describe, expect, it } from "vitest";
import {
  aCentavos,
  cubre,
  esCero,
  esPositivo,
  excede,
  parsearMonto,
  parsearMontoO,
  restoEnEfectivo,
  vuelto,
} from "./dinero";

describe("restoEnEfectivo", () => {
  it("no deja basura de punto flotante en el monto del pago", () => {
    // El caso que estaba mal: se guardaba 66.72999999999999 en la fila del
    // pago y el desvío se acumulaba turno a turno en el arqueo.
    expect(100.1 - 33.37).not.toBe(66.73);
    expect(restoEnEfectivo(100.1, 33.37)).toBe(66.73);
  });

  it("los dos pagos siguen sumando el total", () => {
    // Es lo que valida el backend: si no cuadra, rechaza la venta entera.
    const total = 87.65;
    const qr = 30.33;
    expect(qr + restoEnEfectivo(total, qr)).toBeCloseTo(total, 2);
  });

  it("nunca devuelve negativo si el QR cubre de más", () => {
    expect(restoEnEfectivo(50, 80)).toBe(0);
  });
});

describe("vuelto", () => {
  it("se calcula sobre lo que el cliente entrega en mano", () => {
    // Delivery de Bs 50 + Bs 8 de envío: el repartidor pide 58, no 50. Con el
    // total de productos le devolvía Bs 8 de más.
    expect(vuelto(60, 58)).toBe(2);
  });

  it("no hay vuelto si lo recibido no alcanza", () => {
    expect(vuelto(40, 58)).toBe(0);
  });

  it("redondea a centavos", () => {
    expect(vuelto(100, 33.33)).toBe(66.67);
  });
});

describe("aCentavos", () => {
  it("redondea a dos decimales", () => {
    expect(aCentavos(66.72999999999999)).toBe(66.73);
    expect(aCentavos(0.1 + 0.2)).toBe(0.3);
  });
});

describe("tolerancia de centavos", () => {
  it("3 x 8.90 no deja al cajero faltando Bs 0.00", () => {
    // 26.700000000000003: con `>=` pelado el botón de cobrar quedaba bloqueado.
    const total = 8.9 * 3;
    expect(total > 26.7).toBe(true);
    expect(cubre(26.7, total)).toBe(true);
  });

  it("un residuo binario no es un monto a cobrar", () => {
    expect(esCero(3.6e-15)).toBe(true);
    expect(esPositivo(3.6e-15)).toBe(false);
    expect(esPositivo(0.01)).toBe(true);
  });

  it("excede distingue una diferencia real de un residuo", () => {
    expect(excede(26.700000000000003, 26.7)).toBe(false);
    expect(excede(26.71, 26.7)).toBe(true);
  });

  it("acepta la coma decimal que se teclea en Bolivia", () => {
    // Number("150,50") da NaN y el `|| 0` lo convertía en un 0 silencioso: el
    // conteo del cierre quedaba en cero con un faltante enorme.
    expect(parsearMonto("150,50")).toBe(150.5);
    expect(parsearMonto("150.50")).toBe(150.5);
    expect(parsearMontoO("150,50")).toBe(150.5);
  });

  it("distingue un texto inválido de un cero legítimo", () => {
    expect(parsearMonto("abc")).toBeNull();
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto(null)).toBeNull();
    expect(parsearMonto("0")).toBe(0);
    expect(parsearMontoO("abc", 7)).toBe(7);
  });
});
