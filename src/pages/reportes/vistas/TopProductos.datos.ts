import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../../lib/format";
import type { HojaNueva } from "../../../lib/planilla";
import { esBillar } from "../../../lib/rubro";
import { contiene } from "../../../lib/texto";
import type { TopProductoApi } from "../api";
import { hoja } from "../contexto";
import { pct, plural } from "../formato";

/**
 * Las cuentas de Top productos, aparte de la pantalla para poder probarlas.
 *
 * El backend manda TODO lo vendido en el período (no un top N), bruto —antes
 * de promos— y ordenado por ingresos. Acá se arman los rankings: "más
 * vendidos" (por ingresos, el orden que ya trae), "más rentables" (por la
 * ganancia de cada artículo) y, en el restaurante, por unidades.
 */

/**
 * Por qué se ordena. "vendidos" es por INGRESOS, no por cantidad: en una
 * pollería el pollo entero, caro, salía primero aunque se vendieran muchos más
 * cuartos (BUG-reportes-5). Para contar está "unidades".
 */
export type OrdenTop = "vendidos" | "rentables" | "unidades";

/**
 * ¿Top productos cuenta como la app (REP-01, 28-oct)? Buscador por nombre y
 * categoría, filtro por categoría, la métrica Unidades y el total de lo que
 * queda a la vista. Es lo que contesta "¿cuántos cuartos vendí este mes?", la
 * pregunta del dueño de la pollería.
 *
 * Sólo en el restaurante: el billar tiene su tiempo de mesa aparte del ranking
 * y los demás rubros siguen viendo la pantalla de siempre.
 */
export function cuentaLoVisible(rubro: string | null | undefined): boolean {
  return rubro === "RESTAURANTE";
}

export interface FilaTop {
  nombre: string;
  categoria: string;
  /** Bruto, antes de promos. */
  ingresos: number;
  utilidad: number;
  unidades: number;
  /**
   * Margen como fracción (0,38 = 38 %). Null cuando no es un dato: sin
   * ingresos no hay sobre qué calcularlo, y sin costo cargado daría un 100 %
   * que se lee como el mejor producto de la carta.
   */
  margen: number | null;
  /** Se vendió sin costo cargado: su "ganancia" es el precio entero. */
  sinCosto: boolean;
}

export interface Top {
  /**
   * El tiempo de mesa del billar, aparte del ranking. Es un servicio sin
   * costo: entra entero como ganancia y en "más rentables" quedaba primero,
   * lejos, achicando la barra de todos los productos a una rayita.
   */
  tiempoMesa: FilaTop | null;
  /** El ranking, en el orden pedido, sin el tiempo de mesa. */
  filas: FilaTop[];
}

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * ¿Es el "Tiempo de mesa" del billar? El reporte no trae el id del producto,
 * así que se reconoce por el nombre con el que lo crea el backend
 * (`billar-config.service.ts`), y sólo en un billar: en otro rubro, un
 * producto que se llame así es uno más del ranking.
 */
export function esTiempoDeMesa(nombre: string, rubro: string | undefined): boolean {
  return esBillar(rubro) && normalizar(nombre) === "tiempo de mesa";
}

export function filaTop(p: TopProductoApi): FilaTop {
  const sinCosto = esPositivo(p.ingresos) && esCero(p.ingresos - p.utilidad);
  return {
    nombre: p.nombre,
    categoria: p.categoria,
    ingresos: p.ingresos,
    utilidad: p.utilidad,
    unidades: p.unidades,
    margen: esPositivo(p.ingresos) && !sinCosto ? p.utilidad / p.ingresos : null,
    sinCosto,
  };
}

export function armarTop(datos: TopProductoApi[], orden: OrdenTop, rubro: string | undefined): Top {
  let tiempoMesa: FilaTop | null = null;
  const filas: FilaTop[] = [];
  for (const p of datos) {
    if (!tiempoMesa && esTiempoDeMesa(p.nombre, rubro)) tiempoMesa = filaTop(p);
    else filas.push(filaTop(p));
  }
  // `sort` es estable: a igual monto queda el orden en que vino del backend.
  // A igual ganancia o igual cantidad desempata el que más vendió en plata.
  filas.sort(
    orden === "vendidos"
      ? (a, b) => b.ingresos - a.ingresos
      : orden === "rentables"
        ? (a, b) => b.utilidad - a.utilidad || b.ingresos - a.ingresos
        : (a, b) => b.unidades - a.unidades || b.ingresos - a.ingresos,
  );
  return { tiempoMesa, filas };
}

