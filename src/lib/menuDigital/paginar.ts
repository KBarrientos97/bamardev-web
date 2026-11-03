import type { DisenoMenu, MenuPublicoApi, PantallaMenu, TamanoMenu } from "../../types/menuDigital";

/**
 * Cómo se reparten los platos de una TV del menú en páginas.
 *
 * La TV se dibuja sobre un lienzo fijo de 1600 × 900 (ver TableroMenu), así
 * que cuántos platos entran por página se sabe sin medir nada en pantalla: lo
 * deciden el diseño, el tamaño de letra y las columnas. Si no entra todo, la
 * TV pasa de página cada `rotarSeg` segundos (los puntitos de abajo).
 */

export type PlatoTv = MenuPublicoApi["platos"][number];

export interface BloqueLista {
  categoria: string;
  platos: PlatoTv[];
}

export type PaginaMenu =
  | { diseno: "fotos"; platos: PlatoTv[] }
  | { diseno: "lista"; columnas: BloqueLista[][] }
  | { diseno: "destacado"; heroe: PlatoTv | null; columna: BloqueLista[] };

/** Filas de tarjetas por página en el diseño Fotos. */
export function filasFotos(tamano: TamanoMenu, conFotos: boolean): number {
  if (!conFotos) return tamano === "s" ? 5 : tamano === "m" ? 4 : 3;
  return tamano === "s" ? 3 : 2;
}

/** Renglones por columna en Lista y en la columna del Destacado. */
export function renglones(diseno: DisenoMenu, tamano: TamanoMenu): number {
  const base = tamano === "s" ? 16 : tamano === "m" ? 12 : 10;
  return diseno === "destacado" ? base - 1 : base;
}

/** Lo que ocupa cada cosa en una columna de Lista, en renglones. */
const ALTO_TITULO = 1.6;
const ALTO_DESCRIPCION = 0.55;

function altoPlato(p: PlatoTv, conDescripcion: boolean): number {
  return 1 + (conDescripcion && p.descripcion ? ALTO_DESCRIPCION : 0);
}

/** Los platos en el orden de la TV: por categoría (la que eligió el dueño primero) y por nombre. */
export function ordenar(platos: PlatoTv[], categorias: { id: number; nombre: string }[]): PlatoTv[] {
  const orden = new Map(categorias.map((c, i) => [c.id, i]));
  return [...platos].sort(
    (a, b) =>
      (orden.get(a.categoriaId ?? -1) ?? 999) - (orden.get(b.categoriaId ?? -1) ?? 999) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}

/**
 * Llena columnas de `alto` renglones con los platos agrupados por categoría.
 * Una categoría que no entra entera sigue en la columna siguiente con su
 * título repetido: un plato suelto arriba de una columna, sin título, no se
 * sabe de qué es.
 */
function llenarColumnas(
  platos: PlatoTv[],
  categorias: { id: number; nombre: string }[],
  alto: number,
  conDescripcion: boolean,
): BloqueLista[][] {
  const nombreDe = new Map(categorias.map((c) => [c.id, c.nombre]));
  const columnas: BloqueLista[][] = [];
  let actual: BloqueLista[] = [];
  let usado = 0;
  const cerrar = () => {
    if (actual.length) columnas.push(actual);
    actual = [];
    usado = 0;
  };
  let bloque: BloqueLista | null = null;
  for (const p of platos) {
    const cat = nombreDe.get(p.categoriaId ?? -1) ?? "Otros";
    const h = altoPlato(p, conDescripcion);
    const nuevaCategoria = !bloque || bloque.categoria !== cat;
    const necesita = h + (nuevaCategoria ? ALTO_TITULO : 0);
    if (usado + necesita > alto && usado > 0) {
      cerrar();
      bloque = null;
    }
    if (!bloque || bloque.categoria !== cat) {
      bloque = { categoria: cat, platos: [] };
      actual.push(bloque);
      usado += ALTO_TITULO;
    }
    bloque.platos.push(p);
    usado += h;
  }
  cerrar();
  return columnas;
}

export function paginar(
  pantalla: PantallaMenu,
  platosSinOrden: PlatoTv[],
  categorias: { id: number; nombre: string }[],
): PaginaMenu[] {
  const platos = ordenar(platosSinOrden, categorias);
  const conDescripcion = pantalla.descripciones;

  if (pantalla.diseno === "fotos") {
    const porPagina = Math.max(1, pantalla.columnas * filasFotos(pantalla.tamano, pantalla.fotos));
    const paginas: PaginaMenu[] = [];
    for (let i = 0; i < platos.length; i += porPagina) {
      paginas.push({ diseno: "fotos", platos: platos.slice(i, i + porPagina) });
    }
    return paginas.length ? paginas : [{ diseno: "fotos", platos: [] }];
  }

  if (pantalla.diseno === "lista") {
    const cols = llenarColumnas(platos, categorias, renglones("lista", pantalla.tamano), conDescripcion);
    const paginas: PaginaMenu[] = [];
    for (let i = 0; i < cols.length; i += 2) paginas.push({ diseno: "lista", columnas: cols.slice(i, i + 2) });
    return paginas.length ? paginas : [{ diseno: "lista", columnas: [] }];
  }

  // Destacado: el protagonista queda fijo (el primero marcado, o el primero de
  // la lista) y el resto pasa de página en la columna de al lado.
  const heroe = platos.find((p) => p.destacado) ?? platos[0] ?? null;
  const resto = platos.filter((p) => p !== heroe);
  const cols = llenarColumnas(resto, categorias, renglones("destacado", pantalla.tamano), conDescripcion);
  return cols.length
    ? cols.map((columna) => ({ diseno: "destacado" as const, heroe, columna }))
    : [{ diseno: "destacado", heroe, columna: [] }];
}

/** "18" o "18,50": el precio de la TV, sin centavos cuando no los tiene. */
export function precioTv(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

/** El símbolo de la moneda que va chiquito delante del precio. */
export function simboloMoneda(moneda?: string): string {
  if (moneda === "USD") return "$";
  if (moneda === "PEN") return "S/";
  return "Bs";
}

/**
 * Los platos que muestra una TV, con la misma regla que el backend
 * (`menuPublico`): los que están en el menú, no escondidos en esta TV, de sus
 * categorías (ninguna elegida = todas) y, si la TV no tacha los agotados, sin
 * ellos. La vista previa del editor tiene que mostrar lo mismo que la TV.
 */
export function platosDeLaPantalla(
  pantalla: PantallaMenu,
  platos: (PlatoTv & { enMenu: boolean })[],
  categorias: { id: number; nombre: string }[],
): { platos: PlatoTv[]; categorias: { id: number; nombre: string }[] } {
  const cats = new Set(pantalla.categorias);
  const ocultos = new Set(pantalla.ocultos);
  const visibles = platos.filter(
    (p) =>
      p.enMenu &&
      !ocultos.has(p.id) &&
      (cats.size === 0 || (p.categoriaId != null && cats.has(p.categoriaId))) &&
      (pantalla.agotadosTachados || !p.agotado),
  );
  const usadas = new Set(visibles.map((p) => p.categoriaId));
  const posicion = (id: number) => {
    const i = pantalla.categorias.indexOf(id);
    return i < 0 ? 10_000 + id : i;
  };
  return {
    platos: visibles,
    categorias: categorias.filter((c) => usadas.has(c.id)).sort((a, b) => posicion(a.id) - posicion(b.id)),
  };
}
