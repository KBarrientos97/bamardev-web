import { describe, expect, it } from "vitest";
import { TEMAS, type Tema } from "./temas";

/**
 * Contraste de los temas, medido — no mirado.
 *
 * El color de marca casi nunca sirve de fondo para texto blanco: el verde
 * #10b981 da 2.54:1 cuando el mínimo legible (WCAG AA) es 4.5. Se notaba poco
 * en un monitor bueno y bastante en un celular barato a pleno sol, que es
 * donde trabaja un cajero. Por eso cada tema trae un tono aparte para el botón.
 *
 * Estos tests existen para que agregar un rubro nuevo no reintroduzca el
 * problema: si alguien copia un tema y le pone su color de marca en `boton`,
 * acá se entera.
 */

/** Luminancia relativa (WCAG 2.x). */
function luminancia(hex: string): number {
  const canales = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

/** Razón de contraste entre dos colores: de 1 (igual) a 21 (blanco/negro). */
function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const BLANCO = "#ffffff";
/** Mínimo de WCAG AA para texto normal. */
const AA = 4.5;

const entradas = Object.entries(TEMAS) as [string, Tema][];

describe("contraste de los temas", () => {
  it.each(entradas)(
    "%s: el botón principal es legible con texto blanco",
    (_rubro, tema) => {
      expect(contraste(tema.boton, BLANCO)).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(entradas)(
    "%s: el botón sigue legible al pasar el mouse y al pulsarlo",
    (_rubro, tema) => {
      // Los dos estados son más oscuros que el normal, así que si el normal
      // pasa, estos también — salvo que alguien los defina al revés.
      expect(contraste(tema.botonHover, BLANCO)).toBeGreaterThanOrEqual(AA);
      expect(contraste(tema.botonActivo, BLANCO)).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(entradas)(
    "%s: hover y pulsado se distinguen del botón normal",
    (_rubro, tema) => {
      // Si los tres tonos fueran casi iguales, el botón no daría feedback al
      // tocarlo. 1.08 es poco pero perceptible en un bloque de color grande.
      expect(contraste(tema.boton, tema.botonHover)).toBeGreaterThan(1.08);
      expect(contraste(tema.botonHover, tema.botonActivo)).toBeGreaterThan(1.08);
    },
  );

  it.each(entradas)(
    "%s: el chip suave (primary-700 sobre primary-50) es legible",
    (_rubro, tema) => {
      expect(contraste(tema.primary700, tema.primary50)).toBeGreaterThanOrEqual(AA);
    },
  );
});

describe("barra lateral sólida", () => {
  it.each(entradas)(
    "%s: el ítem activo (blanco sobre la barra) se lee",
    (_rubro, tema) => {
      expect(contraste(tema.barra, "#ffffff")).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(entradas)(
    "%s: los ítems inactivos también se leen",
    (_rubro, tema) => {
      // Éste es el que obligó a usar un tono más profundo que el de marca:
      // sobre el verde #10b981 este texto daba 2.10:1.
      expect(contraste(tema.barra, tema.barraTexto2)).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(entradas)(
    "%s: el ítem activo se distingue del fondo de la barra",
    (_rubro, tema) => {
      // Si el bloque del activo fuera casi igual al fondo, no se sabría en qué
      // pantalla estás. Poco contraste basta en un bloque grande, pero no cero.
      expect(contraste(tema.barra, tema.barraActivo)).toBeGreaterThan(1.15);
    },
  );

  it.each(entradas)(
    "%s: el texto blanco sigue leyéndose sobre el ítem activo",
    (_rubro, tema) => {
      expect(contraste(tema.barraActivo, "#ffffff")).toBeGreaterThanOrEqual(AA);
    },
  );
});

describe("forma de los temas", () => {
  it("todos definen los mismos tonos", () => {
    const claves = [
      "primary", "primary600", "primary700",
      "primary50", "primary100", "primary200",
      "boton", "botonHover", "botonActivo",
      "barra", "barraActivo", "barraTexto2", "marca",
    ];
    for (const [rubro, tema] of entradas) {
      for (const clave of claves) {
        expect(tema, `${rubro} no define ${clave}`).toHaveProperty(clave);
      }
    }
  });

  it("los colores son hex de 6 dígitos", () => {
    // `aplicarTema` los escribe crudos en variables CSS: un valor mal formado
    // no falla, simplemente deja la pantalla sin color.
    for (const [rubro, tema] of entradas) {
      const colores = [
        tema.primary, tema.primary600, tema.primary700,
        tema.primary50, tema.primary100, tema.primary200,
        tema.boton, tema.botonHover, tema.botonActivo,
        tema.barra, tema.barraActivo, tema.barraTexto2,
        ...tema.marca,
      ];
      for (const c of colores) {
        expect(c, `${rubro}: ${c}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it("restaurante y minimarket comparten el verde de siempre", () => {
    // Decisión de producto: a los clientes actuales no se les cambia el color.
    expect(TEMAS.RESTAURANTE).toBe(TEMAS.MINIMARKET);
    expect(TEMAS.RESTAURANTE.primary).toBe("#10b981");
  });
});
