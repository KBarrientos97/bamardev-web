import type { PartesInsumo } from "../../types";

/**
 * Lo que viaja con el backend para la receta del plato y el tablero «Costos de
 * platos» (CONTRATO-recetas-plato §2.3 y §2.5). Los nombres de campo son los
 * del backend.
 *
 * Toda la plata llega en `null` a quien no tiene `costos.ver`: la pantalla no
 * dibuja costo ni ganancia en ese caso (un «Bs 0,00» se leería como que no
 * cuesta nada).
 *
 * «Receta» a secas ya es la receta médica de la farmacia
 * (`DetalleVentaInput.receta`): lo de acá es la receta del PLATO.
 */

/**
 * Dónde va cada renglón:
 *  · FIJO: lo que lleva siempre (aceite, gas, salsas, la bandeja);
 *  · GUARNICION: sale completa en cada venta, el cliente puede quitar una o
 *    pedirla «puro»;
 *  · PRESA: las presas del pollo (a lo sumo un renglón por plato).
 */
export type GrupoReceta = "FIJO" | "GUARNICION" | "PRESA";

/** Un renglón de la receta, como lo devuelve `GET /recetas-plato/:platoId`. */
export interface LineaRecetaPlato {
  insumoId: number;
  nombre: string;
  grupo: GrupoReceta;
  /** Cuántas porciones del insumo lleva un plato (hasta 3 decimales). */
  porciones: number;
  /** Sólo en la guarnición: se puede pedir «puro» (pura papa). */
  puro: boolean;
  /** Cómo se llama lo que sirve el insumo, en singular: «porción», «presa»… */
  porcionNombre: string | null;
  partes: PartesInsumo | null;
  /** «Lo cuento» (true) / «lo estimo» (false). */
  seCuenta: boolean;
  /** Lo que cuesta una porción, sin redondear. Null sin `costos.ver` o sin compras. */
  costoPorcion: number | null;
  /** `round2(costoPorcion × porciones)`. Null sin `costos.ver` o sin compras. */
  costo: number | null;
}

/** `GET /recetas-plato/:platoId` (y lo que devuelve el `PUT`). */
export interface RecetaPlato {
  platoId: number;
  nombre: string;
  /** El precio de venta; null si quien pregunta no ve los precios. */
  precio: number | null;
  conReceta: boolean;
  lineas: LineaRecetaPlato[];
  /** Con la guarnición completa: la suma de los renglones ya redondeados. */
  costo: number | null;
  costoMinimo: number | null;
  costoMaximo: number | null;
  /** Para cuántos platos alcanza el stock de lo que se cuenta; null si nada se cuenta. Puede ser ≤ 0. */
  alcanza: number | null;
  /** El insumo que limita `alcanza`. */
  limite: string | null;
  /** Los insumos de la receta que todavía no tienen costo (no entran en la cuenta). */
  sinCosto: string[];
}

/** Un renglón como se manda al guardar. */
export interface LineaRecetaInput {
  insumoId: number;
  porciones: number;
  grupo: GrupoReceta;
  puro: boolean;
}

/**
 * `PUT /recetas-plato/:platoId`: reemplaza la receta entera. Con `conReceta:
 * false` guarda los renglones pero el plato vuelve a ser un Elaborado común
 * (el costo queda como estaba).
 */
export interface GuardarRecetaInput {
  conReceta: boolean;
  lineas: LineaRecetaInput[];
}

/** `GET /recetas-plato/insumos`: los insumos vigentes para armar recetas, por nombre. */
export interface InsumoReceta {
  id: number;
  nombre: string;
  /** La unidad base del insumo (Kilogramo, Litro, Unidad). */
  unidad: string | null;
  porcionNombre: string | null;
  /** Tiene su rinde completo: recién entonces entra en una receta. */
  configurado: boolean;
  seCuenta: boolean;
  partes: PartesInsumo | null;
  /** Null sin `costos.ver`, sin compras o sin rinde. */
  costoPorcion: number | null;
}

/** Un plato cuyo costo cambió desde la última vez que se miró. */
export interface AvisoPlato {
  id: number;
  nombre: string;
  /** Lo que costaba al empezar la ventana del aviso. */
  antes: number;
  ahora: number;
  precio: number | null;
}

/** Un insumo que movió el costo de esos platos (una compra o un cambio de rinde). */
export interface CausaAviso {
  insumoId: number;
  nombre: string;
  compraUnidad: string | null;
  compraContenido: number | null;
  /** La unidad base: los costos van por esa unidad. */
  unidad: string | null;
  costoAntes: number;
  costoAhora: number;
}

/** Un plato con receta en el tablero. */
export interface CostoDePlato {
  id: number;
  nombre: string;
  precio: number | null;
  costo: number | null;
  alcanza: number | null;
  limite: string | null;
  sinCosto: string[];
}

/** Un elaborado que todavía no tiene receta (su costo sigue siendo a mano). */
export interface PlatoSinReceta {
  id: number;
  nombre: string;
  precio: number | null;
}

/** Uno de los insumos que menos quedan. */
export interface InsumoQueQueda {
  id: number;
  nombre: string;
  seCuenta: boolean;
  /** En la unidad base. */
  stock: number;
  unidad: string | null;
  /** Para cuántas porciones alcanza ese stock; null sin rinde. */
  porciones: number | null;
  porcionNombre: string | null;
}

/** `GET /recetas-plato/costos` (`costos.ver`). */
export interface TableroCostos {
  /** Desde qué % de cambio se avisa (Configuración › Inventario y stock). */
  avisoPct: number;
  /** Cuándo se tocó «Ya lo vi» por última vez (ISO); null = nunca. */
  vistoEn: string | null;
  aviso: { platos: AvisoPlato[]; causas: CausaAviso[] };
  platos: CostoDePlato[];
  sinReceta: PlatoSinReceta[];
  insumos: InsumoQueQueda[];
}

/** `GET /recetas-plato/:platoId/historial`: hasta 12 puntos, del más viejo al de hoy. */
export interface HistorialCostoPlato {
  puntos: { fecha: string; costo: number }[];
}
