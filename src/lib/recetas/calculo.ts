import type { GrupoReceta } from "./tipos";

/**
 * Las cuentas de la receta del plato (CONTRATO-recetas-plato §1.2 y §2.3): las
 * MISMAS que hace el backend. El editor las usa para mostrar el costo en vivo
 * mientras se arma la receta; al guardar, el backend escribe el suyo en la
 * ficha y tiene que dar el mismo centavo que se vio. Sin React ni red.
 *
 * Las reglas:
 *  · un insumo está **configurado** con «con cuánto» > 0, «sirvo cuántas» > 0
 *    y el nombre de lo que sirve;
 *  · `costoPorcion = costo × rindeCantidad ÷ rindePorciones`, sin redondear
 *    (null sin costo o sin rinde);
 *  · el costo de un renglón es `round2(costoPorcion × porciones)` y el del plato
 *    es la suma de los renglones YA redondeados: así cuadra con lo que se ve;
 *  · un insumo sin costo no entra en la cuenta (cuenta 0 y se avisa aparte).
 */

/**
 * Redondea a centavos, medio hacia arriba, sobre el decimal que se lee: 1,005
 * da 1,01 y 1,255 da 1,26. Con `Math.round(n * 100) / 100` daban 1,00 y 1,25,
 * porque en punto flotante esos números son 1,00499999… y 1,25499999…. Por eso
 * se pasa primero por el texto con 10 decimales, que se lleva ese ruido, y se
 * corre la coma con el exponente en vez de multiplicar.
 *
 * Es la MISMA cuenta que `round2` del backend (`src/recetas-plato/receta.ts`:
 * 10 decimales, sobre el valor absoluto y con el signo al final): si una de las
 * dos cambia, el costo que se ve al armar la receta deja de ser el que queda en
 * la ficha. Lo único distinto: lo que no es un número, acá es 0 (es pantalla).
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Number(`${Math.round(Number(`${Math.abs(n).toFixed(10)}e2`))}e-2`);
  return n < 0 && r !== 0 ? -r : r;
}

/** Lo que hace falta de un insumo para sus cuentas (los nombres son los del backend). */
export interface RindeInsumo {
  /** «Con cuánto», en la unidad base del insumo. */
  rindeCantidad?: number | null;
  /** «Sirvo cuántas». */
  rindePorciones?: number | null;
  /** Cómo se llama lo que sirve («porción», «presa»…). */
  porcionNombre?: string | null;
}

/** Tiene el rinde completo: recién así entra en una receta. */
export function estaConfigurado(i: RindeInsumo): boolean {
  return (i.rindeCantidad ?? 0) > 0 && (i.rindePorciones ?? 0) > 0 && !!i.porcionNombre?.trim();
}

/** Cuánto de la unidad base gasta una porción (1 kg → 12 porciones: 1/12 kg). Null sin rinde. */
export function basePorPorcion(i: RindeInsumo): number | null {
  if (!estaConfigurado(i)) return null;
  return i.rindeCantidad! / i.rindePorciones!;
}

/**
 * Lo que cuesta una porción, sin redondear. `costo` es el de la ficha del
 * insumo, por unidad base. Null si todavía no tiene costo o no tiene rinde. El
 * orden de las operaciones es el del contrato (y el del backend): en punto
 * flotante, multiplicar y después dividir no siempre da lo mismo que al revés.
 */
export function costoPorcion(i: RindeInsumo & { costo?: number | null }): number | null {
  const costo = Number(i.costo ?? 0);
  if (!estaConfigurado(i) || !(costo > 0)) return null;
  return (costo * i.rindeCantidad!) / i.rindePorciones!;
}

/** Para cuántas porciones alcanza un stock (en la unidad base). Null sin rinde. */
export function porcionesEnStock(stock: number, i: RindeInsumo): number | null {
  if (!estaConfigurado(i)) return null;
  return (stock * i.rindePorciones!) / i.rindeCantidad!;
}

/** El costo de un renglón: `round2(costoPorcion × porciones)`. Null si el insumo no tiene costo. */
export function costoRenglon(costoPorcion: number | null | undefined, porciones: number): number | null {
  if (costoPorcion == null) return null;
  return round2(costoPorcion * porciones);
}

/** Un renglón de la receta para las cuentas de plata. */
export interface RenglonCosto {
  grupo: GrupoReceta;
  porciones: number;
  /** Sólo cuenta en la guarnición. */
  puro?: boolean;
  costoPorcion: number | null;
}

const deRenglon = (r: Pick<RenglonCosto, "porciones" | "costoPorcion">, factor = 1) =>
  costoRenglon(r.costoPorcion, r.porciones * factor) ?? 0;

/**
 * El costo del plato tal como sale en cada venta, con la guarnición completa:
 * la suma de los renglones YA redondeados. Lo que no tiene costo suma 0.
 */
export function costoPlato(renglones: Pick<RenglonCosto, "porciones" | "costoPorcion">[]): number {
  return round2(renglones.reduce((s, r) => s + deRenglon(r), 0));
}

/**
 * Lo más barato y lo más caro que puede salir el plato según lo que pida el
 * cliente. Siempre van lo fijo y las presas; la guarnición, la más barata y la
 * más cara entre:
 *  · completa;
 *  · quitando UNA (cualquiera);
 *  · una sola «puro» (de las que pueden ir así): las otras que pueden ir «puro»
 *    salen, las que no se quedan, y la elegida va doble si `puroDoble`.
 * Sin guarnición, mínimo y máximo son el costo del plato.
 */
