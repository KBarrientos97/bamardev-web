import { describe, expect, it } from "vitest";
import { codigoBloqueaGuardar, conConflicto, esCodigoTomado, limpiarCodigo, limpiarConCursor } from "./codigoCupon";

describe("código del cupón", () => {
  it("queda como se guarda: mayúsculas, sólo A-Z y 0-9, hasta 20", () => {
    expect(limpiarCodigo("verano 20!")).toBe("VERANO20");
    expect(limpiarCodigo("Otoño-10")).toBe("OTONO10");
    expect(limpiarCodigo("promo%10")).toBe("PROMO10");
    expect(limpiarCodigo("x".repeat(30))).toHaveLength(20);
  });

  it("vacío deja guardar (sólo lote); corto, tomado o revisando, no", () => {
    expect(codigoBloqueaGuardar({ estado: "vacio" })).toBe(false);
    expect(codigoBloqueaGuardar({ estado: "libre" })).toBe(false);
    expect(codigoBloqueaGuardar({ estado: "error" })).toBe(false);
    expect(codigoBloqueaGuardar({ estado: "corto" })).toBe(true);
    expect(codigoBloqueaGuardar({ estado: "consultando" })).toBe(true);
    expect(codigoBloqueaGuardar({ estado: "tomado", mensaje: "x" })).toBe(true);
  });

  it("CUP-04: el cursor queda donde se estaba escribiendo", () => {
    expect(limpiarConCursor("QAx-yS2R1", 5)).toEqual({ valor: "QAXYS2R1", cursor: 4 });
    expect(limpiarConCursor("qa s2", 3)).toEqual({ valor: "QAS2", cursor: 2 });
    expect(limpiarConCursor("Ñandú1", 6)).toEqual({ valor: "NANDU1", cursor: 6 });
    expect(limpiarConCursor("abc", null)).toEqual({ valor: "ABC", cursor: 3 });
    const prefijo = (t: string) => limpiarCodigo(t).slice(0, 8);
    expect(limpiarConCursor("ABCDEFGHIJ", 10, prefijo)).toEqual({ valor: "ABCDEFGH", cursor: 8 });
  });

  it("CUP-03: el 409 del alta manda mientras el código sea el mismo", () => {
    const libre = { estado: "libre" } as const;
    const c = { codigo: "VERANO20", mensaje: "Ya existe un cupón VERANO20" };
    expect(conConflicto(libre, "VERANO20", c)).toEqual({ estado: "tomado", mensaje: c.mensaje });
    expect(conConflicto(libre, "VERANO21", c)).toBe(libre);
    expect(conConflicto(libre, "VERANO20", null)).toBe(libre);
    expect(esCodigoTomado(Object.assign(new Error("x"), { codigo: "CUPON_EXISTE" }))).toBe(true);
    expect(esCodigoTomado(new Error("x"))).toBe(false);
    expect(esCodigoTomado(null)).toBe(false);
  });
});
