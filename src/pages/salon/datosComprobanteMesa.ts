import type { Mesa } from "../../types/salon";
import { consumoDeMesa, subtotalItem } from "./logicaSalon";

/** Lo que va en el papel de una mesa. Separado de la vista para poder probarlo. */
export interface DatosComprobanteMesa {
  esRecibo: boolean;
  mesaTitulo: string;
  zona: string;
  comensales: number;
  meseroNombre: string | null;
  fecha: string | null;
  comprobante: string | null;
  lineas: { nombre: string; cantidad: number; precio: number; total: number }[];
  total: number;
  pagos: { formaPago: string; monto: number; recibido: number; entregado: number }[];
}

/**
 * Arma el papel de una mesa. Port de `ComprobanteMesaDialog.Datos.de` (app).
 *
 * Es recibo si la mesa ya se cobró y cuenta si todavía no. No se elige desde
 * afuera a propósito: el cobro es lo único que sabe si esa plata entró, y dejar
 * que cada pantalla lo decida es cómo se termina imprimiendo un "RECIBO DE
 * PAGO" de algo que nadie pagó.
 *
 * Las líneas anuladas no salen (viajan aparte, en `anulados`): lo que se sacó
 * de la cuenta no se cobra, y verlo en el papel del cliente sólo abre una
 * discusión sobre algo que ya se resolvió.
 */
export function datosComprobanteMesa(mesa: Mesa): DatosComprobanteMesa {
  const cobro = mesa.cobro ?? null;
  return {
    esRecibo: cobro != null,
    mesaTitulo: mesa.nombre || mesa.codigo,
    zona: mesa.zonaNombre,
    comensales: mesa.comensales,
    meseroNombre: mesa.meseroNombre ?? null,
    fecha: cobro?.fecha || mesa.abiertaEn || null,
    comprobante: mesa.comprobante ?? null,
    lineas: (mesa.comandas ?? []).flatMap((c) =>
      c.items.map((i) => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio: i.precio,
        total: subtotalItem(i),
      })),
    ),
    // El total del cobro manda cuando ya se cobró: es el que quedó en la venta
    // y en el arqueo.
    total: cobro?.total ?? consumoDeMesa(mesa),
    pagos: cobro?.pagos ?? [],
  };
}