/** Lo que mide el ranking: los ingresos, la ganancia o las unidades vendidas. */
export function valorTop(f: FilaTop, orden: OrdenTop): number {
  return orden === "vendidos" ? f.ingresos : orden === "rentables" ? f.utilidad : f.unidades;
}

/** La barra de una fila, contra el primero del ranking. Una pérdida no tiene barra. */
export function fraccionTop(f: FilaTop, primero: FilaTop | undefined, orden: OrdenTop): number {
  const tope = primero ? valorTop(primero, orden) : 0;
  if (!esPositivo(tope)) return 0;
  return Math.max(0, valorTop(f, orden)) / tope;
}

/**
 * "Cervezas · 164 uds · margen 38 %". Ordenando por unidades, las unidades
 * ya son el número grande de la fila: en su lugar va la plata ("Pollos ·
 * Bs 2.460,00 · margen 38 %").
 */
export function lineaTop(f: FilaTop, orden: OrdenTop = "vendidos"): string {
  const margen = f.sinCosto ? "sin costo cargado" : `margen ${pct(f.margen)}`;
  const medio = orden === "unidades" ? fmtMoney(f.ingresos) : plural(f.unidades, "ud", "uds");
  return `${f.categoria} · ${medio} · ${margen}`;
}

/** Debajo del número de la fila, qué número es: "ingreso", "ganancia", "pérdida" o "unidades". */
export function pieTop(f: FilaTop, orden: OrdenTop): string {
  if (orden === "vendidos") return "ingreso";
  if (orden === "unidades") return fmtCantidad(f.unidades) === "1" ? "unidad" : "unidades";
  // Vendido por debajo del costo: la pérdida se llama así, no "ganancia" negativa.
  return esPositivo(-f.utilidad) ? "pérdida" : "ganancia";
}

/**
 * La línea del tiempo de mesa. Cada mesa cerrada entra a la venta como UN
 * renglón de "Tiempo de mesa" (`billar.service.ts`, `cantidad: 1`), así que
 * sus "unidades" son mesas cobradas, no horas: "57 uds" no se entendía.
 */
export function lineaTiempoMesa(f: FilaTop): string {
  const costo = f.sinCosto ? "no tiene costo" : `margen ${pct(f.margen)}`;
  return `${plural(f.unidades, "mesa cobrada", "mesas cobradas")} · ${costo}`;
}

/** Cuántos artículos del ranking se vendieron sin costo cargado. */
export function cuantosSinCosto(top: Top): number {
  return top.filas.filter((f) => f.sinCosto).length;
}

// ── Lo que queda a la vista (restaurante, REP-01) ───────────────────────────

/**
 * El corte del ranking que quedó a la vista después del buscador y de la
 * categoría, como `TopProductosVista` de la app.
 */
export interface VistaTop {
  /** Lo que pasó el filtro, en el orden del ranking. */
  visibles: FilaTop[];
  /** Las categorías con ventas en el período, alfabéticas: las opciones del filtro. */
  categorias: string[];
  /**
   * La categoría que de verdad está aplicada; null = todas. Una elegida que
   * en este período no vendió nada (se cambió el rango) cae en todas, en vez
   * de dejar la lista vacía sin que se entienda por qué.
   */
  categoria: string | null;
  /** Lo tecleado en el buscador, sin espacios de sobra. */
  busqueda: string;
}

/**
 * Aplica el buscador y la categoría sobre el ranking. Busca también en la
 * categoría y sin importar las tildes: tecleando "pollo" el dueño espera ver
 * los pollos, y ninguno se llama así ("Brasa cuarto", "Broaster entero").
 * Se filtra en el navegador: el período ya está bajado entero y pedirlo de
 * nuevo por cada letra no cambiaría ningún número.
 */
export function filtrarTop(filas: FilaTop[], busqueda: string, categoria: string | null): VistaTop {
  const texto = busqueda.trim();
  // Salen de lo vendido y no del catálogo: una categoría sin una sola venta
  // no es una opción, es un filtro que siempre da vacío.
  const categorias = [...new Set(filas.map((f) => f.categoria))].sort((a, b) => a.localeCompare(b, "es"));
  const activa = categoria != null && categorias.includes(categoria) ? categoria : null;
  const visibles = filas.filter(
    (f) => (activa == null || f.categoria === activa) && (!texto || contiene(f.nombre, texto) || contiene(f.categoria, texto)),
  );
  return { visibles, categorias, categoria: activa, busqueda: texto };
}

