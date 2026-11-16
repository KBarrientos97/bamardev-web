/**
 * Las herramientas para ordenar «Mis productos» (16-nov): «Alfabético» y «Por
 * categoría» reacomodan la lista de una vez y la guardan como cualquier otro
 * cambio de orden; después el dueño sigue afinando con las flechas de cada
 * producto. No hay un «modo» guardado: el orden es uno solo, el de la lista.
 *
 * Todo puro (sin React), para probarlo solo.
 */

/** Cómo se llama el grupo de los productos que no tienen categoría. */
export const SIN_CATEGORIA = "Sin categoría";

/** Lo que mira el orden de cada producto fijado. */
export interface ParaOrdenar {
  id: number;
  nombre: string;
  categoria: string | null;
  /** Plato, servicio, combo (no se guarda en stock). Un backend anterior no lo manda. */
  elaborado?: boolean;
}

/** Una categoría de la lista: la clave es el nombre limpio, o null = sin categoría. */
export interface CategoriaFijada {
  clave: string | null;
  nombre: string;
  cantidad: number;
  /** La mitad o más de sus productos fijados son elaborados. */
  elaborada: boolean;
}

/** «Dentro de cada categoría»: como están ahora, o de la A a la Z. */
export type DentroDeCategoria = "actual" | "alfabetico";

/**
 * Alfabético como lo lee una persona: sin mirar mayúsculas ni tildes
 * («Ají» junto a «aji»), y los números por su valor («Soda 2 L» antes que
 * «Soda 10 L»).
 */
export function compararNombres(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

/** La categoría como clave: el nombre sin espacios de más; vacía o null = sin categoría. */
export function claveCategoria(categoria: string | null | undefined): string | null {
  const limpia = categoria?.trim();
  return limpia ? limpia : null;
}

/** El nombre que se muestra de una clave de categoría. */
export function nombreCategoria(clave: string | null): string {
  return clave ?? SIN_CATEGORIA;
}

/** Los ids de la A a la Z. Estable: dos nombres iguales quedan como estaban. */
export function ordenAlfabetico(lista: ParaOrdenar[]): number[] {
  return [...lista].sort((a, b) => compararNombres(a.nombre, b.nombre)).map((p) => p.id);
}

/** Las categorías de la lista, en el orden en que aparecen por primera vez. */
export function categoriasDe(lista: ParaOrdenar[]): CategoriaFijada[] {
  const cuentas = new Map<string | null, { cantidad: number; elaborados: number }>();
  for (const p of lista) {
    const clave = claveCategoria(p.categoria);
    const c = cuentas.get(clave) ?? { cantidad: 0, elaborados: 0 };
    c.cantidad += 1;
    if (p.elaborado) c.elaborados += 1;
    cuentas.set(clave, c);
  }
  return [...cuentas].map(([clave, c]) => ({
    clave,
    nombre: nombreCategoria(clave),
    cantidad: c.cantidad,
    elaborada: c.elaborados * 2 >= c.cantidad,
  }));
}

/** Si los productos de cada categoría ya están todos juntos (cada una en un solo tramo). */
export function estaAgrupada(lista: ParaOrdenar[]): boolean {
  const vistas = new Set<string | null>();
  let anterior: string | null | undefined;
  for (const p of lista) {
    const clave = claveCategoria(p.categoria);
    if (anterior !== undefined && clave === anterior) continue;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    anterior = clave;
  }
  return true;
}

/**
 * Con qué orden de categorías abre la herramienta. Si la lista ya está
 * agrupada, el que tiene: el dueño ya la acomodó y no se le desarma. Si no,
 * primero las elaboradas (platos, servicios), después las demás (bebidas,
 * cosas con stock), por nombre dentro de cada clase, y «Sin categoría» al
 * final: el mismo criterio del buscador del selector (`orden=categoria`).
 */
export function rangoInicialCategorias(lista: ParaOrdenar[]): (string | null)[] {
  const categorias = categoriasDe(lista);
  if (estaAgrupada(lista)) return categorias.map((c) => c.clave);
  return [...categorias]
    .sort((a, b) => {
      if ((a.clave === null) !== (b.clave === null)) return a.clave === null ? 1 : -1;
      if (a.elaborada !== b.elaborada) return a.elaborada ? -1 : 1;
      return compararNombres(a.nombre, b.nombre);
    })
    .map((c) => c.clave);
}

/**
 * Los ids agrupados por categoría, en el orden de categorías pedido. Estable:
 * dentro de cada una quedan como estaban, salvo que se pida A–Z. Una
 * categoría que no venga en `orden` va al final, en el orden en que aparece.
 */
export function ordenPorCategoria(
  lista: ParaOrdenar[],
  orden: (string | null)[],
  dentro: DentroDeCategoria = "actual",
): number[] {
  const grupos = new Map<string | null, ParaOrdenar[]>();
  for (const p of lista) {
    const clave = claveCategoria(p.categoria);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(p);
    else grupos.set(clave, [p]);
  }
  const usadas = new Set<string | null>();
  const claves: (string | null)[] = [];
  for (const clave of [...orden, ...grupos.keys()]) {
    if (!grupos.has(clave) || usadas.has(clave)) continue;
    usadas.add(clave);
    claves.push(clave);
  }
  return claves.flatMap((clave) => {
    const grupo = grupos.get(clave)!;
    return dentro === "alfabetico" ? ordenAlfabetico(grupo) : grupo.map((p) => p.id);
  });
}

/** Mueve el elemento `i` un lugar (las flechas de las categorías). Fuera de rango, igual. */
export function moverUno<T>(lista: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const nueva = [...lista];
  [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
  return nueva;
}

/** Mismo orden: para no guardar en vano y para saber si «Deshacer» sigue valiendo. */
export function mismoOrden(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Lo que hace falta para «Deshacer» un ordenado: la lista de antes y la que quedó. */
export interface OrdenDeshacible {
  antes: number[];
  despues: number[];
}

/**
 * «Deshacer» vale hasta el próximo cambio de la lista: si la de ahora ya no es
 * la que dejó el ordenado (se movió, se quitó o se sumó algo), no se ofrece.
 */
export function puedeDeshacer(d: OrdenDeshacible | null, actual: number[]): d is OrdenDeshacible {
  return d != null && !mismoOrden(d.antes, d.despues) && mismoOrden(d.despues, actual);
}
