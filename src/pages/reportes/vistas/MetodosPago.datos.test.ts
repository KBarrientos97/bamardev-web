import { describe, expect, it } from "vitest";
import { armarFilas, colorMetodo } from "./MetodosPago.datos";

describe("las filas de métodos de pago", () => {
  it("lo fiado va como una porción más, y los porcentajes son sobre todo lo que entró y se fió", () => {
    const filas = armarFilas(
      [
        { nombre: "Efectivo", monto: 600, porcentaje: 60, cantidad: 10 },
        { nombre: "QR", monto: 300, porcentaje: 30, cantidad: 5 },
      ],
      null,
      100,
    );
    expect(filas.map((f) => [f.nombre, Math.round(f.fraccion * 100)])).toEqual([
      ["Efectivo", 60],
      ["QR", 30],
      ["Fiado", 10],
    ]);
    expect(filas[2].esFiado).toBe(true);
  });

  it("la flecha compara contra lo cobrado con ese mismo método antes; sin cobros antes no hay flecha", () => {
    const filas = armarFilas(
      [
        { nombre: "Efectivo", monto: 600, porcentaje: 60 },
        { nombre: "Tarjeta", monto: 50, porcentaje: 5 },
      ],
      [{ nombre: "Efectivo", monto: 500, porcentaje: 100 }],
      0,
    );
    expect(filas[0].delta).toBeCloseTo(0.2);
    // Antes no se cobró con tarjeta: un "+∞ %" no es un dato.
    expect(filas[1].delta).toBeNull();
  });

  it("un método sin plata no ocupa lugar en la dona", () => {
    expect(armarFilas([{ nombre: "Transferencia", monto: 0, porcentaje: 0 }], null, 0)).toEqual([]);
  });

  it("el efectivo es verde y el fiado ámbar en todos los reportes", () => {
    expect(colorMetodo("Efectivo", 3)).toBe("#10B981");
    expect(colorMetodo("Fiado", 0)).toBe("#F59E0B");
  });
});
