/**
 * Los motivos del "Movimiento de efectivo" de una caja (`DialogoMovimiento`).
 * Aparte del componente para que éste sólo exporte el componente.
 */

export interface MotivoMovimiento {
  etiqueta: string;
  tipo: "INGRESO" | "EGRESO";
  /**
   * Billar: marca el movimiento como la cena del personal, para que el cierre,
   * el reporte y el Estado de resultado la cuenten aparte. Sólo lo manda
   * Supervisión del billar.
   */
  origen?: "CENA";
  /** Montos para tocar en vez de escribir (la cena casi siempre es 10, 15, 20 o 30). */
  montosRapidos?: number[];
}

/**
 * Los movimientos de efectivo que de verdad pasan en un turno. El motivo decide
 * el sentido: nadie ingresa un "pago a proveedor".
 */
export const MOTIVOS: MotivoMovimiento[] = [
  { etiqueta: "Sencillo", tipo: "INGRESO" },
  { etiqueta: "Devolución", tipo: "EGRESO" },
  { etiqueta: "Pago a proveedor", tipo: "EGRESO" },
  { etiqueta: "Retiro", tipo: "EGRESO" },
];

/**
 * El motivo de la cena del personal. Es de Supervisión del billar: el
 * administrador la registra sobre la caja de la cajera (24-oct-2026).
 */
export const MOTIVO_CENA: MotivoMovimiento = {
  etiqueta: "Cena",
  tipo: "EGRESO",
  origen: "CENA",
  montosRapidos: [10, 15, 20, 30],
};
