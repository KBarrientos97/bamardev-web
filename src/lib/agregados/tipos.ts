/**
 * Productos con agregados (toppings, extras), PLAN-AGREGADOS §7. El contrato
 * JSON es el del backend (`src/agregados`): lo que el POS dibuja, lo que se
 * manda a vender y lo que Inventario → «Agregados» edita.
 */

/** Una opción de un grupo: un producto que se agrega (un topping). */
export interface OpcionCatalogo {
  productoId: number;
  nombre: string;
  /** El precio vigente en el local (el de la sucursal si tiene uno propio). */
  precio: number;
  icono: string | null;
}

/** Un grupo ya resuelto para vender: lo que dice la hoja del POS. */
export interface GrupoCatalogo {
  id: number;
  nombre: string;
  /** Los incluidos de fábrica del grupo; cada producto trae los suyos en `productos`. */
  incluidos: number;
  /** Precio fijo del extra; null = se cobra el precio de cada opción. */
  precioExtra: number | null;
  /** Tope de agregados por unidad; null = sin tope. */
  maximo: number | null;
  opciones: OpcionCatalogo[];
}

/** `GET /agregados/catalogo`: con el ajuste apagado viene `activo: false` y vacío. */
export interface CatalogoAgregados {
  activo: boolean;
  grupos: GrupoCatalogo[];
  /** Sólo los productos que llevan grupo. `incluidos` ya trae el override de producto o categoría. */
  productos: { productoId: number; grupos: { grupoId: number; incluidos: number }[] }[];
}

/** Lo que viaja en cada línea de `POST /ventas` y de `POST /pedidos-plataforma`. */
export interface AgregadoInput {
  productoId: number;
  /** Por unidad del vaso (doble Oreo = 2). El orden del arreglo es el de elección. */
  cantidad: number;
  grupoId: number;
  /**
   * Informativo: lo que el equipo cobró por unidad de este extra. Sólo lo mira
   * el backend en una venta de la cola sin señal.
   */
  precio?: number;
}

/** Lo elegido en la hoja para UNA unidad del vaso, ya con su grupo. */
export interface AgregadoElegido {
  grupoId: number;
  productoId: number;
  cantidad: number;
}

/** Un grupo editable de Inventario → «Agregados» (`GET /agregados/grupos`). */
export interface GrupoAgregados {
  id: number;
  nombre: string;
  incluidos: number;
  precioExtra: number | null;
  maximo: number | null;
  activo: boolean;
  orden: number;
  opciones: { productoId: number; nombre: string; precio: number; icono: string | null; orden: number }[];
  asignaciones: {
    id: number;
    categoriaId: number | null;
    categoria: string | null;
    productoId: number | null;
    producto: string | null;
    incluidos: number | null;
  }[];
}

/** Body de `POST` y `PATCH /agregados/grupos`: `opciones` y `asignaciones` reemplazan lo guardado. */
export interface GuardarGrupoInput {
  nombre?: string;
  incluidos?: number;
  precioExtra?: number | null;
  maximo?: number | null;
  activo?: boolean;
  orden?: number;
  opciones?: { productoId: number }[];
  asignaciones?: { categoriaId?: number; productoId?: number; incluidos?: number | null }[];
}

/** `GET` y `PATCH /agregados/config`. */
export interface ConfigAgregados {
  usaAgregados: boolean;
}
