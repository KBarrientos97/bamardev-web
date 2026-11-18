import type { SesionNegocio } from "../types";
import { tienePermiso } from "./permisos";

/**
 * Cómo se ve y cómo cobra el punto de venta (Configuración › Punto de venta,
 * 16-nov). El dueño vio otra caja que deja elegir esto y lo pidió TODO
 * configurable, sin tocar lo de hoy: los valores de fábrica dejan el POS
 * exactamente como estaba.
 *
 * Viaja en la sesión (`negocio.pos`, en el login y en `/licencia/estado`, igual
 * que `usaAgregados`) y se cambia con `PATCH /pos/config`. Una sesión guardada
 * antes, o un backend que todavía no lo manda, no lo trae: ahí vale lo de
 * fábrica. Todo el POS lo lee por `configPosDe` y no del campo crudo, así un
 * dato raro (un valor que el backend sumó después, un `null`) nunca deja la
 * caja a medio dibujar.
 *
 * Desde el 18-nov hay dos capas (CONTRATO-pos-por-cajero R1–R4): la del
 * negocio, que fija el dueño, y encima lo PROPIO de cada cajero (`MiConfigPos`,
 * `PATCH /pos/config/mia`). La sesión ya trae la mezcla de las dos —la
 * configuración efectiva de quien entró—, así que el POS la sigue leyendo igual
 * que antes y un cajero que nunca tocó nada ve lo del negocio.
 */

/** Cómo se ven los productos: en tarjetas (lo de siempre) o una columna por categoría. */
export type VistaPos = "TARJETAS" | "COLUMNAS";
/** Dónde se cobra: en la pantalla de cobro (lo de siempre) o al lado de los productos. */
export type CobroPos = "APARTE" | "EN_VENTA";

export interface ConfigPos {
  vista: VistaPos;
  cobro: CobroPos;
  /** El ícono de cada producto en las tarjetas y en las filas. */
  iconos: boolean;
  /** La fila de chips de categoría arriba del catálogo. El buscador queda siempre. */
  filtros: boolean;
  /** Ids de categoría en el orden elegido; vacío = el orden en que llegan. */
  ordenCategorias: number[];
  /**
   * Configuración › Caja (17-nov): si al abrir y al cerrar el turno se ofrece
   * contar el efectivo billete por billete. De fábrica sí, como siempre: un
   * local que cobra sólo con QR o que no cuenta el cajón al abrir lo apaga.
   */
  billetesAlAbrir: boolean;
  billetesAlCerrar: boolean;
  /**
   * Delivery full (18-nov): al registrar un pedido de Yango o PedidosYa se abre
   * su ticket para imprimirlo. Apagado (lo de fábrica), se registra y listo.
   */
  imprimirPlataformas: boolean;
  /**
   * Delivery full (18-nov): lo que el repartidor cobra en efectivo queda en su
   * poder hasta que la caja lo recibe, y la caja no cierra con plata sin
   * recibir. La rendición lo lee de la respuesta del backend (`activa`), no de acá.
   */
  rendirRepartidores: boolean;
}

/*
 * Mesa o para llevar NO es un ajuste (decisión del dueño, 16-nov): «se queda
 * tal cual está trabajándose hoy en día, es muy práctico». Cada línea del local
 * nace en mesa y el carrito tiene sus «Todo en mesa / Todo para llevar» y el
 * chip de cada línea, en los dos modos de cobro.
 */

/** Lo de fábrica: el POS de siempre. Nadie lo modifica: `normalizarConfigPos` devuelve copias. */
export const CONFIG_POS_DE_SIEMPRE: Readonly<ConfigPos> = {
  vista: "TARJETAS",
  cobro: "APARTE",
  iconos: true,
  filtros: true,
  ordenCategorias: [],
  billetesAlAbrir: true,
  billetesAlCerrar: true,
  imprimirPlataformas: false,
  rendirRepartidores: false,
};

