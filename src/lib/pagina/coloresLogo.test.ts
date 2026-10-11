import { describe, expect, it } from "vitest";
import { coloresDominantes, muestraMasParecida, muestrasDeColores } from "./coloresLogo";
import type { Muestra } from "./tipos";

/** Las 32 muestras de la página (`pagina/muestras.ts` del backend). */
const MUESTRAS: Muestra[] = [
  ["VINO", "#8C1D3A"], ["ROJO", "#C0262D"], ["TEJA", "#B23A2E"], ["FRAMBUESA", "#B5285A"], ["ROSA", "#BE185D"],
  ["CIRUELA", "#9B2C6B"], ["MAGENTA", "#A21CAF"], ["NARANJA", "#B4501A"], ["OCRE", "#92400E"], ["AMBAR", "#8A5A0B"],
  ["MOSTAZA", "#7A6400"], ["CAFE", "#7C5A45"], ["CHOCOLATE", "#6B3F25"], ["ARENA", "#76684F"], ["OLIVA", "#5B7320"],
  ["SALVIA", "#4D6B53"], ["BOSQUE", "#2F6B3A"], ["VERDE", "#0C7A55"], ["ESMERALDA", "#047857"], ["AGUAMARINA", "#0F766E"],
  ["PETROLEO", "#0F7480"], ["CIELO", "#0369A1"], ["AZUL", "#2565B0"], ["MARINO", "#1E3A8A"], ["INDIGO", "#4B4FB8"],
  ["LAVANDA", "#7357B8"], ["VIOLETA", "#6D28D9"], ["UVA", "#5B2A86"], ["PIZARRA", "#3F5A6B"], ["ACERO", "#475569"],
  ["CARBON", "#4A4744"], ["NEGRO", "#18181B"],
].map(([clave, hex]) => ({ clave, nombre: clave, hex }));

/** Un "ImageData" sintético: cada color con su cantidad de píxeles. */
function pixeles(...partes: [string, number, number?][]): Uint8ClampedArray {
  const total = partes.reduce((s, [, n]) => s + n, 0);
  const datos = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [hex, n, alfa = 255] of partes) {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    for (let j = 0; j < n; j++, i += 4) datos.set([r, g, b, alfa], i);
  }
  return datos;
}

describe("colores del logo", () => {
  it("cuenta los colores ignorando blancos, negros, grises y transparentes", () => {
    const datos = pixeles(
      ["#FFFFFF", 900],
      ["#000000", 500],
      ["#808080", 400],
      ["#E31B23", 300],
      ["#FFC20E", 120],
      ["#1565C0", 0],
      ["#00A651", 200, 0],
    );
    expect(coloresDominantes(datos)).toEqual(["#E31B23", "#FFC20E"]);
  });

  it("de más a menos, como mucho 3, y junta los casi iguales", () => {
    const datos = pixeles(["#1565C0", 500], ["#1666C2", 400], ["#E31B23", 300], ["#FFC20E", 200], ["#00A651", 100]);
    const colores = coloresDominantes(datos);
    expect(colores).toHaveLength(3);
    expect(colores[0]).toMatch(/^#1[56]6[56]C[01]$/);
    expect(colores.slice(1)).toEqual(["#E31B23", "#FFC20E"]);
  });

  it("un logo en blanco y negro no propone nada", () => {
    expect(coloresDominantes(pixeles(["#FFFFFF", 500], ["#111111", 500]))).toEqual([]);
  });

  it("lleva cada color a la muestra del mismo tono, aunque la muestra sea más oscura", () => {
    const de = (hex: string) => muestraMasParecida(hex, MUESTRAS)?.clave;
    expect(["ROJO", "TEJA"]).toContain(de("#E31B23"));
    expect(["MOSTAZA", "AMBAR"]).toContain(de("#FFC20E"));
    expect(["AZUL", "CIELO"]).toContain(de("#1565C0"));
    expect(["VERDE", "ESMERALDA", "BOSQUE"]).toContain(de("#00A651"));
    expect(["VIOLETA", "LAVANDA", "UVA", "INDIGO"]).toContain(de("#7B2CBF"));
    expect(["ROSA", "FRAMBUESA", "MAGENTA"]).toContain(de("#FF4FA3"));
    expect(["NARANJA", "OCRE"]).toContain(de("#F57C00"));
    expect(de("#0C7A55")).toBe("VERDE");
  });

  it("sin repetir: dos rojos parecidos dan una sola muestra", () => {
    expect(muestrasDeColores(["#E31B23", "#D7262E", "#1565C0"], MUESTRAS)).toHaveLength(2);
  });
});
