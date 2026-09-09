import arroz from "../assets/articulos/ic_art_arroz.webp";
import comboPolloSoda from "../assets/articulos/ic_art_combo_pollo_soda.webp";
import cuartoPolloBrasa from "../assets/articulos/ic_art_cuarto_pollo_brasa.webp";
import cuartoPolloBroaster from "../assets/articulos/ic_art_cuarto_pollo_broaster.webp";
import economicoPolloBrasa from "../assets/articulos/ic_art_economico_pollo_brasa.webp";
import economicoPolloBroaster from "../assets/articulos/ic_art_economico_pollo_broaster.webp";
import hamburguesa from "../assets/articulos/ic_art_hamburguesa.webp";
import hamburguesaSoda from "../assets/articulos/ic_art_hamburguesa_soda.webp";
import jugos from "../assets/articulos/ic_art_jugos.webp";
import medioPolloBrasa from "../assets/articulos/ic_art_medio_pollo_brasa.webp";
import medioPolloBroaster from "../assets/articulos/ic_art_medio_pollo_broaster.webp";
import papasFritas from "../assets/articulos/ic_art_papas_fritas.webp";
import polloEnteroBrasa from "../assets/articulos/ic_art_pollo_entero_brasa.webp";
import polloEnteroBroaster from "../assets/articulos/ic_art_pollo_entero_broaster.webp";
import salchipapas from "../assets/articulos/ic_art_salchipapas.webp";
import soda from "../assets/articulos/ic_art_soda.webp";

/**
 * Un ícono elegible para un artículo. El backend guarda sólo la `llave`
 * (String); acá la resolvemos a la imagen local y a una `etiqueta` legible para
 * la grilla selectora.
 *
 * Port de `IconoArticulo.kt` (Android). Las llaves son las MISMAS: un artículo
 * con ícono puesto desde la app tiene que verse igual en la web, y al revés.
 */
export interface IconoArticulo {
  llave: string;
  src: string;
  etiqueta: string;
}

/**
 * Catálogo de íconos de artículo. Es la fuente única de verdad: la grilla del
 * formulario, el listado de Artículos y el POS resuelven la llave contra esta
 * tabla.
 *
 * Para sumar un ícono nuevo: dejá el archivo como `ic_art_<llave>.webp` en
 * `src/assets/articulos` y agregá una línea acá — y la equivalente en Android,
 * o el artículo se verá con monograma en la otra plataforma. Los íconos son de
 * Flaticon (ver Créditos y Licencias en la app).
 *
 * Vienen en WebP y no en PNG como en Android: son las mismas imágenes, pero los
 * PNG originales pesaban 3.7 MB y acá se descargan por red en cada visita.
 */
export const ICONOS_ARTICULO: IconoArticulo[] = [
  // Pollo broaster
  { llave: "economico_pollo_broaster", src: economicoPolloBroaster, etiqueta: "Broaster económico" },
  { llave: "cuarto_pollo_broaster", src: cuartoPolloBroaster, etiqueta: "Broaster cuarto" },
  { llave: "medio_pollo_broaster", src: medioPolloBroaster, etiqueta: "Broaster medio" },
  { llave: "pollo_entero_broaster", src: polloEnteroBroaster, etiqueta: "Broaster entero" },
  // Pollo a la brasa
  { llave: "economico_pollo_brasa", src: economicoPolloBrasa, etiqueta: "Brasa económico" },
  { llave: "cuarto_pollo_brasa", src: cuartoPolloBrasa, etiqueta: "Brasa cuarto" },
  { llave: "medio_pollo_brasa", src: medioPolloBrasa, etiqueta: "Brasa medio" },
  { llave: "pollo_entero_brasa", src: polloEnteroBrasa, etiqueta: "Brasa entero" },
  // Combos
  { llave: "combo_pollo_soda", src: comboPolloSoda, etiqueta: "Combo pollo + soda" },
  // Comidas
  { llave: "hamburguesa", src: hamburguesa, etiqueta: "Hamburguesa" },
  { llave: "hamburguesa_soda", src: hamburguesaSoda, etiqueta: "Hamburguesa + soda" },
  { llave: "salchipapas", src: salchipapas, etiqueta: "Salchipapas" },
  { llave: "papas_fritas", src: papasFritas, etiqueta: "Papas fritas" },
  { llave: "arroz", src: arroz, etiqueta: "Arroz" },
  // Bebidas
  { llave: "soda", src: soda, etiqueta: "Soda / gaseosa" },
  { llave: "jugos", src: jugos, etiqueta: "Jugos" },
];

