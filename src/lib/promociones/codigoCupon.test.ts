import { describe, expect, it } from "vitest";
import { codigoBloqueaGuardar, limpiarCodigo } from "./codigoCupon";

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
});