/**
 * Lee lo que vino de la red (o de la sesión guardada) campo por campo: lo que
 * falta o no se entiende vale lo de fábrica, y lo demás se respeta. Un campo
 * roto no tira abajo a los otros: si mañana el backend manda una vista nueva
 * que esta versión no conoce, el cobro elegido sigue valiendo.
 */
export function normalizarConfigPos(crudo: unknown): ConfigPos {
  const d = CONFIG_POS_DE_SIEMPRE;
  if (!crudo || typeof crudo !== "object") return { ...d, ordenCategorias: [] };
  const c = crudo as Record<string, unknown>;
  return {
    vista: c.vista === "COLUMNAS" || c.vista === "TARJETAS" ? c.vista : d.vista,
    cobro: c.cobro === "EN_VENTA" || c.cobro === "APARTE" ? c.cobro : d.cobro,
    iconos: typeof c.iconos === "boolean" ? c.iconos : d.iconos,
    filtros: typeof c.filtros === "boolean" ? c.filtros : d.filtros,
    ordenCategorias: Array.isArray(c.ordenCategorias)
      ? // Sin repetidos ni basura: un id que aparece dos veces no puede ocupar dos lugares.
        [...new Set(c.ordenCategorias.filter((x): x is number => Number.isInteger(x)))]
      : [],
    billetesAlAbrir: typeof c.billetesAlAbrir === "boolean" ? c.billetesAlAbrir : d.billetesAlAbrir,
    billetesAlCerrar: typeof c.billetesAlCerrar === "boolean" ? c.billetesAlCerrar : d.billetesAlCerrar,
    // Un `pos` de antes de estos dos ajustes no los trae: apagados, como siempre.
    imprimirPlataformas: c.imprimirPlataformas === true,
    rendirRepartidores: c.rendirRepartidores === true,
  };
}

/**
 * Si el rubro tiene punto de venta configurable. Sólo el restaurante: la
 * pantalla para cambiarlo existe sólo ahí (`config_pos` y `mi_pos`, ver
 * permisos.ts), y lo mismo el arrastre de las categorías en el POS.
 */
export function rubroConConfigPos(tipoNegocio: string | null | undefined): boolean {
  return tipoNegocio === "RESTAURANTE";
}

/**
 * La configuración del punto de venta de ESTE negocio, lista para usar.
 *
 * Sólo el restaurante la tiene (`rubroConConfigPos`). Si un backend la mandara
 * en otro rubro (un negocio que cambió de rubro después de elegir algo), el POS
 * sigue siendo el de siempre: la farmacia arma su catálogo aparte y el salón de
 * belleza cobra con sus propinas y sus vales, y ninguno de los dos pidió esto.
 */
export function configPosDe(negocio: Pick<SesionNegocio, "pos" | "tipoNegocio"> | null | undefined): ConfigPos {
  if (!rubroConConfigPos(negocio?.tipoNegocio)) return normalizarConfigPos(null);
  return normalizarConfigPos(negocio?.pos);
}

// ── Lo propio de cada cajero (18-nov) ─────────────────────────────────────

/**
 * Lo que cada cajero puede cambiar PARA ÉL (R3), en el orden fijo en que lo
 * manda el backend en `propios`. «Controlar la plata de los repartidores» no
 * está a propósito: es un control de plata sobre la caja, no una comodidad (si
 * cada cajero lo apagara, el cierre no cuadraría). Los billetes de Configuración
 * › Caja, tampoco: los dos quedan del negocio, sólo el dueño.
 */
export const CAMPOS_PROPIOS = ["vista", "cobro", "iconos", "filtros", "ordenCategorias", "imprimirPlataformas"] as const;
export type CampoPropio = (typeof CAMPOS_PROPIOS)[number];

