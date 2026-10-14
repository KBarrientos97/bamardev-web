import type { FormaPago } from "../types";

/**
 * Por qué no se puede cobrar con `nombre` ("Efectivo", "QR").
 *
 * Con la lista VACÍA el problema no es del negocio: las formas de pago no se
 * pudieron leer (sin señal y sin la copia guardada, o el pedido falló). Antes
 * decía "el negocio no tiene cargada la forma de pago" y mandaba al dueño a
 * revisar una configuración que estaba bien.
 */
export function formaPagoFaltante(formas: FormaPago[], nombre: string): string {
  if (formas.length === 0) {
    return "No se pudieron cargar las formas de pago. Revisá la conexión y volvé a abrir el punto de venta.";
  }
  return `El negocio no tiene cargada la forma de pago ${nombre}.`;
}