/** Hay algo recortando la lista: el total no es el del período. */
export function filtrando(v: Pick<VistaTop, "categoria" | "busqueda">): boolean {
  return v.categoria != null || v.busqueda !== "";
}

/**
 * El filtro escrito, para ponerlo al lado del total: "Pollos · «cuarto»",
 * "Pollos", "«cuarto»". Con `largo`, la categoría se nombra siempre ("Todas
 * las categorías · «cuarto»"), para la planilla que llega sola al contador.
 */
export function textoFiltro(v: Pick<VistaTop, "categoria" | "busqueda">, largo = false): string {
  const categoria = v.categoria ?? (largo ? "Todas las categorías" : null);
  const busqueda = v.busqueda ? `«${v.busqueda}»` : null;
  return [categoria, busqueda].filter(Boolean).join(" · ");
}

export interface TotalesTop {
  /** Cuántos artículos distintos quedaron a la vista. */
  cuantos: number;
  /** Con sus decimales (lo vendido por peso), redondeado a milésimas. */
  unidades: number;
  ingresos: number;
  utilidad: number;
}

/**
 * Lo que suma lo visible: la pregunta que viene siempre después de ver el
 * desglose ("¿y cuántos pollos en total?") y que había que sumar de cabeza.
 * Las unidades a milésimas, para que el ruido de sumar decimales no aparezca
 * como "0,30000000000000004"; la plata, a centavos.
 */
export function totalesTop(visibles: FilaTop[]): TotalesTop {
  return {
    cuantos: visibles.length,
    unidades: Math.round(visibles.reduce((s, f) => s + f.unidades, 0) * 1000) / 1000,
    ingresos: aCentavos(visibles.reduce((s, f) => s + f.ingresos, 0)),
    utilidad: aCentavos(visibles.reduce((s, f) => s + f.utilidad, 0)),
  };
}

/** "ganancia Bs 400,00", o "pérdida Bs 12,00": un número negativo no se llama ganancia. */
function textoGanancia(utilidad: number): string {
  return esPositivo(-utilidad) ? `pérdida ${fmtMoney(-utilidad)}` : `ganancia ${fmtMoney(utilidad)}`;
}

/** Lo que dice la tarjeta del total: el número de la métrica elegida, qué es, y los otros dos al pie. */
export interface ResumenTop {
  valor: string;
  /** Al lado del número: "de ingresos", "de ganancia", "de pérdida", "unidades". */
  sufijo: string;
  /** La ganancia elegida dio negativa: va en rojo y se llama pérdida. */
  perdida: boolean;
  detalle: string;
}

export function resumenTop(t: TotalesTop, orden: OrdenTop): ResumenTop {
  const productos = plural(t.cuantos, "producto", "productos");
  const unidades = plural(t.unidades, "unidad", "unidades");
  const ingresos = `ingresos ${fmtMoney(t.ingresos)}`;
  if (orden === "unidades") {
    return {
      valor: fmtCantidad(t.unidades),
      sufijo: fmtCantidad(t.unidades) === "1" ? "unidad" : "unidades",
      perdida: false,
      detalle: `${productos} · ${ingresos} · ${textoGanancia(t.utilidad)}`,
    };
  }
  if (orden === "rentables") {
    const perdida = esPositivo(-t.utilidad);
    return {
      valor: fmtMoney(Math.abs(t.utilidad)),
      sufijo: perdida ? "de pérdida" : "de ganancia",
      perdida,
      detalle: `${productos} · ${unidades} · ${ingresos}`,
    };
  }
  return {
    valor: fmtMoney(t.ingresos),
    sufijo: "de ingresos",
    perdida: false,
    detalle: `${productos} · ${unidades} · ${textoGanancia(t.utilidad)}`,
  };
}

// ── La métrica que se recuerda (restaurante, REP-01) ────────────────────────

/**
 * Con qué métrica abre Top productos, por negocio y por usuario: quien entra
 * a contar cuántos cuartos vendió mira Unidades todas las veces, y la pantalla
 * abría siempre en plata. Como `MetricaTopGuardada` de la app: es una
 * preferencia de este equipo y no viaja al backend; la clave lleva el negocio
 * y el usuario porque el contador y el dueño miran la misma compu buscando
 * cosas distintas.
 */