/**
 * Lo que se manda a `PATCH /pos/config/mia`. Por campo: ausente no se toca, un
 * valor queda propio (`ordenCategorias: []` también: «mi orden es el de
 * siempre») y `null` lo vuelve a lo que eligió el negocio.
 */
export type CambiosMiConfigPos = { [K in CampoPropio]?: ConfigPos[K] | null };

/** `GET /pos/config/mia`: lo que ve este usuario y qué parte es suya. */
export interface MiConfigPos {
  /** La configuración efectiva: lo del negocio con lo propio encima. */
  config: ConfigPos;
  /** Lo que este usuario cambió para él (vacío: ve todo como lo eligió el negocio). */
  propios: CampoPropio[];
  /** Tiene `negocio.configurar`: no tiene capa propia, lo suyo es lo del negocio. */
  esDelNegocio: boolean;
}

/** Lee la respuesta de `/pos/config/mia` como `normalizarConfigPos`: lo que no se entiende no rompe nada. */
export function normalizarMiConfigPos(crudo: unknown): MiConfigPos {
  const c = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : {};
  const esDelNegocio = c.esDelNegocio === true;
  const lista = Array.isArray(c.propios) ? c.propios : [];
  return {
    config: normalizarConfigPos(c.config),
    // En el orden fijo y sin lo que esta versión no conoce: un campo que el
    // backend sume mañana no aparece como «tuyo» en una pantalla que no lo muestra.
    propios: esDelNegocio ? [] : CAMPOS_PROPIOS.filter((campo) => lista.includes(campo)),
    esDelNegocio,
  };
}

/**
 * Si lo que este usuario cambia del punto de venta es lo de TODO el negocio
 * (R2): quien tiene `negocio.configurar` (el dueño) no tiene capa propia, y lo
 * que toca —en Configuración o arrastrando una categoría en el POS— va a
 * `PATCH /pos/config`; así nunca ve en su POS algo distinto de lo que dice su
 * Configuración. Los demás escriben SIEMPRE en lo suyo (`/pos/config/mia`).
 *
 * Es la única regla: todo lo que guarda el punto de venta pregunta acá.
 */
export function configuraElNegocio(usuario: Parameters<typeof tienePermiso>[0]): boolean {
  return tienePermiso(usuario, "negocio.configurar");
}

/** Si dos órdenes de categorías dicen lo mismo (un arrastre que volvió a su lugar no se guarda). */
export function mismoOrden(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Si dos configuraciones dicen lo mismo (para no reescribir la sesión en cada chequeo). */
export function mismaConfigPos(a: ConfigPos, b: ConfigPos): boolean {
  return (
    a.vista === b.vista &&
    a.cobro === b.cobro &&
    a.iconos === b.iconos &&
    a.filtros === b.filtros &&
    a.billetesAlAbrir === b.billetesAlAbrir &&
    a.billetesAlCerrar === b.billetesAlCerrar &&
    a.imprimirPlataformas === b.imprimirPlataformas &&
    a.rendirRepartidores === b.rendirRepartidores &&
    a.ordenCategorias.length === b.ordenCategorias.length &&
    a.ordenCategorias.every((id, i) => id === b.ordenCategorias[i])
  );
}

/**
 * Las categorías en el orden que eligió el dueño. Las que no están en la lista
 * (una categoría nueva, creada después de ordenar) van después, en el orden en
 * que llegan: así aparecen igual, sin que nadie tenga que volver a ordenar. Lo
 * de la lista que ya no existe (una categoría borrada) no deja hueco.
 *
 * Sin orden elegido devuelve el MISMO arreglo: el POS de siempre ni se entera.
 */
export function ordenarCategorias<T extends { id: number }>(categorias: T[], orden: readonly number[]): T[] {
  if (orden.length === 0) return categorias;
  const posicion = new Map(orden.map((id, i) => [id, i]));
  // `sort` es estable: las que no están en la lista conservan entre sí el orden de llegada.
  return [...categorias].sort(
    (a, b) => (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
