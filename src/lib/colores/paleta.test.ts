import { describe, expect, it } from "vitest";
import { contraste } from "../pagina/estilos";
import { colorDeHex, colorParaNuevo, FAMILIAS, PALETA, ROTACION_AGENDA, TONOS } from "./paleta";

describe("la paleta única", () => {
  it("10 familias × 4 tonos, sin repetir clave ni hex", () => {
    expect(PALETA).toHaveLength(FAMILIAS.length * TONOS.length);
    expect(PALETA).toHaveLength(40);
    expect(new Set(PALETA.map((c) => c.clave)).size).toBe(40);
    expect(new Set(PALETA.map((c) => c.hex)).size).toBe(40);
    for (const f of FAMILIAS) {
      expect(PALETA.filter((c) => c.familia === f).map((c) => c.tono)).toEqual([0, 1, 2, 3]);
    }
  });

  it("todos se leen con letra blanca y cada familia va de vivo a profundo", () => {
    for (const c of PALETA) expect([c.clave, contraste(c.hex, "#FFFFFF") >= 4.5]).toEqual([c.clave, true]);
    for (const f of FAMILIAS) {
      const tonos = PALETA.filter((c) => c.familia === f).map((c) => contraste(c.hex, "#FFFFFF"));
      expect([f, tonos.every((t, i) => i === 0 || t > tonos[i - 1])]).toEqual([f, true]);
    }
  });

  it("las 32 claves de antes siguen (ninguna página se migra) y los hex de belleza no cambian", () => {
    const antes = ["VINO", "ROJO", "TEJA", "FRAMBUESA", "ROSA", "CIRUELA", "MAGENTA", "NARANJA", "OCRE", "AMBAR", "MOSTAZA",
      "CAFE", "CHOCOLATE", "ARENA", "OLIVA", "SALVIA", "BOSQUE", "VERDE", "ESMERALDA", "AGUAMARINA", "PETROLEO", "CIELO",
      "AZUL", "MARINO", "INDIGO", "LAVANDA", "VIOLETA", "UVA", "PIZARRA", "ACERO", "CARBON", "NEGRO"];
    expect(PALETA.map((c) => c.clave)).toEqual(expect.arrayContaining(antes));
    expect(colorDeHex("#9b2c6b")?.clave).toBe("CIRUELA");
    expect(colorDeHex("#B5285A")?.clave).toBe("FRAMBUESA");
    expect(colorDeHex("#7357B8")?.clave).toBe("LAVANDA");
    expect(colorDeHex("#4A4744")?.clave).toBe("CARBON");
    // Verde, el de la mayoría de las páginas, tampoco.
    expect(colorDeHex("#0C7A55")?.clave).toBe("VERDE");
  });

  it("la agenda rota por familias distintas, empezando por el default de la columna", () => {
    expect(colorParaNuevo(0)).toBe("#7357B8");
    expect(new Set(ROTACION_AGENDA.map((h) => colorDeHex(h)!.familia)).size).toBe(ROTACION_AGENDA.length);
    expect(colorParaNuevo(ROTACION_AGENDA.length)).toBe(colorParaNuevo(0));
  });
});
