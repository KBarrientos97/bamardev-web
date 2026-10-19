import { api } from "../../lib/api";
import type { Producto, ProductoInput } from "../../types";

/**
 * Guarda la edición de un artículo, también cuando se lo pasa a combo.
 *
 * El backend toma la cantidad a ofrecer de un combo sólo si el artículo YA era
 * combo antes del PATCH, a propósito (producto.service update, 9-oct): así nadie
 * carga stock sin movimiento convirtiendo un producto y volviéndolo atrás. Al
 * convertirlo, el formulario decía "guardado" pero el combo quedaba en 0 y no se
 * podía vender hasta editarlo otra vez.
 *
 * Así que la conversión va en dos pasos: el primer PATCH lo vuelve combo y el
 * segundo, igual, fija la cantidad. Repetirlo no cambia nada más: la receta se
 * reemplaza por la misma y la cantidad es absoluta. Es lo que hace la app
 * (`EdicionArticulo.kt`, 15-oct). Editar un combo que ya lo era va en uno solo.
 */
export async function actualizarConCombo(
  producto: Pick<Producto, "id" | "tipoProducto">,
  input: ProductoInput,
): Promise<void> {
  await api.actualizarProducto(producto.id, input);
  if (input.stockInicial != null && producto.tipoProducto !== "COMPUESTO") {
    await api.actualizarProducto(producto.id, input);
  }
}
