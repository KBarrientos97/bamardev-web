import type { Producto } from "../../types";

/**
 * La vista «Columnas por categoría» del punto de venta (Configuración › Punto
 * de venta, 16-nov): cada categoría es un bloque con su lista, y los bloques
 * se acomodan en columnas. Acá está lo que se decide sin dibujar nada.
 */

export interface BloqueCategoria {
  /** Para React: el id de la categoría, o «otros». */
  clave: string;
  nombre: string;
  /**
   * El lugar de la categoría en el orden del dueño, para el color de su
   * filete: el mismo lugar da el mismo color aunque una búsqueda esconda las
   * de antes. -1 = «Otros».
   */
  lugar: number;
  productos: Producto[];
}

/**
 * Los productos agrupados por categoría, en el orden de `categorias` (el del
 * dueño, ya aplicado). Dentro de cada bloque, en el orden en que vienen (el
 * que acomodó el cajero en las tarjetas). Una categoría sin productos a la
 * vista no se dibuja.
 *
 * Un producto cuya categoría no está en la lista (las categorías no cargaron,
 * o es de una inactiva) no se pierde: arma su bloque con el nombre que trae,
 * después de las conocidas. Los que no tienen categoría van a «Otros», al
 * final.
 */
export function agruparPorCategoria(
  productos: Producto[],
  categorias: { id: number; nombre: string }[],
): BloqueCategoria[] {
  const conocidas = new Map(categorias.map((c, i) => [c.id, i]));
  const porLugar = new Map<number, BloqueCategoria>();
  const sueltas = new Map<number, BloqueCategoria>();
  const otros: Producto[] = [];
  for (const p of productos) {
    const cat = p.categoria;
    if (!cat) {
      otros.push(p);
      continue;
    }
    const lugar = conocidas.get(cat.id);
    if (lugar !== undefined) {
      let b = porLugar.get(lugar);
      if (!b) {
        b = { clave: String(cat.id), nombre: categorias[lugar].nombre, lugar, productos: [] };
        porLugar.set(lugar, b);
      }
      b.productos.push(p);
    } else {
      let b = sueltas.get(cat.id);
      if (!b) {
        b = { clave: String(cat.id), nombre: cat.nombre, lugar: categorias.length + sueltas.size, productos: [] };
        sueltas.set(cat.id, b);
      }
      b.productos.push(p);
    }
  }
  const bloques = [...porLugar.values()].sort((a, b) => a.lugar - b.lugar);
  bloques.push(...sueltas.values());
  if (otros.length > 0) bloques.push({ clave: "otros", nombre: "Otros", lugar: -1, productos: otros });
  return bloques;
}

/**
 * Cuántas columnas entran en `ancho` px, con columnas de al menos `minimo` y
 * `separacion` entre ellas. Sin ancho conocido (0: todavía no se midió, o los
 * tests sin `ResizeObserver`), una.
 */
export function columnasQueEntran(ancho: number, minimo: number, separacion: number): number {
  if (!(ancho > 0)) return 1;
  return Math.max(1, Math.floor((ancho + separacion) / (minimo + separacion)));
}

/**
 * Reparte los bloques en `columnas` pilas, EN ORDEN: la primera columna lleva
 * las primeras categorías, la segunda las que siguen, y así, como un diario.
 * Se lee de arriba abajo y de izquierda a derecha en el orden que eligió el
 * dueño. Entre todos los cortes posibles se elige el que deja la columna más
 * alta lo más baja posible, así quedan parejas. Con tantas categorías como
 * columnas o menos, cada una tiene la suya —la comida a un lado, las bebidas
 * al otro— y las columnas que sobran quedan vacías (cada bloque conserva su
 * ancho). Un bloque nunca se parte entre dos columnas.
 *
 * Se hace a mano y no con columnas de CSS porque el navegador, al equilibrar
 * las alturas, juntaba dos categorías cortas en una columna y dejaba otra
 * vacía: con «Pollos» de 20 productos, «Bebidas» y «Extras» quedaban una
 * debajo de la otra al lado, y la tercera columna en blanco. Y no «a la
 * columna más baja» (lo primero que se probó en QA, 16-nov): con seis
 * categorías en dos columnas el orden se leía salteado (M, C / XL, L).
 */
export function repartirEnColumnas<T>(bloques: T[], columnas: number, alto: (b: T) => number): T[][] {
  const total = Math.max(1, Math.floor(columnas));
  const n = bloques.length;
  const k = Math.min(total, n);
  const vacias = (cuantas: number): T[][] => Array.from({ length: cuantas }, () => []);
  if (k <= 1) return [[...bloques], ...vacias(total - 1)];

  // suma[i] = alto de los primeros i bloques.
  const suma = [0];
  for (const b of bloques) suma.push(suma[suma.length - 1] + alto(b));
  const tramo = (desde: number, hasta: number) => suma[hasta] - suma[desde];

  // mejor[j][i]: la columna más alta al poner los primeros i bloques en j
  // columnas (ninguna vacía); corte[j][i]: dónde empieza la última de ellas.
  const mejor: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const corte: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= n; i++) mejor[1][i] = tramo(0, i);
  for (let j = 2; j <= k; j++) {
    for (let i = j; i <= n; i++) {
      for (let p = j - 1; p < i; p++) {
        const masAlta = Math.max(mejor[j - 1][p], tramo(p, i));
        // `<=`: con empate gana el corte más tardío, así la columna de la
        // izquierda lleva más, como se llena un diario.
        if (masAlta <= mejor[j][i]) {
          mejor[j][i] = masAlta;
          corte[j][i] = p;
        }
      }
    }
  }
  const pilas: T[][] = [];
  let hasta = n;
  for (let j = k; j >= 1; j--) {
    const desde = j === 1 ? 0 : corte[j][hasta];
    pilas.unshift(bloques.slice(desde, hasta));
    hasta = desde;
  }
  return [...pilas, ...vacias(total - k)];
}
