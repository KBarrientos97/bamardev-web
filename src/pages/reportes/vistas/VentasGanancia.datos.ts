import { aCentavos, esCero, esPositivo, TOLERANCIA } from "../../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../../lib/format";
import type { CeldaPdf, DocumentoPdf } from "../../../lib/pdf/tablaPdf";
import type { HojaNueva } from "../../../lib/planilla";
import { esBelleza, esBillar } from "../../../lib/rubro";
import type { ReporteCierreGanancia } from "../../../types";
import type { TopProductoApi } from "../api";
import { hoja } from "../contexto";
import { plural } from "../formato";

/**
 * Cuánto se vendió de cada cosa y cuánto dejó, por categoría: el cuaderno del
 * dueño. Es la pantalla de la app (`VentasGanancia.kt`, 5-nov) traída a la
 * web: el cliente la dibujó a mano, POLLOS, BEBIDAS, HAMBURGUESA, cada una con
 * sus productos y cuatro columnas (cantidad, total, costo, ganancia) y un
 * total abajo.
 *
 * Sale de `reportes/top-productos`: **no es otro cálculo**. El costo es lo
 * vendido menos la utilidad del backend, así que cuadra con Top productos y
 * con Categorías en el mismo período, que es lo primero que va a comparar el
 * dueño.
 *
 * Qué **no** mide:
 *  - Lo cobrado: los montos son a precio de lista, antes de promos y cupones.
 *    En un negocio con descuentos da más que la caja; la pantalla lo dice.
 *  - La ganancia real del negocio: acá no se restan alquiler ni sueldos. Eso
 *    es el Estado de resultado.
 */

/** Las cuatro columnas del cuaderno: las mismas en un producto, una categoría y el total. */
export interface CifrasGanancia {
  unidades: number;
  total: number;
  costo: number;
  ganancia: number;
}

export interface ProductoGanancia extends CifrasGanancia {
  nombre: string;
}

export interface CategoriaGanancia extends CifrasGanancia {
  nombre: string;
  productos: ProductoGanancia[];
}

export interface VentasGanancia extends CifrasGanancia {
  /** De la que más vendió a la que menos. */
  categorias: CategoriaGanancia[];
  /** Cuántos productos DISTINTOS salieron; no es la suma de unidades. */
  productos: number;
  /** Lo vendido de productos sin costo cargado (no se resta de nada: ver `sinCosto`). */
  ventasSinCosto: number;
}

/** Las cantidades son piezas o kilos, no plata: a milésimas, sin el ruido de sumar decimales. */
const sumarUnidades = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 1000) / 1000;
const sumarPlata = (xs: number[]) => aCentavos(xs.reduce((a, b) => a + b, 0));

function sumar(xs: CifrasGanancia[]): CifrasGanancia {
  return {
    unidades: sumarUnidades(xs.map((x) => x.unidades)),
    total: sumarPlata(xs.map((x) => x.total)),
    costo: sumarPlata(xs.map((x) => x.costo)),
    ganancia: sumarPlata(xs.map((x) => x.ganancia)),
  };
}

/**
 * Se vendió y no costó nada: la ficha no tiene costo cargado. Sin esta marca
 * el renglón dice "costo Bs 0,00, ganancia = todo lo vendido", que se lee como
 * un negocio redondo y es un dato que falta. Sólo si se vendió algo: un regalo
 * a precio cero no gana nada y ahí no hay nada que corregir.
 */
export function sinCosto(c: Pick<CifrasGanancia, "total" | "costo">): boolean {
  return esPositivo(c.total) && esCero(c.costo);
}

/** Si el resultado cambia de signo cambia la etiqueta ("Ganancia" → "Pérdida"). */
export function enPerdida(c: Pick<CifrasGanancia, "ganancia">): boolean {
  return c.ganancia < -TOLERANCIA;
}

/**
 * Agrupa lo que mandó el backend. Las categorías van por lo recaudado y,
 * adentro, manda lo que MÁS salió: es el orden de Productos vendidos del
 * cierre, porque a las dos se les hace la misma pregunta ("cuántos pollos
 * salieron"). El total desempata para que no bailen entre cargas.
 */
