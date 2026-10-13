import { describe, expect, it } from "vitest";
import type { DescuentosApi } from "../api";
import { claveNombre, hojasDescuentos, porCajero, sinDescuentos, sobreVentas, sumaCantidades } from "./Descuentos.datos";

function reporte(p: Partial<DescuentosApi> = {}): DescuentosApi {
  return {
    totalPerdido: 0,
    totalDescuentos: 0,
    totalAnulado: 0,
    pctConDescuento: 0,
    descuentosPorCajero: [],
    anulacionesPorCajero: [],
    ultimasAnulaciones: [],
    ...p,
  };
}

describe("descuentos: por cajero", () => {
  it("une las dos listas por nombre, sin importar mayúsculas ni espacios", () => {
    // El backend no manda el id del cajero: sólo el nombre.
    const filas = porCajero({
      descuentosPorCajero: [{ cajero: "María F.", monto: 35.86, cantidad: 5 }],
      anulacionesPorCajero: [{ cajero: " maría  f. ", monto: 41, cantidad: 1 }],
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ cajero: "María F.", descuentos: 35.86, tickets: 5, anulado: 41, anuladas: 1 });
  });

  it("un cajero que sólo anuló también aparece", () => {
    const filas = porCajero({
      descuentosPorCajero: [{ cajero: "Ana", monto: 10, cantidad: 2 }],
      anulacionesPorCajero: [{ cajero: "Luis", monto: 125.7, cantidad: 4 }],
    });
    expect(filas.map((f) => f.cajero)).toEqual(["Luis", "Ana"]);
    expect(filas[0]).toMatchObject({ descuentos: 0, tickets: 0, anulado: 125.7 });
  });

  it("el orden es por lo perdido o regalado, el que más primero", () => {
    const filas = porCajero({
      descuentosPorCajero: [
        { cajero: "Ana", monto: 50, cantidad: 2 },
        { cajero: "Luis", monto: 10, cantidad: 1 },
      ],
      anulacionesPorCajero: [{ cajero: "Luis", monto: 60, cantidad: 1 }],
    });
    expect(filas.map((f) => f.cajero)).toEqual(["Luis", "Ana"]);
  });

  it("la clave del nombre ignora espacios de más y mayúsculas", () => {
    expect(claveNombre("  Luis   Mamani ")).toBe("luis mamani");
    expect(claveNombre(null)).toBe("");
  });

  it("suma las cantidades de una lista", () => {
    expect(sumaCantidades([{ cantidad: 5 }, { cantidad: 2 }])).toBe(7);
    expect(sumaCantidades([])).toBe(0);
  });
});

describe("descuentos: el total sobre las ventas", () => {
  it("es lo perdido sobre lo vendido", () => {
    expect(sobreVentas(202.59, 10_000)).toBeCloseTo(0.0203, 4);
  });

  it("sin ventas es null, que se escribe —, no 0 %", () => {
    expect(sobreVentas(50, 0)).toBeNull();
    expect(sobreVentas(0, 0.004)).toBeNull();
  });
});

describe("descuentos: vacío y Excel", () => {
  it("sin promos ni anulaciones el reporte se muestra vacío", () => {
    expect(sinDescuentos(reporte())).toBe(true);
    expect(sinDescuentos(reporte({ totalPerdido: 41, totalAnulado: 41 }))).toBe(false);
  });

  it("las últimas anulaciones van a su hoja sólo si hubo", () => {
    expect(hojasDescuentos(reporte()).map((h) => h.nombre)).toEqual(["Por cajero"]);
    const con = reporte({
      ultimasAnulaciones: [{ fecha: "12 oct · 21:30", idVenta: "V001389", cajero: "María F.", monto: 31, autorizadoPor: "Kevin", motivo: "Mal cobrado" }],
    });
    expect(hojasDescuentos(con).map((h) => h.nombre)).toEqual(["Por cajero", "Últimas anulaciones"]);
  });
});
