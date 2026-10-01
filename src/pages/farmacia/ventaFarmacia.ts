import { createContext, useContext } from "react";
import type { Producto, RecetaVenta } from "../../types";
import type { Carrito } from "../pos/useCarrito";

/**
 * La venta en curso de una farmacia, compartida por todas las pantallas.
 *
 * En un restaurante el carrito vive adentro del POS y está bien: nadie sale de
 * ahí con un pedido a medio cargar. En el mostrador de una farmacia sí: el cliente
 * pregunta por el omeprazol, quien atiende va a Buscar medicamento a comparar
 * laboratorios o a ver un lote, y cuando vuelve la venta tiene que seguir ahí.
 * Por eso se levanta al nivel de la app (ver `VentaFarmaciaProvider.tsx`) y el
 * POS la usa en lugar de la suya.
 */
export interface VentaFarmacia {
  carrito: Carrito;
  /**
   * Suma una unidad a la venta y lo avisa. Si el remedio pide receta
   * (`pideConfirmacion`), primero pregunta; si no queda stock, no lo suma y
   * dice por qué.
   */
  agregar: (p: Producto) => void;
  /**
   * Deja el renglón en esa cantidad (la farmacia vende por unidad: un blíster
   * de 10 son 10). Menos de 1 lo saca. Más de lo que hay lo deja en lo que hay
   * y lo avisa. No pregunta por la receta: ya se preguntó al agregarlo.
   */
  fijarCantidad: (p: Producto, cantidad: number) => void;
  /**
   * La receta de cada renglón controlado, por producto. Viaja con la venta y
   * el servidor la asienta en el libro de psicotrópicos o estupefacientes.
   */
  recetas: ReadonlyMap<number, RecetaVenta>;
  /** Abre los datos de la receta de un renglón, para cargarlos o corregirlos. */
  pedirReceta: (p: Producto) => void;
}

export const ContextoVentaFarmacia = createContext<VentaFarmacia | null>(null);

/** La venta de la farmacia, o null fuera de ella (un restaurante). */
export function useVentaFarmacia(): VentaFarmacia | null {
  return useContext(ContextoVentaFarmacia);
}

/**
 * Si se puede vender ahora: habilitado, que la sucursal lo venda y con stock.
 *
 * Lo agotado se sigue MOSTRANDO en las dos pantallas —"hoy no tengo, te lo
 * consigo" es una venta— pero no se puede sumar a la venta.
 */
export function sePuedeVender(p: Producto): boolean {
  if (!p.habilitado || p.disponible === false) return false;
  if (p.tipoProducto !== "ALMACENABLE") return true;
  return p.stockTotal > 0;
}