export function armarVentasGanancia(top: TopProductoApi[]): VentasGanancia {
  const porCategoria = new Map<string, ProductoGanancia[]>();
  for (const t of top) {
    const p: ProductoGanancia = {
      nombre: t.nombre,
      unidades: t.unidades,
      total: t.ingresos,
      // El backend manda la utilidad, no el costo: se despeja de acá y no del
      // costo de la ficha porque el real puede venir de los lotes.
      costo: aCentavos(t.ingresos - t.utilidad),
      ganancia: t.utilidad,
    };
    const lista = porCategoria.get(t.categoria) ?? [];
    lista.push(p);
    porCategoria.set(t.categoria, lista);
  }
  const categorias: CategoriaGanancia[] = [...porCategoria].map(([nombre, productos]) => {
    const ordenados = [...productos].sort((a, b) => b.unidades - a.unidades || b.total - a.total);
    return { nombre, productos: ordenados, ...sumar(ordenados) };
  });
  categorias.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  const todos = categorias.flatMap((c) => c.productos);
  return {
    categorias,
    ...sumar(categorias),
    productos: todos.length,
    ventasSinCosto: sumarPlata(todos.filter(sinCosto).map((p) => p.total)),
  };
}

/**
 * El cuadro de UN turno (arqueo de Reportes, 7-nov): la app y la web miran el
 * mismo `reportes/cierres/:id/ganancia`. Por fechas no se podía: el turno que
 * cerró a las 4 de la mañana se mezclaba con el que abrió al mediodía y el
 * dueño no lograba cuadrar cada cierre.
 *
 * Las sumas y el orden son los del backend y no se vuelven a calcular ni a
 * ordenar: es la misma lista, en el mismo orden, que la del arqueo.
 *
 * El total es lo COBRADO en el turno, como en el arqueo, no el bruto antes de
 * promos que suma Ventas y ganancia: sin descuentos dan lo mismo.
 */
export function armarGananciaTurno(g: ReporteCierreGanancia): VentasGanancia {
  const categorias = g.categorias.map(
    (c): CategoriaGanancia => ({
      nombre: c.nombre,
      unidades: c.unidades,
      total: c.total,
      costo: c.costo,
      ganancia: c.ganancia,
      productos: c.items.map((i) => ({
        nombre: i.nombre,
        unidades: i.cantidad,
        total: i.total,
        costo: i.costo,
        ganancia: i.ganancia,
      })),
    }),
  );
  return {
    categorias,
    unidades: g.unidades,
    total: g.total,
    costo: g.costo,
    ganancia: g.ganancia,
    productos: g.lineas,
    ventasSinCosto: sumarPlata(categorias.flatMap((c) => c.productos).filter(sinCosto).map((p) => p.total)),
  };
}

/**
 * ¿El arqueo muestra el costo y la ganancia del turno? Sólo a quien tiene
 * rentabilidad, por plan y por rol: Kevin, 7-nov, "ese dato sólo es para el
 * dueño, por seguridad del local". Y por ahora sólo en el restaurante, que es
 * quien lo pidió; los demás rubros siguen viendo su lista.
 */
export function veGananciaDelTurno(
  rubro: string | null | undefined,
  planIncluye: boolean,
  permisos: readonly string[],
): boolean {
  return rubro === "RESTAURANTE" && planIncluye && permisos.includes("reportes.rentabilidad");
}

/** El aviso de productos sin costo: el mismo en la pantalla y en el PDF. */
export function textoSinCosto(v: Pick<VentasGanancia, "ventasSinCosto">): string {
  return `${fmtMoney(v.ventasSinCosto)} de lo vendido es de productos sin costo cargado: su ganancia es el precio entero. Cargales el costo en Artículos para que la ganancia sea real.`;
}

/** Por qué el total del turno no es lo que hay en el cajón, ni la ganancia lo que quedó. */
export const NOTAS_GANANCIA_TURNO = [
  "Es lo vendido en el turno, no lo que hay en el cajón. Un crédito cobrado hoy tampoco suma acá: ese producto ya se vendió antes.",
  "La ganancia es lo vendido menos lo que costó cada producto. Es antes de gastos: el alquiler y los sueldos se restan en Finanzas.",
] as const;

/**
 * El aviso de "productos sin costo", salvo en billar y belleza: ahí el tiempo
 * de mesa o un corte no tienen costo y el aviso no se apagaría nunca. Lo mismo
 * que la app (`SinCosto.avisaEnVentasYGanancia`).
 */
