import { describe, expect, it } from "vitest";
import type { RegistroDeEfectivo } from "../../types";
import { efectivoDelCierre } from "./efectivoDelCierre";

const reg = (
  id: number,
  codigo: RegistroDeEfectivo["codigo"],
  tipo: RegistroDeEfectivo["tipo"],
  monto: number,
  extra: Partial<RegistroDeEfectivo> = {},
): RegistroDeEfectivo => ({
  id,
  codigo,
  tipo,
  monto,
  descripcion: codigo === "CENA" ? "Cena" : "Retiro",
  fecha: "2026-10-25T23:00:00Z",
  quien: "Miguel",
  anulado: null,
  ...extra,
});

describe("el efectivo del cierre del billar", () => {
  it("sin movimientos con motivo, la cuenta es la de antes: la cena aparte y el resto en otros", () => {
    const e = efectivoDelCierre({ ingresos: 50, egresos: 80, cenasSalidas: 30, cenasDevueltas: 10 });
    expect(e).toEqual({ otrosIngresos: 40, otrosEgresos: 50, cenaNeta: 20, filas: [] });
  });

  it("cada movimiento con motivo sale en su renglón y no queda dentro de los otros", () => {
    const e = efectivoDelCierre({
      // Entraron 100 de sencillo + 20 que devolvió la cena anulada + 5 sin motivo.
      ingresos: 125,
      // Salieron 20 + 20 de cenas, 30 de hielo, 300 de un retiro y 8 sin motivo.
      egresos: 378,
      cenasSalidas: 40,
      cenasDevueltas: 20,
      efectivoRegistros: [
        reg(1, "CENA", "EGRESO", 20, { anulado: { id: 9, quien: "Kevin", fecha: "2026-10-25T23:10:00Z" } }),
        reg(2, "CENA", "EGRESO", 20),
        reg(3, "GASTO", "EGRESO", 30, { descripcion: "Hielo" }),
        reg(4, "RETIRO", "EGRESO", 300, { descripcion: "Retiro" }),
        reg(5, "SENCILLO", "INGRESO", 100, { descripcion: "Sencillo" }),
      ],
    });
    expect(e.otrosIngresos).toBe(5);
    expect(e.otrosEgresos).toBe(8);
    expect(e.cenaNeta).toBe(20);
    expect(e.filas.map((f) => [f.etiqueta, f.valor])).toEqual([
      ["Gasto · Hielo", -30],
      ["Retiro", -300],
      ["Sencillo", 100],
    ]);
    expect(e.filas[0].quien).toBe("Miguel");
  });

  it("lo anulado no se muestra: el movimiento y su anulación se cancelan", () => {
    const e = efectivoDelCierre({
      ingresos: 30,
      egresos: 30,
      efectivoRegistros: [
        reg(3, "GASTO", "EGRESO", 30, {
          descripcion: "Hielo",
          anulado: { id: 4, quien: "Miguel", fecha: "2026-10-25T23:05:00Z" },
        }),
      ],
    });
    expect(e).toEqual({ otrosIngresos: 0, otrosEgresos: 0, cenaNeta: 0, filas: [] });
  });

  it("las propinas de belleza siguen afuera de los otros", () => {
    const e = efectivoDelCierre({ ingresos: 70, egresos: 40, propinasEfectivo: 50, propinasSalidas: 40 });
    expect(e.otrosIngresos).toBe(20);
    expect(e.otrosEgresos).toBe(0);
  });
});