const POR_LLAVE = new Map(ICONOS_ARTICULO.map((i) => [i.llave, i]));

/** El ícono con esa llave, o null si es vacía o desconocida. */
export function iconoPorLlave(llave: string | null | undefined): IconoArticulo | null {
  if (!llave || !llave.trim()) return null;
  return POR_LLAVE.get(llave) ?? null;
}

/**
 * Palabras a ignorar al calcular las iniciales de un producto: artículos,
 * conectores y abreviaturas de tamaño que no aportan al "logo" del producto.
 */
const MONOGRAMA_STOPWORDS = new Set([
  "de", "con", "sin", "la", "el", "y", "del", "al",
  "1l", "1/4", "1/2", "3/4",
  "500ml", "250ml", "355ml", "330ml", "1lt",
  "8u", "6u", "12u", "u",
]);

/**
 * Iniciales del producto para el monograma, cuando no tiene ícono elegido.
 *
 * - 2+ palabras significativas → primera letra de las 2 primeras.
 * - 1 palabra → sus 2 primeras letras.
 * - Vacío o sólo símbolos → primera letra del nombre original.
 *
 * Ejemplos: "Coca-Cola Lata" → "CC", "Agua sin gas 500ml" → "AG",
 * "Pollo Broaster 1/4" → "PB", "Hamburguesa Clásica" → "HC".
 */
export function inicialesDe(nombre: string): string {
  const limpio = nombre.replace(/[()]/g, "");
  const palabras = limpio
    .split(/[\s-]+/)
    .filter((p) => !MONOGRAMA_STOPWORDS.has(p.toLowerCase()) && /\p{L}/u.test(p));

  if (palabras.length >= 2) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  if (palabras.length === 1) {
    return palabras[0].slice(0, 2).toUpperCase();
  }
  return nombre.trim()[0]?.toUpperCase() ?? "?";
}

/** Fondo y texto del monograma. */
export interface ColorCategoria {
  bg: string;
  fg: string;
}

/**
 * Color del monograma según la categoría, con match sin distinguir mayúsculas
 * contra los nombres canónicos. Cualquier categoría no listada cae al verde por
 * defecto. Mismos valores que `colors.xml` de la app.
 */
export function colorDeCategoria(categoria: string | null | undefined): ColorCategoria {
  switch ((categoria ?? "").trim().toLowerCase()) {
    case "hamburguesas":
      return { bg: "#FEF3C7", fg: "#B45309" };
    case "pollo":
      return { bg: "#FFE4E6", fg: "#BE123C" };
    case "pizza":
    case "pizzas":
      return { bg: "#FEE2E2", fg: "#B91C1C" };
    case "bebidas":
      return { bg: "#DBEAFE", fg: "#1D4ED8" };
    case "acompañamientos":
    case "acompanamientos":
      return { bg: "#D1FAE5", fg: "#047857" };
    case "postres":
      return { bg: "#EDE9FE", fg: "#6D28D9" };
    case "combos":
      return { bg: "#FFE4E6", fg: "#BE123C" };
    case "helados":
      return { bg: "#EDE9FE", fg: "#6D28D9" };
    default:
      return { bg: "#D1FAE5", fg: "#047857" };
  }
}