export function avisaSinCosto(rubro: string | null | undefined): boolean {
  return !esBillar(rubro) && !esBelleza(rubro);
}

/** "Ganancia" o "Pérdida", con el número sin signo: el rojo ya dice que es pérdida. */
export function textoGanancia(c: Pick<CifrasGanancia, "ganancia">): string {
  return fmtMoney(Math.abs(c.ganancia));
}

/** "9 productos · 32 unidades · Ganancia Bs 431,00", el renglón del PDF. */
export function resumenVentasGanancia(v: VentasGanancia, cajero?: string | null): string {
  const partes = [plural(v.productos, "producto", "productos"), `${fmtCantidad(v.unidades)} unidades`];
  partes.push(`${enPerdida(v) ? "Pérdida" : "Ganancia"} ${textoGanancia(v)}`);
  if (cajero) partes.push(`Cajero: ${cajero}`);
  return partes.join(" · ");
}

/** El Excel: una fila por producto, con su categoría, y los subtotales y el total. */
export function hojaVentasGanancia(v: VentasGanancia, cajero?: string | null): HojaNueva {
  type Fila = { categoria: string; nombre: string; c: CifrasGanancia; nota: string | null };
  const filas: Fila[] = [];
  for (const cat of v.categorias) {
    for (const p of cat.productos) filas.push({ categoria: cat.nombre, nombre: p.nombre, c: p, nota: sinCosto(p) ? "Sin costo cargado" : null });
    filas.push({ categoria: cat.nombre, nombre: `Total ${cat.nombre}`, c: cat, nota: null });
  }
  const columnas: [string, (f: Fila) => string | number | null][] = [
    ["Categoría", (f) => f.categoria],
    ["Producto", (f) => f.nombre],
    ["Cantidad", (f) => f.c.unidades],
    ["Total (Bs)", (f) => f.c.total],
    ["Costo (Bs)", (f) => f.c.costo],
    ["Ganancia (Bs)", (f) => f.c.ganancia],
    ["Nota", (f) => f.nota],
  ];
  const h = hoja<Fila>("Ventas y ganancia", columnas, filas);
  h.filas.push([], [
    null,
    "TOTAL",
    v.unidades,
    v.total,
    v.costo,
    v.ganancia,
    cajero ? `Cajero: ${cajero}` : null,
  ]);
  return h;
}

/** El PDF, igual al de la app: PRODUCTO · CANT. · TOTAL · COSTO · GANANCIA. */
export function documentoVentasGanancia(
  v: VentasGanancia,
  o: {
    negocio?: string | null;
    subtitulo: string;
    cajero?: string | null;
    /** El de un turno se titula distinto y lleva sus propias aclaraciones. */
    titulo?: string;
    notas?: string[];
  },
): DocumentoPdf {
  const celdas = (c: CifrasGanancia, esProducto: boolean): CeldaPdf[] => {
    const sc = esProducto && sinCosto(c);
    return [
      { texto: fmtCantidad(c.unidades) },
      { texto: fmtMoney(c.total) },
      sc ? { texto: "Sin costo", tono: "apagado" } : { texto: fmtMoney(c.costo) },
      {
        texto: textoGanancia(c),
        tono: enPerdida(c) ? "negativo" : sc ? "apagado" : "normal",
      },
    ];
  };
  return {
    titulo: o.titulo ?? "Ventas y ganancia",
    negocio: o.negocio,
    subtitulo: o.subtitulo,
    resumen: resumenVentasGanancia(v, o.cajero),
    columnas: ["PRODUCTO", "CANT.", "TOTAL", "COSTO", "GANANCIA"],
    grupos: v.categorias.map((c) => ({
      titulo: c.nombre,
      celdas: celdas(c, false),
      filas: c.productos.map((p) => ({ nombre: p.nombre, celdas: celdas(p, true) })),
    })),
    // "TOTAL" aunque dé pérdida: es el total de todas las columnas, y la
    // pérdida ya sale en rojo en la suya.
    total: { etiqueta: "TOTAL", celdas: celdas(v, false) },
    notas: o.notas ?? [
      "Los montos son antes de promos y cupones: es lo vendido a precio de lista, así que puede dar más que lo cobrado. La ganancia es antes de gastos: el alquiler y los sueldos se restan en Finanzas.",
    ],
  };
}
