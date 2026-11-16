import { estiloDePlataforma } from "../lib/pedidosPlataforma/marca";
import { NOMBRE_PLATAFORMA, type Plataforma } from "../lib/pedidosPlataforma/tipos";

/**
 * La marca de un pedido de Yango o PedidosYa (PLAN-PEDIDOS-PLATAFORMA §10.4):
 * el nombre siempre, con el tono de la plataforma de la paleta única de fondo.
 * La misma en «Ventas del turno», en Supervisión y en el POS.
 */
export default function MarcaPlataforma({
  plataforma,
  className = "",
}: {
  plataforma: Plataforma;
  className?: string;
}) {
  return (
    <span
      data-plataforma={plataforma}
      style={estiloDePlataforma(plataforma)}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${className}`}
    >
      <span aria-hidden="true">🛵</span>
      {NOMBRE_PLATAFORMA[plataforma] ?? plataforma}
    </span>
  );
}
