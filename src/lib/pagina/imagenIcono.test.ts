import { describe, expect, it } from "vitest";
import {
  LADO_ICONO,
  MARGEN_ICONO,
  bordeVacio,
  cajaDelDibujo,
  cuadradoDelCentro,
  encajarEnIcono,
  medidasDeTrabajo,
} from "./imagen";
import { quitarFondo, type Pixeles } from "./quitarFondo";

/**
 * La geometría del ícono propio (contrato §1.5): 512 × 512; sin fondo, el
 * producto recortado y centrado con 32 px de aire; con fondo, el cuadrado del
 * centro. Lo del canvas no se puede probar en jsdom: estas son las cuentas.
 */

type Rgba = [number, number, number, number];

function imagen(ancho: number, alto: number, pintar: (x: number, y: number) => Rgba): Pixeles {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) data.set(pintar(x, y), (y * ancho + x) * 4);
  return { data, width: ancho, height: alto };
}

const VACIO: Rgba = [0, 0, 0, 0];
const ROJO: Rgba = [200, 20, 20, 255];
const BLANCO: Rgba = [255, 255, 255, 255];

describe("prepararIcono: las cuentas", () => {
  it("la foto se achica a 1024 de lado mayor para buscarle el fondo, y nunca se agranda", () => {
    expect(medidasDeTrabajo(4000, 3000)).toEqual({ ancho: 1024, alto: 768 });
    expect(medidasDeTrabajo(3000, 4000)).toEqual({ ancho: 768, alto: 1024 });
    expect(medidasDeTrabajo(600, 400)).toEqual({ ancho: 600, alto: 400 });
  });

  it("un producto alto queda de 448 px de alto, centrado, con 32 px de aire arriba y abajo", () => {
    const d = encajarEnIcono(300, 900);
    expect(d.alto).toBe(LADO_ICONO - 2 * MARGEN_ICONO);
    expect(d.ancho).toBe(149);
    expect(d.y).toBe(MARGEN_ICONO);
    expect(d.x).toBe(Math.round((LADO_ICONO - d.ancho) / 2));
  });

  it("uno ancho, de costado; uno cuadrado llena el lienzo menos el margen", () => {
    expect(encajarEnIcono(800, 200)).toEqual({ x: 32, y: 200, ancho: 448, alto: 112 });
    expect(encajarEnIcono(100, 100)).toEqual({ x: 32, y: 32, ancho: 448, alto: 448 });
  });

  it("uno chico se agranda: todos los íconos se ven del mismo tamaño", () => {
    expect(encajarEnIcono(50, 25)).toEqual({ x: 32, y: 144, ancho: 448, alto: 224 });
  });

  it("con fondo, el cuadrado del centro de la foto (cover)", () => {
    expect(cuadradoDelCentro(1200, 800)).toEqual({ x: 200, y: 0, ancho: 800, alto: 800 });
    expect(cuadradoDelCentro(300, 400)).toEqual({ x: 0, y: 50, ancho: 300, alto: 300 });
    expect(cuadradoDelCentro(500, 500)).toEqual({ x: 0, y: 0, ancho: 500, alto: 500 });
  });

  it("la caja del dibujo es justa: sin margen, lo pone el encaje", () => {
    const p = imagen(40, 30, (x, y) => (x >= 10 && x <= 19 && y >= 5 && y <= 24 ? ROJO : VACIO));
    expect(cajaDelDibujo(p)).toEqual({ x: 10, y: 5, ancho: 10, alto: 20 });
    // Lo casi transparente (una sombra muy suave) no cuenta.
    const sombra = imagen(10, 10, (x, y) => (x === 5 && y === 5 ? [0, 0, 0, 20] : VACIO));
    expect(cajaDelDibujo(sombra)).toBeNull();
  });

  it("un PNG que ya viene sin fondo se reconoce por el borde vacío", () => {
    const recortado = imagen(20, 20, (x, y) => (x > 3 && x < 16 && y > 3 && y < 16 ? ROJO : VACIO));
    expect(bordeVacio(recortado)).toBe(true);
    // Uno que toca un borde (la botella cortada abajo) sigue contando.
    const cortado = imagen(20, 20, (x, y) => (x > 5 && x < 14 && y > 3 ? ROJO : VACIO));
    expect(bordeVacio(cortado)).toBe(true);
    // Una foto (JPG, todo opaco), no.
    expect(bordeVacio(imagen(20, 20, () => BLANCO))).toBe(false);
  });
});

describe("quitarFondo: sólo un fondo liso (la foto de un producto)", () => {
  // Una mesa de madera con vetas alrededor de un vaso: el borde es de pocos
  // colores parecidos y la varita borraba la madera a parches.
  const vasoSobreMesa = () =>
    imagen(300, 300, (x, y) => {
      if (Math.abs(x - 150) < 50 && Math.abs(y - 150) < 80) return ROJO;
      const v = 120 + Math.round(18 * Math.sin(x * 0.7 + y * 1.3) * Math.cos(y * 0.9));
      return [v + 40, v, v - 40, 255];
    });

  it("con el fondo ruidoso no toca nada: queda como foto, con fondo", () => {
    expect(quitarFondo(vasoSobreMesa(), { tolerancia: "segun-ruido", soloFondoLiso: true }).tipo).toBe("sin-cambios");
  });

  it("sin la opción, la varita de siempre sí lo tocaba (lo que se corrige)", () => {
    expect(quitarFondo(vasoSobreMesa(), { tolerancia: "segun-ruido" }).tipo).not.toBe("sin-cambios");
  });

  it("sobre un fondo liso le saca el fondo igual", () => {
    const p = imagen(200, 200, (x, y) => (Math.abs(x - 100) < 30 && Math.abs(y - 100) < 60 ? ROJO : BLANCO));
    expect(quitarFondo(p, { tolerancia: "segun-ruido", soloFondoLiso: true }).tipo).toBe("quitado");
    expect(p.data[3]).toBe(0);
    expect(cajaDelDibujo(p)).toEqual({ x: 71, y: 41, ancho: 59, alto: 119 });
  });
});