export function rangoCosto(renglones: RenglonCosto[], puroDoble: boolean): { minimo: number; maximo: number } {
  const fijo = renglones.filter((r) => r.grupo !== "GUARNICION").reduce((s, r) => s + deRenglon(r), 0);
  const guarnicion = renglones.filter((r) => r.grupo === "GUARNICION");
  const variantes = [guarnicion.reduce((s, r) => s + deRenglon(r), 0)];
  guarnicion.forEach((elegida, i) => {
    variantes.push(guarnicion.reduce((s, r, j) => s + (j === i ? 0 : deRenglon(r)), 0));
    if (elegida.puro) {
      variantes.push(
        guarnicion.reduce(
          (s, r, j) => s + (j === i ? deRenglon(r, puroDoble ? 2 : 1) : r.puro ? 0 : deRenglon(r)),
          0,
        ),
      );
    }
  });
  return { minimo: round2(fijo + Math.min(...variantes)), maximo: round2(fijo + Math.max(...variantes)) };
}

/** Los insumos de la receta que todavía no tienen costo, sin repetir: no entran en la cuenta. */
export function sinCosto(renglones: { nombre: string; costoPorcion: number | null }[]): string[] {
  return [...new Set(renglones.filter((r) => r.costoPorcion == null).map((r) => r.nombre))];
}

/** Un renglón para saber para cuántos platos alcanza el stock. */
export interface RenglonAlcance {
  nombre: string;
  porciones: number;
  seCuenta: boolean;
  /** Para cuántas porciones alcanza el stock del insumo; null sin rinde. */
  porcionesEnStock: number | null;
}

/**
 * Para cuántos platos alcanza lo que se cuenta: el mínimo de
 * `floor(porcionesEnStock ÷ porciones)` y el insumo que limita. Null si nada se
 * cuenta. Puede dar 0 o menos: la venta nunca se frena por un insumo y su stock
 * puede quedar en negativo.
 */
export function alcanzaPlato(renglones: RenglonAlcance[]): { alcanza: number | null; limite: string | null } {
  let alcanza: number | null = null;
  let limite: string | null = null;
  for (const r of renglones) {
    if (!r.seCuenta || r.porcionesEnStock == null || !(r.porciones > 0)) continue;
    const n = Math.floor(r.porcionesEnStock / r.porciones);
    if (alcanza == null || n < alcanza) {
      alcanza = n;
      limite = r.nombre;
    }
  }
  return { alcanza, limite };
}

/** La parte del precio que le queda al negocio (0,47 = 47 %). Null sin precio o sin costo. */
export function margenDe(precio: number | null | undefined, costo: number | null | undefined): number | null {
  if (precio == null || costo == null || !(precio > 0)) return null;
  return (precio - costo) / precio;
}

/**
 * Lo que deja un plato: la ganancia (negativa si cuesta más de lo que se
 * cobra) y, de cada 100 que se cobran, cuánto es costo y cuánto queda («De cada
 * Bs 100 que cobrás, Bs 53 son costo y Bs 47 te quedan»). Sin precio no hay
 * nada que calcular; con precio 0, sólo la ganancia.
 */
export function loQueDeja(
  precio: number | null | undefined,
  costo: number,
): { ganancia: number | null; costoDe100: number | null; quedaDe100: number | null } {
  if (precio == null) return { ganancia: null, costoDe100: null, quedaDe100: null };
  const ganancia = round2(precio - costo);
  if (!(precio > 0)) return { ganancia, costoDe100: null, quedaDe100: null };
  const costoDe100 = Math.round((costo / precio) * 100);
  return { ganancia, costoDe100, quedaDe100: 100 - costoDe100 };
}

/** Qué parte de la barra es costo (0 a 100), o null sin precio para compararlo. */
export function anchoDelCosto(precio: number | null | undefined, costo: number | null | undefined): number | null {
  if (precio == null || costo == null || !(precio > 0)) return null;
  return Math.max(0, Math.min(100, (costo / precio) * 100));
}

/**
 * Del plato que menos deja al que más, por la parte del precio que queda (el
 * orden de «Costos de platos»): un plato barato que deja poco en plata puede
 * estar sano. Los que no tienen precio o costo, al final. Estable: a igual
 * margen, el orden que traían.
 */
export function ordenarPorLoQueDeja<T extends { precio: number | null; costo: number | null }>(platos: T[]): T[] {
  return platos
    .map((p, i) => ({ p, i, m: margenDe(p.precio, p.costo) }))
    .sort((a, b) => {
      if (a.m == null || b.m == null) return a.m == null && b.m == null ? a.i - b.i : a.m == null ? 1 : -1;
      return a.m - b.m || a.i - b.i;
    })
    .map((x) => x.p);
}

/**
 * De cada 100 que se cobran, cuántos quedan en promedio después de pagar los
 * insumos: el promedio simple de lo que deja cada plato (no pesa por precio:
 * no se sabe cuánto se vende de cada uno). Null sin ningún plato con precio y
 * costo.
 */
export function promedioQueQueda(platos: { precio: number | null; costo: number | null }[]): number | null {
  const margenes = platos.map((p) => margenDe(p.precio, p.costo)).filter((m): m is number => m != null);
  if (!margenes.length) return null;
  return Math.round((margenes.reduce((s, m) => s + m, 0) / margenes.length) * 100);
}