const PREFIJO_METRICA = "bamardev.reportes.topMetrica";
const ORDENES_VALIDOS: readonly OrdenTop[] = ["vendidos", "rentables", "unidades"];

function claveMetrica(alias: string | null | undefined, usuario: string | null | undefined): string {
  return `${PREFIJO_METRICA}_${alias || "sin_negocio"}_${usuario || "sin_usuario"}`;
}

/** La última métrica elegida, o la de ingresos la primera vez (o si lo guardado ya no existe). */
export function leerOrdenTop(alias: string | null | undefined, usuario: string | null | undefined): OrdenTop {
  try {
    const guardada = localStorage.getItem(claveMetrica(alias, usuario));
    return ORDENES_VALIDOS.find((o) => o === guardada) ?? "vendidos";
  } catch {
    // Modo privado o el almacenamiento bloqueado: se abre como la primera vez.
    return "vendidos";
  }
}

export function guardarOrdenTop(alias: string | null | undefined, usuario: string | null | undefined, orden: OrdenTop): void {
  try {
    localStorage.setItem(claveMetrica(alias, usuario), orden);
  } catch {
    /* si no se puede guardar, la métrica igual quedó elegida en pantalla */
  }
}

// ── Excel ───────────────────────────────────────────────────────────────────

export interface FilaExportTop {
  puesto: number | null;
  nombre: string;
  categoria: string;
  unidades: number;
  ingresos: number;
  utilidad: number;
  /** 0..100 con un decimal; vacío si no es un dato. */
  margenPct: number | null;
  nota: string | null;
}

/** El margen en la planilla: 0..100 con un decimal, o vacío si no es un dato. */
function margenPct(margen: number | null): number | null {
  return margen == null ? null : Math.round(margen * 1000) / 10;
}

/** Las filas de la planilla, en el orden del ranking, con el tiempo de mesa arriba y sin puesto. */
export function filasExportTop(top: Top): FilaExportTop[] {
  const fila = (f: FilaTop, puesto: number | null, nota: string | null): FilaExportTop => ({
    puesto,
    nombre: f.nombre,
    categoria: f.categoria,
    unidades: f.unidades,
    ingresos: f.ingresos,
    utilidad: f.utilidad,
    margenPct: margenPct(f.margen),
    nota,
  });
  const filas = top.filas.map((f, i) => fila(f, i + 1, f.sinCosto ? "Sin costo cargado" : null));
  if (top.tiempoMesa) filas.unshift(fila(top.tiempoMesa, null, "Tiempo de mesa: va aparte del ranking"));
  return filas;
}

export function hojaTop(nombre: string, filas: FilaExportTop[]): HojaNueva {
  return hoja<FilaExportTop>(
    nombre,
    [
      ["Puesto", (f) => f.puesto],
      ["Producto", (f) => f.nombre],
      ["Categoría", (f) => f.categoria],
      ["Unidades", (f) => f.unidades],
      ["Ingresos (Bs)", (f) => f.ingresos],
      ["Ganancia (Bs)", (f) => f.utilidad],
      ["Margen (%)", (f) => f.margenPct],
      ["Nota", (f) => f.nota],
    ],
    filas,
  );
}

/**
 * El Excel del restaurante: LO QUE SE VE, en el orden elegido, con el total
 * y el filtro escrito, como la app. Bajar el período entero con "Pollos"
 * filtrado en pantalla daría una planilla que no se parece a lo que se mira;
 * y el filtro va escrito para que la planilla se explique sola cuando llega al
 * contador.
 */
export function hojaTopVisible(v: VistaTop, etiquetaOrden: string): HojaNueva {
  const h = hojaTop(`Top productos (${etiquetaOrden})`, filasExportTop({ tiempoMesa: null, filas: v.visibles }));
  const t = totalesTop(v.visibles);
  const sinCosto = v.visibles.filter((f) => f.sinCosto).length;
  h.filas.push(
    [],
    [
      null,
      "Total",
      null,
      t.unidades,
      t.ingresos,
      t.utilidad,
      // Sin ingresos no hay margen: un 0 se leería como que se vendió sin ganar.
      margenPct(esPositivo(t.ingresos) ? t.utilidad / t.ingresos : null),
      sinCosto > 0 ? `Incluye ${plural(sinCosto, "producto", "productos")} sin costo cargado` : null,
    ],
  );
  if (filtrando(v)) h.filas.push([null, "Filtro", textoFiltro(v, true)]);
  return h;
}
